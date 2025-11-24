from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
import logging
from backend.services.debank import get_debank_service, DeBankService
from backend.services.coingecko import get_coingecko_service, CoinGeckoService
from backend.core.errors import (
    DeBankError, RateLimitError, InvalidAddressError, ServiceUnavailableError
)

logger = logging.getLogger(__name__)
router = APIRouter()


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
    coingecko: CoinGeckoService = Depends(get_coingecko_service)
) -> Dict[str, Any]:
    """
    Get enriched ledger data for a wallet including:
    - Current positions (LP + Perp)
    - Initial deposit values with historical prices
    - Transaction history and gas fees
    - GMX rewards/funding
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
        for lp in lp_positions:
            # Get transaction history for this LP
            uniswap_txs = await debank.get_uniswap_transactions(address, lp.get("pool_address", ""))
            
            # Calculate NET deposits (deposits - withdrawals) with historical prices
            initial_deposits = {"token0": {"amount": 0, "value_usd": 0}, "token1": {"amount": 0, "value_usd": 0}}
            
            # Process deposits (mint + increaseLiquidity) - these are "sends"
            all_deposit_txs = uniswap_txs["mint_transactions"] + uniswap_txs["increase_transactions"]
            
            for tx in all_deposit_txs:
                timestamp = int(tx.get("timestamp", 0))
                sends = tx.get("sends", [])
                
                for send in sends:
                    token_id = send.get("token_id", "").lower()
                    amount = float(send.get("amount", 0))
                    
                    # Get historical price
                    hist_price = await coingecko.get_historical_price(token_id, timestamp)
                    
                    # Match to token0 or token1
                    if token_id == lp["token0"]["address"].lower():
                        initial_deposits["token0"]["amount"] += amount
                        if hist_price:
                            initial_deposits["token0"]["value_usd"] += amount * hist_price
                    elif token_id == lp["token1"]["address"].lower():
                        initial_deposits["token1"]["amount"] += amount
                        if hist_price:
                            initial_deposits["token1"]["value_usd"] += amount * hist_price
            
            # Process withdrawals (decreaseLiquidity + multicall/collect) - these are "receives" from pool
            # Multicall often combines decreaseLiquidity + collect operations
            all_withdrawal_txs = uniswap_txs["decrease_transactions"] + uniswap_txs["collect_transactions"]
            
            for tx in all_withdrawal_txs:
                timestamp = int(tx.get("timestamp", 0))
                receives = tx.get("receives", [])
                
                for receive in receives:
                    token_id = receive.get("token_id", "").lower()
                    amount = float(receive.get("amount", 0))
                    
                    # Get historical price at withdrawal time
                    hist_price = await coingecko.get_historical_price(token_id, timestamp)
                    
                    # Subtract from initial deposits
                    if token_id == lp["token0"]["address"].lower():
                        initial_deposits["token0"]["amount"] -= amount
                        if hist_price:
                            initial_deposits["token0"]["value_usd"] -= amount * hist_price
                    elif token_id == lp["token1"]["address"].lower():
                        initial_deposits["token1"]["amount"] -= amount
                        if hist_price:
                            initial_deposits["token1"]["value_usd"] -= amount * hist_price
            
            # Calculate claimed fees from collect transactions
            claimed_fees = {"token0": 0, "token1": 0, "total": 0}
            for tx in uniswap_txs["collect_transactions"]:
                receives = tx.get("receives", [])
                for receive in receives:
                    token_id = receive.get("token_id", "").lower()
                    amount = float(receive.get("amount", 0))
                    
                    # This is a simplification - in reality we'd need to determine
                    # if this is a fee claim vs liquidity removal
                    # For now, we'll note that no claims have been made
                    pass
            
            enriched_lp = {
                **lp,
                "initial_deposits": initial_deposits,
                "initial_total_value_usd": initial_deposits["token0"]["value_usd"] + initial_deposits["token1"]["value_usd"],
                "claimed_fees": claimed_fees,
                "gas_fees_usd": uniswap_txs["total_gas_usd"],
                "transaction_count": len(all_deposit_txs)
            }
            enriched_lp_positions.append(enriched_lp)
        
        # Process perp positions with GMX data
        gmx_txs = await debank.get_gmx_transactions(address)
        
        # Allocate GMX rewards to each perp position proportionally
        total_perp_value = sum(p.get("margin_token", {}).get("value_usd", 0) for p in perp_positions)
        
        enriched_perp_positions = []
        for perp in perp_positions:
            perp_value = perp.get("margin_token", {}).get("value_usd", 0)
            proportion = perp_value / total_perp_value if total_perp_value > 0 else 0
            
            # Allocate rewards proportionally
            allocated_rewards = gmx_rewards["total_value_usd"] * proportion
            
            enriched_perp = {
                **perp,
                "initial_margin_usd": perp.get("margin_token", {}).get("value_usd", 0),
                "funding_rewards_usd": allocated_rewards
            }
            enriched_perp_positions.append(enriched_perp)
        
        return {
            "status": "success",
            "data": {
                "wallet": address,
                "lp_positions": enriched_lp_positions,
                "perp_positions": enriched_perp_positions,
                "gmx_rewards": gmx_rewards,
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
