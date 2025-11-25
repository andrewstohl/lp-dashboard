from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
import logging
import os
from backend.services.debank import get_debank_service, DeBankService
from backend.services.coingecko import get_coingecko_service, CoinGeckoService
from backend.services.thegraph import TheGraphService
from backend.core.errors import (
    DeBankError, RateLimitError, InvalidAddressError, ServiceUnavailableError
)

logger = logging.getLogger(__name__)
router = APIRouter()

def get_thegraph_service() -> TheGraphService:
    """Dependency for The Graph service"""
    api_key = os.getenv("THEGRAPH_API_KEY", "")
    return TheGraphService(api_key)


@router.get("/wallet/{address}")
async def get_wallet_positions(
    address: str,
    service: DeBankService = Depends(get_debank_service)
) -> Dict[str, Any]:
    """Get all positions for a wallet (uses DeBank for discovery)"""
    try:
        result = await service.get_wallet_positions(address)
        return {"status": "success", "data": result}
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail={"error_code": e.code, "message": e.user_msg, "retry_after": e.retry_after})
    except InvalidAddressError as e:
        raise HTTPException(status_code=400, detail={"error_code": e.code, "message": e.user_msg})
    except ServiceUnavailableError as e:
        raise HTTPException(status_code=503, detail={"error_code": e.code, "message": e.user_msg})
    except Exception as e:
        logger.exception(f"Unexpected error for {address}")
        raise HTTPException(status_code=500, detail={"error_code": "UNKNOWN", "message": "An unexpected error occurred."})


@router.get("/wallet/{address}/ledger")
async def get_wallet_ledger(
    address: str,
    debank: DeBankService = Depends(get_debank_service),
    coingecko: CoinGeckoService = Depends(get_coingecko_service),
    thegraph: TheGraphService = Depends(get_thegraph_service)
) -> Dict[str, Any]:
    """
    Get enriched ledger data for a wallet.
    
    Data Sources:
    - DeBank: Position discovery (find position IDs) + Perp positions
    - Uniswap Subgraph: LP position details (real-time, accurate)
    - CoinGecko: Historical prices for initial deposit USD values
    """
    try:
        # STEP 1: Use DeBank for position discovery
        positions_result = await debank.get_wallet_positions(address)
        positions = positions_result.get("positions", [])
        
        # Separate LP and Perp positions
        lp_positions_debank = [p for p in positions if "pool_name" in p]
        perp_positions = [p for p in positions if p.get("type") == "perpetual"]
        
        # Get GMX rewards
        gmx_rewards = await debank.get_gmx_rewards(address)
        
        # STEP 2: Enrich LP positions using Uniswap Subgraph (real-time data)
        enriched_lp_positions = []
        earliest_position_mint = None
        
        for lp_debank in lp_positions_debank:
            position_index = lp_debank.get("position_index", "")
            
            if not position_index:
                logger.warning(f"LP position missing position_index, skipping")
                continue
            
            # Get full position data from Uniswap subgraph
            lp_subgraph = await thegraph.get_position_with_historical_values(
                position_index, 
                coingecko
            )
            
            if not lp_subgraph:
                logger.warning(f"Could not get subgraph data for position {position_index}")
                continue
            
            # Track earliest position for perp history filtering
            mint_ts = lp_subgraph.get("position_mint_timestamp", 0)
            if mint_ts > 0:
                if earliest_position_mint is None or mint_ts < earliest_position_mint:
                    earliest_position_mint = mint_ts
            
            # Get unclaimed fees from DeBank (subgraph doesn't have real-time fees)
            unclaimed_fees_usd = lp_debank.get("unclaimed_fees_usd", 0)
            reward_tokens = lp_debank.get("reward_tokens", [])
            
            # Build enriched position combining subgraph + DeBank data
            enriched_lp = {
                "pool_name": lp_subgraph["pool_name"],
                "pool_address": lp_subgraph["pool_address"],
                "position_index": position_index,
                "chain": lp_subgraph["chain"],
                "fee_tier": lp_subgraph["fee_tier"],
                "in_range": lp_subgraph["in_range"],
                "token0": lp_subgraph["token0"],
                "token1": lp_subgraph["token1"],
                "total_value_usd": lp_subgraph["total_value_usd"],
                "unclaimed_fees_usd": unclaimed_fees_usd,
                "reward_tokens": reward_tokens,
                "initial_deposits": lp_subgraph["initial_deposits"],
                "initial_total_value_usd": lp_subgraph.get("initial_total_value_usd", 0),
                "claimed_fees": lp_subgraph["collected_fees"],
                "position_mint_timestamp": mint_ts,
                "gas_fees_usd": lp_subgraph.get("gas_fees_usd", 0),
                "transaction_count": lp_subgraph.get("transaction_count", 0)
            }
            enriched_lp_positions.append(enriched_lp)
        
        # STEP 3: Process Perp positions (still using DeBank until Phase 2)
        # Get GMX transactions for gas
        gmx_txs = await debank.get_gmx_transactions(address)
        
        # Calculate actual current margin from DeBank position snapshot
        total_perp_margin = sum(p.get("margin_token", {}).get("value_usd", 0) for p in perp_positions)
        
        # Get perp realized P&L since LP position was opened
        perp_history = {"realized_pnl": 0, "current_margin": 0, "total_funding_claimed": 0}
        if earliest_position_mint:
            perp_history = await debank.get_perp_realized_pnl(address, earliest_position_mint, total_perp_margin)
        
        enriched_perp_positions = []
        for perp in perp_positions:
            margin_value = perp.get("margin_token", {}).get("value_usd", 0)
            proportion = margin_value / total_perp_margin if total_perp_margin > 0 else 0
            
            # Allocate current margin from history proportionally
            initial_margin = perp_history.get("current_margin", 0) * proportion
            
            # Allocate funding proportionally
            funding = perp_history.get("total_funding_claimed", 0) * proportion
            
            enriched_perp = {
                **perp,
                "initial_margin_usd": initial_margin,
                "funding_rewards_usd": funding
            }
            enriched_perp_positions.append(enriched_perp)
        
        # Calculate total gas fees
        lp_gas = sum(lp.get("gas_fees_usd", 0) for lp in enriched_lp_positions)
        gmx_gas = gmx_txs.get("total_gas_usd", 0)
        
        return {
            "status": "success",
            "data": {
                "wallet": address,
                "lp_positions": enriched_lp_positions,
                "perp_positions": enriched_perp_positions,
                "gmx_rewards": gmx_rewards,
                "perp_history": {
                    "realized_pnl": perp_history.get("realized_pnl", 0),
                    "current_margin": perp_history.get("current_margin", 0),
                    "total_funding_claimed": perp_history.get("total_funding_claimed", 0)
                },
                "total_gas_fees_usd": lp_gas + gmx_gas,
                "data_sources": {
                    "lp_positions": "uniswap_subgraph",
                    "perp_positions": "debank",
                    "historical_prices": "coingecko"
                }
            }
        }
        
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail={"error_code": e.code, "message": e.user_msg})
    except InvalidAddressError as e:
        raise HTTPException(status_code=400, detail={"error_code": e.code, "message": e.user_msg})
    except ServiceUnavailableError as e:
        raise HTTPException(status_code=503, detail={"error_code": e.code, "message": e.user_msg})
    except Exception as e:
        logger.exception(f"Ledger error for {address}: {e}")
        raise HTTPException(status_code=500, detail={"error_code": "UNKNOWN", "message": str(e)})


@router.get("/wallet/{address}/raw")
async def get_wallet_positions_raw(
    address: str,
    service: DeBankService = Depends(get_debank_service)
) -> Dict[str, Any]:
    """Get raw positions without processing (for debugging)"""
    try:
        return await service.get_wallet_positions(address)
    except DeBankError as e:
        raise HTTPException(status_code=500, detail={"error_code": e.code, "message": e.user_msg})
