"""
Position Lifecycle Detection

Handles splitting transactions into separate position lifecycles for yield/lending positions.
These don't have unique IDs like LP NFTs, so we detect lifecycles by tracking deposits/withdrawals.

Key Logic:
- DEPOSIT: User sends base asset (USDC), receives vault token = OPENING/ADDING to position
- WITHDRAW: User sends vault token, receives base asset = CLOSING/REDUCING position
- When a full withdrawal occurs (vault token balance → 0), position is CLOSED
- Next deposit after close = NEW position lifecycle
"""

from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Known stablecoins and base assets (not vault tokens)
KNOWN_BASE_ASSETS = {
    # USDC variants
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831",  # USDC Arbitrum
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",  # USDC Ethereum
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",  # USDC Base
    # USDT variants
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",  # USDT Arbitrum
    "0xdac17f958d2ee523a2206206994597c13d831ec7",  # USDT Ethereum
    # DAI
    "0x6b175474e89094c44da98b954eedeac495271d0f",  # DAI Ethereum
    # WETH
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",  # WETH Arbitrum
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",  # WETH Ethereum
    # sUSDS
    "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd",  # sUSDS
}


def is_base_asset(token_id: str, token_dict: dict) -> bool:
    """Check if a token is a known base asset (not a vault token)"""
    token_id_lower = token_id.lower()
    
    # Check known list
    if token_id_lower in KNOWN_BASE_ASSETS:
        return True
    
    # Check token info for common stablecoin symbols
    token_info = token_dict.get(token_id, {})
    symbol = (token_info.get("symbol") or token_info.get("optimized_symbol") or "").upper()
    
    if symbol in ["USDC", "USDT", "DAI", "USDS", "SUSD", "FRAX", "LUSD", "WETH", "WBTC", "ETH"]:
        return True
    
    return False


def classify_yield_transaction(tx: dict, token_dict: dict) -> tuple[str, float, str]:
    """
    Classify a yield/lending transaction as DEPOSIT or WITHDRAW.
    
    Returns: (action, base_asset_amount, base_asset_symbol)
    - DEPOSIT: User sends base asset, receives vault token
    - WITHDRAW: User sends vault token, receives base asset
    """
    sends = tx.get("sends", []) or []
    receives = tx.get("receives", []) or []
    
    # Find base assets in sends and receives
    base_sent = None
    base_received = None
    
    for s in sends:
        token_id = s.get("token_id", "")
        if is_base_asset(token_id, token_dict):
            token_info = token_dict.get(token_id, {})
            symbol = token_info.get("symbol") or token_info.get("optimized_symbol") or "?"
            base_sent = (float(s.get("amount", 0)), symbol, token_id)
            break
    
    for r in receives:
        token_id = r.get("token_id", "")
        if is_base_asset(token_id, token_dict):
            token_info = token_dict.get(token_id, {})
            symbol = token_info.get("symbol") or token_info.get("optimized_symbol") or "?"
            base_received = (float(r.get("amount", 0)), symbol, token_id)
            break
    
    # Classify based on base asset movement
    if base_sent and not base_received:
        # Sending base asset only = DEPOSIT
        return ("deposit", base_sent[0], base_sent[1])
    elif base_received and not base_sent:
        # Receiving base asset only = WITHDRAW
        return ("withdraw", base_received[0], base_received[1])
    elif base_sent and base_received:
        # Both - compare amounts
        if base_sent[0] > base_received[0]:
            return ("deposit", base_sent[0] - base_received[0], base_sent[1])
        else:
            return ("withdraw", base_received[0] - base_sent[0], base_received[1])
    
    return ("unknown", 0, "")


def split_yield_position_into_lifecycles(
    position: dict,
    token_dict: dict
) -> list[dict]:
    """
    Split a yield/lending position's transactions into separate lifecycles.
    
    A lifecycle is: DEPOSIT(s) → ... → final WITHDRAW (balance → 0)
    
    Returns list of position objects, each representing one lifecycle.
    """
    transactions = position.get("transactions", [])
    if not transactions:
        return [position]  # No transactions, return as-is
    
    # Sort transactions chronologically
    sorted_txs = sorted(transactions, key=lambda x: x.get("time_at", 0))
    
    # Track lifecycles
    lifecycles = []
    current_lifecycle_txs = []
    running_balance = 0.0
    current_asset = ""
    
    for tx in sorted_txs:
        action, amount, asset = classify_yield_transaction(tx, token_dict)
        
        if not current_asset and asset:
            current_asset = asset
        
        if action == "deposit":
            running_balance += amount
            current_lifecycle_txs.append(tx)
        elif action == "withdraw":
            running_balance -= amount
            current_lifecycle_txs.append(tx)
            
            # Check if this closes the position (balance near zero)
            if running_balance <= 0.01 and current_lifecycle_txs:
                # This lifecycle is complete (closed)
                lifecycles.append({
                    "transactions": current_lifecycle_txs.copy(),
                    "status": "closed",
                    "asset": current_asset,
                    "opened_at": current_lifecycle_txs[0].get("time_at"),
                    "closed_at": tx.get("time_at"),
                })
                current_lifecycle_txs = []
                running_balance = 0.0
        else:
            # Unknown transaction type, add to current lifecycle
            current_lifecycle_txs.append(tx)
    
    # Any remaining transactions form an open lifecycle
    if current_lifecycle_txs:
        lifecycles.append({
            "transactions": current_lifecycle_txs,
            "status": "open",
            "asset": current_asset,
            "opened_at": current_lifecycle_txs[0].get("time_at"),
            "closed_at": None,
        })
    
    # If no lifecycles detected, return original
    if not lifecycles:
        return [position]
    
    # Convert lifecycles to position objects
    result_positions = []
    base_position = position.copy()
    
    for i, lifecycle in enumerate(lifecycles):
        # Create new position for each lifecycle
        pos = base_position.copy()
        pos["id"] = f"{position['id']}_lifecycle_{i}"
        pos["transactions"] = lifecycle["transactions"]
        pos["transactionCount"] = len(lifecycle["transactions"])
        pos["status"] = lifecycle["status"]
        
        # Update timestamps
        if lifecycle["opened_at"]:
            pos["openedAt"] = lifecycle["opened_at"]
        if lifecycle["closed_at"]:
            pos["closedAt"] = lifecycle["closed_at"]
        
        # Update display name with date
        opened_date = ""
        if lifecycle["opened_at"]:
            dt = datetime.fromtimestamp(lifecycle["opened_at"])
            opened_date = dt.strftime("%m/%d/%y")
        
        asset = lifecycle.get("asset", "")
        protocol = pos.get("protocolName", pos.get("protocol", "")).replace("arb_", "").replace("eth_", "").title()
        
        if lifecycle["status"] == "closed":
            pos["displayName"] = f"{protocol} {asset} ({opened_date}) [Closed]"
            pos["valueUsd"] = 0  # Closed positions have 0 current value
        else:
            pos["displayName"] = f"{protocol} {asset} ({opened_date})"
        
        result_positions.append(pos)
    
    return result_positions


def process_positions_with_lifecycle_detection(
    positions: list[dict],
    token_dict: dict
) -> list[dict]:
    """
    Process all positions, splitting yield/lending positions into lifecycles.
    
    LP positions (with NFT IDs) are left as-is.
    Perpetual positions are left as-is.
    Yield/lending positions are analyzed and potentially split.
    """
    result = []
    
    for position in positions:
        pos_type = position.get("type", "")
        
        # Only process yield/lending positions
        if pos_type in ["yield", "lending"]:
            # Check if this position has transactions that span multiple lifecycles
            lifecycles = split_yield_position_into_lifecycles(position, token_dict)
            result.extend(lifecycles)
        else:
            # LP, perpetual, etc. - keep as-is
            result.append(position)
    
    return result
