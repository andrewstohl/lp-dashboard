from fastapi import APIRouter, HTTPException, Depends
from typing import Any
import logging
import os
from backend.services.debank import get_debank_service, DeBankService
from backend.services.coingecko import get_coingecko_service, CoinGeckoService
from backend.services.thegraph import TheGraphService
from backend.services.gmx_subgraph import GMXSubgraphService
from backend.core.errors import (
    DeBankError, RateLimitError, InvalidAddressError, ServiceUnavailableError
)

logger = logging.getLogger(__name__)
router = APIRouter()

def get_thegraph_service() -> TheGraphService:
    """Dependency for The Graph service"""
    api_key = os.getenv("THEGRAPH_API_KEY", "")
    return TheGraphService(api_key)

def get_gmx_subgraph_service() -> GMXSubgraphService:
    """Dependency for GMX subgraph service"""
    return GMXSubgraphService()


@router.get("/wallet/{address}")
async def get_wallet_positions(
    address: str,
    service: DeBankService = Depends(get_debank_service)
) -> dict[str, Any]:
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
    thegraph: TheGraphService = Depends(get_thegraph_service),
    gmx_subgraph: GMXSubgraphService = Depends(get_gmx_subgraph_service)
) -> dict[str, Any]:
    """
    Get enriched ledger data for a wallet.
    
    Data Sources:
    - DeBank: Position discovery (find position IDs) + Perp positions
    - Uniswap Subgraph: LP position details (real-time, accurate)
    - CoinGecko: Historical prices for initial deposit USD values
    """
    try:
        # STEP 1: Use DeBank for LP position discovery only
        positions_result = await debank.get_wallet_positions(address)
        positions = positions_result.get("positions", [])
        
        # Only need LP positions from DeBank (for discovery)
        lp_positions_debank = [p for p in positions if "pool_name" in p]
        
        # Get GMX rewards from DeBank
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
                coingecko,
                owner_address=address
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
        
        # STEP 3: Get Perp positions directly from GMX Subgraph
        perp_positions = await gmx_subgraph.get_full_positions(address)
        
        # Get realized P&L from GMX subgraph (filtered to trades after LP mint)
        gmx_pnl = await gmx_subgraph.get_realized_pnl(address, earliest_position_mint)
        
        # Get funding info from DeBank (still useful for funding tracking)
        total_perp_margin = sum(p.get("margin_token", {}).get("value_usd", 0) for p in perp_positions)
        perp_history = {"realized_pnl": 0, "current_margin": total_perp_margin, "total_funding_claimed": 0}
        if earliest_position_mint:
            debank_history = await debank.get_perp_realized_pnl(address, earliest_position_mint, total_perp_margin)
            perp_history["total_funding_claimed"] = debank_history.get("total_funding_claimed", 0)
        
        # Use GMX subgraph for realized P&L (more accurate)
        perp_history["realized_pnl"] = gmx_pnl.get("total_realized_pnl", 0)
        
        # Allocate funding proportionally to each position
        for perp in perp_positions:
            margin_value = perp.get("margin_token", {}).get("value_usd", 0)
            proportion = margin_value / total_perp_margin if total_perp_margin > 0 else 0
            perp["funding_rewards_usd"] = perp_history.get("total_funding_claimed", 0) * proportion
        
        # Calculate total gas fees
        gmx_txs = await debank.get_gmx_transactions(address)
        lp_gas = sum(lp.get("gas_fees_usd", 0) for lp in enriched_lp_positions)
        gmx_gas = gmx_txs.get("total_gas_usd", 0)
        
        return {
            "status": "success",
            "data": {
                "wallet": address,
                "lp_positions": enriched_lp_positions,
                "perp_positions": perp_positions,
                "gmx_rewards": gmx_rewards,
                "perp_history": {
                    "realized_pnl": perp_history.get("realized_pnl", 0),
                    "current_margin": perp_history.get("current_margin", 0),
                    "total_funding_claimed": perp_history.get("total_funding_claimed", 0)
                },
                "total_gas_fees_usd": lp_gas + gmx_gas,
                "data_sources": {
                    "lp_positions": "uniswap_subgraph",
                    "perp_positions": "gmx_subgraph",
                    "historical_prices": "uniswap_subgraph"
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
) -> dict[str, Any]:
    """Get raw positions without processing (for debugging)"""
    try:
        return await service.get_wallet_positions(address)
    except DeBankError as e:
        raise HTTPException(status_code=500, detail={"error_code": e.code, "message": e.user_msg})
