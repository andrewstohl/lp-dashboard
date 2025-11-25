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
    """Get all positions for a wallet"""
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
    Get enriched ledger data for a wallet including:
    - Current positions (LP + Perp) with VERIFIED fee tiers
    - Initial deposit values with historical prices
    - Transaction history filtered by position mint date
    - GMX rewards/funding and REALIZED P&L
    """
    try:
        # Get current positions
        positions_result = await debank.get_wallet_positions(address)
        positions = positions_result.get("positions", [])
        
        # Separate LP and Perp positions
        lp_positions = [p for p in positions if "pool_name" in p]
        perp_positions = [p for p in positions if p.get("type") == "perpetual"]
        
        # Get GMX rewards
        gmx_rewards = await debank.get_gmx_rewards(address)
        
        # Process each LP position
        enriched_lp_positions = []
        earliest_position_mint = None
        
        for lp in lp_positions:
            pool_address = lp.get("pool_address", "")
            position_index = lp.get("position_index", "")
            
            # Get VERIFIED fee tier from The Graph
            fee_tier = await thegraph.get_pool_fee_tier(pool_address)
            if fee_tier is None:
                fee_tier = 0
                logger.warning(f"Could not get fee tier for pool {pool_address}")
            
            # Get position mint timestamp
            position_mint_timestamp = await thegraph.get_position_mint_timestamp(position_index)
            if position_mint_timestamp is None:
                position_mint_timestamp = 0
                logger.warning(f"Could not get mint timestamp for position {position_index}")
            
            # Track earliest position for perp history filtering
            if position_mint_timestamp > 0:
                if earliest_position_mint is None or position_mint_timestamp < earliest_position_mint:
                    earliest_position_mint = position_mint_timestamp
            
            # Get transaction history for this LP
            uniswap_txs = await debank.get_uniswap_transactions(address, pool_address)
            
            # Calculate NET deposits with historical prices
            initial_deposits = {"token0": {"amount": 0, "value_usd": 0}, "token1": {"amount": 0, "value_usd": 0}}
            
            # Process deposits
            all_deposit_txs = uniswap_txs["mint_transactions"] + uniswap_txs["increase_transactions"]
            
            for tx in all_deposit_txs:
                timestamp = int(tx.get("timestamp", 0))
                
                # Only count transactions for THIS position
                if position_mint_timestamp > 0 and timestamp < position_mint_timestamp:
                    continue
                
                sends = tx.get("sends", [])
                for send in sends:
                    token_id = send.get("token_id", "").lower()
                    amount = float(send.get("amount", 0))
                    
                    hist_price = await coingecko.get_historical_price(token_id, timestamp)
                    
                    if token_id == lp["token0"]["address"].lower():
                        initial_deposits["token0"]["amount"] += amount
                        if hist_price:
                            initial_deposits["token0"]["value_usd"] += amount * hist_price
                    elif token_id == lp["token1"]["address"].lower():
                        initial_deposits["token1"]["amount"] += amount
                        if hist_price:
                            initial_deposits["token1"]["value_usd"] += amount * hist_price

            
            # Process withdrawals - also filter by position mint date
            all_withdrawal_txs = uniswap_txs["decrease_transactions"] + uniswap_txs["collect_transactions"]
            
            for tx in all_withdrawal_txs:
                timestamp = int(tx.get("timestamp", 0))
                
                if position_mint_timestamp > 0 and timestamp < position_mint_timestamp:
                    continue
                
                receives = tx.get("receives", [])
                for receive in receives:
                    token_id = receive.get("token_id", "").lower()
                    amount = float(receive.get("amount", 0))
                    
                    hist_price = await coingecko.get_historical_price(token_id, timestamp)
                    
                    if token_id == lp["token0"]["address"].lower():
                        initial_deposits["token0"]["amount"] -= amount
                        if hist_price:
                            initial_deposits["token0"]["value_usd"] -= amount * hist_price
                    elif token_id == lp["token1"]["address"].lower():
                        initial_deposits["token1"]["amount"] -= amount
                        if hist_price:
                            initial_deposits["token1"]["value_usd"] -= amount * hist_price
            
            # Calculate gas fees for this position only
            position_gas_usd = 0.0
            position_tx_count = 0
            for tx in all_deposit_txs + all_withdrawal_txs:
                timestamp = int(tx.get("timestamp", 0))
                if position_mint_timestamp > 0 and timestamp >= position_mint_timestamp:
                    position_gas_usd += float(tx.get("gas_usd", 0))
                    position_tx_count += 1
            
            # Claimed fees - not yet implemented
            claimed_fees = {"token0": 0, "token1": 0, "total": 0}
            
            enriched_lp = {
                **lp,
                "fee_tier": fee_tier,
                "position_mint_timestamp": position_mint_timestamp,
                "initial_deposits": initial_deposits,
                "initial_total_value_usd": initial_deposits["token0"]["value_usd"] + initial_deposits["token1"]["value_usd"],
                "claimed_fees": claimed_fees,
                "gas_fees_usd": position_gas_usd,
                "transaction_count": position_tx_count
            }
            enriched_lp_positions.append(enriched_lp)
        
        # Get GMX transactions for gas
        gmx_txs = await debank.get_gmx_transactions(address)
        
        # Calculate actual current margin from DeBank position snapshot (source of truth)
        total_perp_margin = sum(p.get("margin_token", {}).get("value_usd", 0) for p in perp_positions)
        
        # Get perp realized P&L since LP position was opened
        # Pass actual current margin so realized P&L calculation is correct
        perp_history = {"realized_pnl": 0, "current_margin": 0, "total_funding_claimed": 0}
        if earliest_position_mint:
            perp_history = await debank.get_perp_realized_pnl(address, earliest_position_mint, total_perp_margin)
        
        enriched_perp_positions = []
        for perp in perp_positions:
            margin_value = perp.get("margin_token", {}).get("value_usd", 0)
            proportion = margin_value / total_perp_margin if total_perp_margin > 0 else 0
            
            # Allocate current margin from history proportionally
            initial_margin = perp_history["current_margin"] * proportion
            
            # Allocate funding proportionally
            funding = perp_history["total_funding_claimed"] * proportion
            
            enriched_perp = {
                **perp,
                "initial_margin_usd": initial_margin,
                "funding_rewards_usd": funding
            }
            enriched_perp_positions.append(enriched_perp)

        
        return {
            "status": "success",
            "data": {
                "wallet": address,
                "lp_positions": enriched_lp_positions,
                "perp_positions": enriched_perp_positions,
                "gmx_rewards": gmx_rewards,
                "perp_history": {
                    "realized_pnl": perp_history["realized_pnl"],
                    "current_margin": perp_history["current_margin"],
                    "total_funding_claimed": perp_history["total_funding_claimed"]
                },
                "total_gas_fees_usd": sum(lp.get("gas_fees_usd", 0) for lp in enriched_lp_positions) + gmx_txs["total_gas_usd"]
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
