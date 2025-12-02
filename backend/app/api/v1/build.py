"""
Build Page API endpoints.

Provides filtered and enriched transaction data specifically for the 
Build page's three-column workflow (Transactions → Positions → Strategies).

Key features:
- Smart transaction filtering (hide noise, show position-relevant txs)
- Transaction categorization (primary vs bundled)
- Price enrichment on-demand
- Position building from protocol data
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import logging

from backend.services.discovery import get_discovery_service, DEFAULT_CHAIN_NAMES
from backend.services.transaction_cache import get_cache
from backend.services.coingecko_prices import get_price_service
from backend.services.debank import get_debank_service
# NOTE: position_lifecycle import removed - old auto-matching system deprecated
from backend.app.api.v1.transaction_grouping import group_transactions, infer_flow_direction

logger = logging.getLogger(__name__)
router = APIRouter()

# Transaction categories for filtering
NOISE_CATEGORIES = {"deploy", "approve"}  # Usually not position-relevant alone
SPAM_INDICATORS = ["claim-", "Visit ", "airdrop", ".org", ".com", ".io"]

# Bridge project IDs that should be hidden (not positions)
BRIDGE_PROJECTS = {
    "arb_across", "across", "mayan", "arb_socket", "socket", 
    "base_socket", "op_socket", "bsc_socket", "eth_socket",
    "stargate", "hop", "multichain", "synapse", "celer",
    "layerzero", "wormhole", "axelar", "debridge",
    "0x", "arb_0x", "base_0x", "op_0x", "eth_0x", "bsc_0x"  # 0x aggregator = swaps
}

# Bridge/swap transaction names that should be hidden
BRIDGE_SWAP_KEYWORDS = [
    "fillRelay", "fulfillWithERC20", "performFulfilment", 
    "performExtraction", "refundRequest", "bridge", "relay",
    "swap", "exchange", "fill", "createRequest"
]

def _is_spam_transaction(tx: Dict, token_dict: Dict) -> bool:
    """
    Detect spam/scam transactions that should be hidden.
    
    Checks:
    - Token is_scam flag from DeBank
    - Token name contains spam indicators
    - Dust amounts (< $0.10 value)
    """
    # Check receives for spam tokens
    for token in tx.get("receives", []) or []:
        token_id = token.get("token_id", "")
        token_info = token_dict.get(token_id, {})
        
        # DeBank marks known scams
        if token_info.get("is_scam"):
            return True
        
        # Check name for spam indicators
        token_name = token_info.get("name", "") or ""
        for indicator in SPAM_INDICATORS:
            if indicator.lower() in token_name.lower():
                return True
    
    return False


def _is_bridge_or_swap(tx: Dict) -> bool:
    """
    Detect bridge and swap transactions that should be hidden per MVT rules.
    
    These don't create positions - they just move funds between chains/tokens.
    """
    project_id = (tx.get("project_id") or "").lower()
    tx_name = (tx.get("tx", {}).get("name") or "").lower()
    
    # Check if project is a known bridge
    if project_id in BRIDGE_PROJECTS:
        return True
    
    # Check for bridge/swap keywords in transaction name
    for keyword in BRIDGE_SWAP_KEYWORDS:
        if keyword.lower() in tx_name:
            return True
    
    # Check for 0x (aggregator/swap)
    if project_id == "0x":
        return True
    
    return False


def _is_failed_transaction(tx: Dict) -> bool:
    """
    Detect failed transactions that should be hidden.
    """
    # DeBank marks failed transactions
    tx_info = tx.get("tx", {})
    if tx_info.get("status") == 0:
        return True
    
    # Check for error/revert indicators
    if tx_info.get("name", "").lower() in ["revert", "failed", "error"]:
        return True
    
    return False


def _is_dust_transaction(tx: Dict, token_dict: Dict, threshold_usd: float = 0.10) -> bool:
    """
    Detect dust transactions (total value < threshold).
    Uses price_usd from token if available (historical), otherwise falls back to token_dict.
    """
    total_value = 0.0
    
    for token in tx.get("receives", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        if "price_usd" in token and token["price_usd"] is not None:
            price = token["price_usd"]
        else:
            token_info = token_dict.get(token_id, {})
            price = token_info.get("price", 0) or 0
        total_value += amount * price
    
    for token in tx.get("sends", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        if "price_usd" in token and token["price_usd"] is not None:
            price = token["price_usd"]
        else:
            token_info = token_dict.get(token_id, {})
            price = token_info.get("price", 0) or 0
        total_value += amount * price
    
    # If we can calculate value and it's below threshold, it's dust
    return total_value > 0 and total_value < threshold_usd


def _is_overhead_transaction(tx: Dict, token_dict: Dict, threshold_usd: float = 1.0) -> bool:
    """
    Detect overhead transactions - those with negligible net value.
    
    These are transactions like order placement, gas fees, etc. where the
    net value moved is below the threshold. Real position changes involve
    significant value movement.
    
    Calculates: abs(receives_value - sends_value) < threshold
    Uses price_usd from token if available (historical), otherwise falls back to token_dict.
    """
    receives_value = 0.0
    sends_value = 0.0
    
    for token in tx.get("receives", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        if "price_usd" in token and token["price_usd"] is not None:
            price = token["price_usd"]
        else:
            token_info = token_dict.get(token_id, {})
            price = token_info.get("price", 0) or 0
        receives_value += amount * price
    
    for token in tx.get("sends", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        if "price_usd" in token and token["price_usd"] is not None:
            price = token["price_usd"]
        else:
            token_info = token_dict.get(token_id, {})
            price = token_info.get("price", 0) or 0
        sends_value += amount * price
    
    net_value = abs(receives_value - sends_value)
    
    # If net value is below threshold, it's overhead
    return net_value < threshold_usd


def _infer_flow_direction(tx: Dict, token_dict: Dict) -> Dict[str, Any]:
    """
    Infer the flow direction and category of a transaction based on value movement.
    
    Returns dict with:
    - direction: "increase" | "decrease" | "modify" | "overhead"
    - net_value: Net USD value (positive = received, negative = sent)
    - sends_value: Total USD value sent
    - receives_value: Total USD value received
    - primary_token: Main token involved (largest value)
    
    Uses price_usd from token if available (historical), otherwise falls back to token_dict (current).
    """
    receives_value = 0.0
    sends_value = 0.0
    primary_token = None
    max_token_value = 0.0
    
    for token in tx.get("receives", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        
        # Prefer price_usd from token (historical) over token_dict (current)
        if "price_usd" in token and token["price_usd"] is not None:
            price = token["price_usd"]
        else:
            token_info = token_dict.get(token_id, {})
            price = token_info.get("price", 0) or 0
        
        value = amount * price
        receives_value += value
        
        token_info = token_dict.get(token_id, {})
        if value > max_token_value:
            max_token_value = value
            primary_token = {
                "token_id": token_id,
                "symbol": token_info.get("symbol") or token_info.get("optimized_symbol") or "?",
                "amount": amount,
                "value": value,
                "direction": "in"
            }
    
    for token in tx.get("sends", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        
        # Prefer price_usd from token (historical) over token_dict (current)
        if "price_usd" in token and token["price_usd"] is not None:
            price = token["price_usd"]
        else:
            token_info = token_dict.get(token_id, {})
            price = token_info.get("price", 0) or 0
        
        value = amount * price
        sends_value += value
        
        token_info = token_dict.get(token_id, {})
        if value > max_token_value:
            max_token_value = value
            primary_token = {
                "token_id": token_id,
                "symbol": token_info.get("symbol") or token_info.get("optimized_symbol") or "?",
                "amount": amount,
                "value": value,
                "direction": "out"
            }
    
    net_value = receives_value - sends_value
    
    # Determine direction
    if abs(net_value) < 1.0:
        direction = "overhead"
    elif net_value > 0 and sends_value < 1.0:
        direction = "decrease"  # Only receiving (closing/reducing position)
    elif net_value < 0 and receives_value < 1.0:
        direction = "increase"  # Only sending (opening/increasing position)
    else:
        direction = "modify"  # Both significant (rebalancing)
    
    return {
        "direction": direction,
        "net_value": net_value,
        "sends_value": sends_value,
        "receives_value": receives_value,
        "primary_token": primary_token
    }


def _apply_cached_prices_to_transactions(
    transactions: List[Dict],
    cache,
    token_dict: Dict
) -> List[Dict]:
    """
    Apply cached historical prices to transactions.
    
    For each transaction:
    1. Check if we have cached historical prices
    2. If yes, use those instead of token_dict current prices
    3. If no, fall back to token_dict (current prices)
    
    This modifies the token amounts in-place by adding price_usd and value_usd.
    """
    for tx in transactions:
        tx_id = tx.get("id", tx.get("tx", {}).get("hash", ""))
        if not tx_id:
            continue
            
        # Get cached historical prices for this transaction
        cached_prices = cache.get_transaction_prices(tx_id)
        
        # Apply prices to sends
        for token in tx.get("sends", []) or []:
            token_id = token.get("token_id", "")
            amount = float(token.get("amount", 0))
            
            if token_id in cached_prices:
                # Use cached historical price
                token["price_usd"] = cached_prices[token_id].get("price_usd", 0)
                token["value_usd"] = cached_prices[token_id].get("price_usd", 0) * amount
                token["_price_source"] = "historical"
            else:
                # Fall back to current price from token_dict
                token_info = token_dict.get(token_id, {})
                price = token_info.get("price", 0) or 0
                token["price_usd"] = price
                token["value_usd"] = price * amount
                token["_price_source"] = "current"
        
        # Apply prices to receives
        for token in tx.get("receives", []) or []:
            token_id = token.get("token_id", "")
            amount = float(token.get("amount", 0))
            
            if token_id in cached_prices:
                # Use cached historical price
                token["price_usd"] = cached_prices[token_id].get("price_usd", 0)
                token["value_usd"] = cached_prices[token_id].get("price_usd", 0) * amount
                token["_price_source"] = "historical"
            else:
                # Fall back to current price from token_dict
                token_info = token_dict.get(token_id, {})
                price = token_info.get("price", 0) or 0
                token["price_usd"] = price
                token["value_usd"] = price * amount
                token["_price_source"] = "current"
    
    return transactions


def _group_transactions(txs: List[Dict], token_dict: Dict) -> Dict[str, Any]:
    """
    Group transactions by chain > protocol > type > token.
    
    Returns nested dict structure with transactions and metadata per group.
    """
    groups = {}
    
    for tx in txs:
        chain = tx.get("chain", "unknown")
        project_id = tx.get("project_id", "") or "unknown"
        
        # Infer type from transaction name or category
        tx_name = (tx.get("tx", {}).get("name") or "").lower()
        cate_id = tx.get("cate_id", "")
        
        # Determine type
        if any(kw in tx_name for kw in ["mint", "burn", "increaseliquidity", "decreaseliquidity", "collect"]):
            tx_type = "lp"
        elif any(kw in tx_name for kw in ["executeorder", "createorder", "cancelorder", "multicall"]) and "gmx" in project_id:
            tx_type = "perpetual"
        elif any(kw in tx_name for kw in ["deposit", "withdraw", "supply", "borrow", "repay"]):
            tx_type = "yield"
        else:
            tx_type = "other"
        
        # Get flow info for primary token
        flow = _infer_flow_direction(tx, token_dict)
        primary_symbol = flow.get("primary_token", {}).get("symbol", "unknown") if flow.get("primary_token") else "unknown"
        
        # Build group key
        group_key = f"{chain}|{project_id}|{tx_type}|{primary_symbol}"
        
        if group_key not in groups:
            groups[group_key] = {
                "chain": chain,
                "protocol": project_id,
                "type": tx_type,
                "token": primary_symbol,
                "transactions": [],
                "total_in": 0.0,
                "total_out": 0.0,
                "latest_time": 0,
                "is_open": False  # Will be set based on DeBank positions
            }
        
        # Add flow data to transaction
        tx["_flow"] = flow
        
        groups[group_key]["transactions"].append(tx)
        groups[group_key]["total_in"] += flow["receives_value"]
        groups[group_key]["total_out"] += flow["sends_value"]
        
        tx_time = tx.get("time_at", 0)
        if tx_time > groups[group_key]["latest_time"]:
            groups[group_key]["latest_time"] = tx_time
    
    # Sort groups by latest activity
    sorted_groups = sorted(groups.values(), key=lambda g: -g["latest_time"])
    
    return {
        "groups": sorted_groups,
        "total_groups": len(sorted_groups),
        "total_transactions": len(txs)
    }


def _categorize_transaction(tx: Dict) -> str:
    """
    Categorize transaction for Build page display.
    
    Categories:
    - position: Creates/modifies a position (mint, burn, open, close, etc.)
    - trade: Swap, exchange, bridge
    - approval: Token approval (usually bundled with position tx)
    - reward: Fee collection, rewards claim
    - transfer: Simple send/receive
    - other: Uncategorized
    """
    cate_id = tx.get("cate_id", "")
    project_id = tx.get("project_id", "")
    tx_name = tx.get("tx", {}).get("name", "") or ""
    
    # Position-creating transactions
    position_keywords = [
        "mint", "burn", "increaseLiquidity", "decreaseLiquidity",
        "addLiquidity", "removeLiquidity", "collect",
        "executeOrder", "batch",  # GMX
        "deposit", "withdraw", "borrow", "repay",  # Lending
        "stake", "unstake"
    ]
    
    for keyword in position_keywords:
        if keyword.lower() in tx_name.lower():
            return "position"
    
    # Trade transactions
    trade_keywords = ["swap", "exchange", "bridge", "fill"]
    for keyword in trade_keywords:
        if keyword.lower() in tx_name.lower():
            return "trade"
    
    # Approval transactions
    if cate_id == "approve":
        return "approval"
    
    # Reward/fee transactions
    reward_keywords = ["claim", "collect", "harvest", "reward"]
    for keyword in reward_keywords:
        if keyword.lower() in tx_name.lower():
            return "reward"
    
    # Transfer transactions
    if cate_id == "send" or cate_id == "receive":
        return "transfer"
    
    # Protocol-specific detection
    if "gmx" in (project_id or "").lower():
        return "position"
    if "uniswap" in (project_id or "").lower():
        return "position"
    if "euler" in (project_id or "").lower():
        return "position"
    
    return "other"


def _infer_flow_direction(tx: Dict, token_dict: Dict) -> Dict[str, Any]:
    """
    Infer the flow direction of a transaction based on net value.
    
    Returns:
        {
            "direction": "increase" | "decrease" | "modify",
            "netValue": float (positive = received, negative = sent),
            "sendValue": float,
            "receiveValue": float,
        }
    """
    receives_value = 0.0
    sends_value = 0.0
    
    for token in tx.get("receives", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        token_info = token_dict.get(token_id, {})
        price = token_info.get("price", 0) or 0
        receives_value += amount * price
    
    for token in tx.get("sends", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        token_info = token_dict.get(token_id, {})
        price = token_info.get("price", 0) or 0
        sends_value += amount * price
    
    net_value = receives_value - sends_value
    
    # Determine direction based on net flow
    if net_value < -1:  # Significant money out
        direction = "increase"  # Opening/increasing position
    elif net_value > 1:  # Significant money in
        direction = "decrease"  # Closing/reducing position
    else:
        direction = "modify"  # Rebalancing or minimal change
    
    return {
        "direction": direction,
        "netValue": round(net_value, 2),
        "sendValue": round(sends_value, 2),
        "receiveValue": round(receives_value, 2),
    }


def _infer_tx_position_type(tx: Dict, project_id: str) -> str:
    """
    Infer position type from transaction and project.
    """
    tx_name = (tx.get("tx", {}).get("name") or "").lower()
    project_lower = project_id.lower()
    
    # GMX perpetuals
    if "gmx" in project_lower:
        # Check for LP vs perpetual
        if "gm" in tx_name or "liquidity" in tx_name.lower():
            return "lp"
        return "perpetual"
    
    # Uniswap/PancakeSwap LP
    if any(x in project_lower for x in ["uniswap", "pancake", "sushi", "curve"]):
        return "lp"
    
    # Lending/Yield
    if any(x in project_lower for x in ["euler", "aave", "compound", "silo", "morpho"]):
        return "yield"
    
    # Staking
    if "stake" in tx_name or "staking" in project_lower:
        return "staking"
    
    return "other"


def _extract_token_from_tx(tx: Dict, token_dict: Dict) -> str:
    """
    Extract the primary token symbol from a transaction.
    Looks at the largest value token in sends or receives.
    """
    all_tokens = []
    
    for token in tx.get("sends", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        token_info = token_dict.get(token_id, {})
        price = token_info.get("price", 0) or 0
        symbol = token_info.get("symbol") or token_info.get("optimized_symbol") or ""
        value = amount * price
        if symbol and value > 0:
            all_tokens.append((symbol, value))
    
    for token in tx.get("receives", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        token_info = token_dict.get(token_id, {})
        price = token_info.get("price", 0) or 0
        symbol = token_info.get("symbol") or token_info.get("optimized_symbol") or ""
        value = amount * price
        if symbol and value > 0:
            all_tokens.append((symbol, value))
    
    if not all_tokens:
        return "Unknown"
    
    # Return the token with highest value
    all_tokens.sort(key=lambda x: -x[1])
    return all_tokens[0][0]


def _group_transactions(
    transactions: List[Dict],
    token_dict: Dict,
    open_position_keys: set = None
) -> List[Dict]:
    """
    Group transactions by Network > Protocol > Type > Token.
    
    Returns list of groups, each with:
    {
        "id": unique group ID,
        "chain": chain ID,
        "chainName": display name,
        "protocol": protocol ID,
        "protocolName": display name,
        "type": position type (lp, perpetual, yield, etc.),
        "token": primary token symbol,
        "displayName": human-readable group name,
        "transactions": list of transactions,
        "transactionCount": count,
        "latestActivity": timestamp,
        "isOpen": boolean (matches an open DeBank position),
        "totalIn": total received value,
        "totalOut": total sent value,
        "netFlow": net value change,
    }
    """
    groups = {}
    
    for tx in transactions:
        chain = tx.get("chain", "unknown")
        project_id = tx.get("project_id") or "unknown"
        
        # Infer type and token
        pos_type = _infer_tx_position_type(tx, project_id)
        token = _extract_token_from_tx(tx, token_dict)
        
        # Create group key
        group_key = f"{chain}_{project_id}_{pos_type}_{token}".lower()
        
        if group_key not in groups:
            # Clean up protocol name
            protocol_name = project_id.replace("arb_", "").replace("eth_", "").replace("base_", "")
            protocol_name = protocol_name.replace("_", " ").title()
            
            # Check if this matches an open position
            is_open = open_position_keys and group_key in open_position_keys
            
            groups[group_key] = {
                "id": group_key,
                "chain": chain,
                "chainName": DEFAULT_CHAIN_NAMES.get(chain, chain.upper()),
                "protocol": project_id,
                "protocolName": protocol_name,
                "type": pos_type,
                "token": token,
                "displayName": f"{protocol_name} {pos_type.upper()} {token}",
                "transactions": [],
                "transactionCount": 0,
                "latestActivity": 0,
                "isOpen": is_open,
                "totalIn": 0.0,
                "totalOut": 0.0,
                "netFlow": 0.0,
            }
        
        # Add transaction to group
        groups[group_key]["transactions"].append(tx)
        groups[group_key]["transactionCount"] += 1
        
        # Update latest activity
        tx_time = tx.get("time_at", 0)
        if tx_time > groups[group_key]["latestActivity"]:
            groups[group_key]["latestActivity"] = tx_time
        
        # Update totals
        flow = _infer_flow_direction(tx, token_dict)
        groups[group_key]["totalIn"] += flow["receiveValue"]
        groups[group_key]["totalOut"] += flow["sendValue"]
        groups[group_key]["netFlow"] += flow["netValue"]
    
    # Convert to list and sort by latest activity (most recent first)
    result = list(groups.values())
    result.sort(key=lambda x: -x["latestActivity"])
    
    # Round totals
    for g in result:
        g["totalIn"] = round(g["totalIn"], 2)
        g["totalOut"] = round(g["totalOut"], 2)
        g["netFlow"] = round(g["netFlow"], 2)
    
    return result


def _filter_transactions(
    transactions: List[Dict],
    token_dict: Dict,
    show_spam: bool = False,
    show_dust: bool = False,
    show_approvals: bool = False,
    show_bridges_swaps: bool = False,
    show_failed: bool = False,
    show_overhead: bool = False,
    overhead_threshold: float = 1.0,
    categories: Optional[List[str]] = None
) -> Tuple[List[Dict], Dict[str, int]]:
    """
    Filter transactions for Build page display.
    
    Default behavior (Build page) per MVT rules:
    - Hide spam/scam tokens
    - Hide dust (<$0.10)
    - Hide standalone approvals
    - Hide bridges and swaps (not positions)
    - Hide failed transactions
    - Hide overhead transactions (net value < threshold)
    - Show only position-relevant transactions
    """
    filtered = []
    hidden_counts = {
        "spam": 0,
        "dust": 0,
        "approval": 0,
        "bridge_swap": 0,
        "failed": 0,
        "overhead": 0
    }
    
    for tx in transactions:
        # Skip spam unless explicitly shown
        if not show_spam and _is_spam_transaction(tx, token_dict):
            hidden_counts["spam"] += 1
            continue
        
        # Skip dust unless explicitly shown
        if not show_dust and _is_dust_transaction(tx, token_dict):
            hidden_counts["dust"] += 1
            continue
        
        # Skip bridges/swaps unless explicitly shown (MVT rule)
        if not show_bridges_swaps and _is_bridge_or_swap(tx):
            hidden_counts["bridge_swap"] += 1
            continue
        
        # Skip failed transactions unless explicitly shown
        if not show_failed and _is_failed_transaction(tx):
            hidden_counts["failed"] += 1
            continue
        
        # Skip overhead transactions (low net value) unless explicitly shown
        if not show_overhead and _is_overhead_transaction(tx, token_dict, overhead_threshold):
            hidden_counts["overhead"] += 1
            continue
        
        # Categorize transaction
        category = _categorize_transaction(tx)
        tx["_category"] = category  # Add category to tx for frontend
        
        # Skip standalone approvals unless shown
        if not show_approvals and category == "approval":
            hidden_counts["approval"] += 1
            continue
        
        # Filter by categories if specified
        if categories and category not in categories:
            continue
        
        filtered.append(tx)
    
    return filtered, hidden_counts


@router.get("/transactions")
async def get_build_transactions(
    wallet: str = Query(..., description="Wallet address"),
    since: Optional[str] = Query(
        "6m",
        description="Start date (ISO format or relative like '30d', '6m')"
    ),
    until: Optional[str] = Query(
        None,
        description="End date (ISO format), defaults to now"
    ),
    chain: Optional[str] = Query(
        None,
        description="Filter by chain (eth, arb, op, base, etc.)"
    ),
    show_spam: bool = Query(False, description="Include spam/scam transactions"),
    show_dust: bool = Query(False, description="Include dust transactions (<$0.10)"),
    show_approvals: bool = Query(False, description="Include standalone approvals"),
    show_bridges_swaps: bool = Query(False, description="Include bridges and swaps (not positions per MVT)"),
    show_failed: bool = Query(False, description="Include failed transactions"),
    force_refresh: bool = Query(False, description="Force refresh from DeBank")
) -> Dict[str, Any]:
    """
    Get filtered transactions for Build page.
    
    Returns transactions categorized and filtered for position building per MVT rules:
    - Spam/scam tokens hidden by default
    - Dust transactions hidden by default
    - Standalone approvals hidden by default
    - Bridges and swaps hidden by default (not positions)
    - Failed transactions hidden by default
    - Each transaction includes _category field
    
    Categories: position, reward, transfer, other
    """
    try:
        # Parse dates
        until_dt = _parse_date(until) if until else datetime.now()
        since_dt = _parse_date(since) if since else (until_dt - timedelta(days=180))
        
        # Get discovery service
        discovery = await get_discovery_service()
        
        # Discover transactions
        result = await discovery.discover_transactions(
            wallet_address=wallet,
            chains=[chain] if chain else None,
            since=since_dt,
            until=until_dt,
            force_refresh=force_refresh
        )
        
        all_transactions = result["transactions"]
        token_dict = result["token_dict"]
        
        # Apply Build page filtering (MVT rules)
        filtered_transactions, hidden_counts = _filter_transactions(
            all_transactions,
            token_dict,
            show_spam=show_spam,
            show_dust=show_dust,
            show_approvals=show_approvals,
            show_bridges_swaps=show_bridges_swaps,
            show_failed=show_failed
        )
        
        # Build category summary
        category_counts = {}
        for tx in filtered_transactions:
            cat = tx.get("_category", "other")
            category_counts[cat] = category_counts.get(cat, 0) + 1
        
        # Build chain summary
        chain_counts = {}
        for tx in filtered_transactions:
            ch = tx.get("chain", "unknown")
            chain_counts[ch] = chain_counts.get(ch, 0) + 1

        
        return {
            "status": "success",
            "data": {
                "transactions": filtered_transactions,
                "wallet": wallet.lower(),
                "tokenDict": token_dict,
                "projectDict": result["project_dict"],
                "chainNames": result.get("chain_names", DEFAULT_CHAIN_NAMES),
                "summary": {
                    "total": len(filtered_transactions),
                    "totalUnfiltered": len(all_transactions),
                    "filtered": len(all_transactions) - len(filtered_transactions),
                    "hiddenBreakdown": hidden_counts,
                    "byCategory": category_counts,
                    "byChain": chain_counts,
                },
                "filters": {
                    "since": since_dt.isoformat(),
                    "until": until_dt.isoformat(),
                    "chain": chain,
                    "showSpam": show_spam,
                    "showDust": show_dust,
                    "showApprovals": show_approvals,
                    "showBridgesSwaps": show_bridges_swaps,
                    "showFailed": show_failed,
                },
                "cache": result.get("cache", {})
            }
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": str(e)})
    except Exception as e:
        logger.exception(f"Error getting build transactions for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get transactions", "message": str(e)}
        )


def _parse_date(date_str: str) -> datetime:
    """Parse date string (ISO or relative format)"""
    if not date_str:
        return datetime.now()
    
    # Relative formats
    if date_str.endswith('d'):
        try:
            days = int(date_str[:-1])
            return datetime.now() - timedelta(days=days)
        except ValueError:
            pass
    elif date_str.endswith('m'):
        try:
            months = int(date_str[:-1])
            return datetime.now() - timedelta(days=months * 30)
        except ValueError:
            pass
    elif date_str.endswith('y'):
        try:
            years = int(date_str[:-1])
            return datetime.now() - timedelta(days=years * 365)
        except ValueError:
            pass
    
    # ISO format
    try:
        if 'T' in date_str:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        else:
            return datetime.fromisoformat(date_str)
    except ValueError:
        raise ValueError(f"Invalid date format: {date_str}")


@router.get("/transactions/grouped")
async def get_grouped_transactions(
    wallet: str = Query(..., description="Wallet address"),
    since: Optional[str] = Query(
        "6m",
        description="Start date (ISO format or relative like '30d', '6m')"
    ),
    force_refresh: bool = Query(False, description="Force refresh from DeBank")
) -> Dict[str, Any]:
    """
    Get transactions grouped by Chain > Protocol > Type > Token.
    
    Each transaction includes flow direction inference:
    - increase: Money going OUT (opening/adding to position)
    - decrease: Money coming IN (closing/reducing position)
    - modify: Both in and out (rebalancing)
    - overhead: Negligible net value (filtered out)
    
    Groups are sorted by most recent activity.
    """
    try:
        # Parse dates
        until_dt = datetime.now()
        since_dt = _parse_date(since) if since else (until_dt - timedelta(days=180))
        
        # Get discovery service
        discovery = await get_discovery_service()
        
        # Discover transactions
        result = await discovery.discover_transactions(
            wallet_address=wallet,
            chains=None,
            since=since_dt,
            until=until_dt,
            force_refresh=force_refresh
        )
        
        all_transactions = result["transactions"]
        token_dict = result["token_dict"]
        
        # Get cache for historical prices
        cache = get_cache(wallet)
        
        # Apply cached historical prices to transactions (if available)
        # This adds price_usd and value_usd to each token, preferring historical over current
        all_transactions = _apply_cached_prices_to_transactions(
            all_transactions, cache, token_dict
        )
        
        # Enrich token_dict with current prices for any missing tokens
        price_service = get_price_service()
        missing_tokens = []
        for tx in all_transactions:
            for token in (tx.get("sends", []) or []) + (tx.get("receives", []) or []):
                token_id = token.get("token_id", "")
                if token_id and token_id not in token_dict:
                    missing_tokens.append(token_id)
        
        if missing_tokens:
            token_dict = await price_service.enrich_token_dict(token_dict, list(set(missing_tokens)))
            logger.info(f"Enriched {len(missing_tokens)} missing token prices for grouped transactions")
        
        # Apply MVT filtering with overhead filter
        filtered_transactions, hidden_counts = _filter_transactions(
            all_transactions,
            token_dict,
            show_spam=False,
            show_dust=False,
            show_approvals=False,
            show_bridges_swaps=False,
            show_failed=False,
            show_overhead=False,
            overhead_threshold=1.0
        )
        
        # Group transactions
        project_dict = result.get("project_dict", {})
        groups = group_transactions(filtered_transactions, token_dict, project_dict)
        
        # Get open positions from DeBank to mark groups as "open"
        try:
            debank = await get_debank_service()
            positions_result = await debank.get_wallet_positions(wallet)
            open_positions = positions_result.get("positions", [])
            
            # Build set of open protocol+chain+token combinations
            open_keys = set()
            for pos in open_positions:
                protocol = (pos.get("protocol", "") or "").lower()
                chain = pos.get("chain", "")
                # Add any identifiable keys
                if protocol and chain:
                    open_keys.add(f"{chain}|{protocol}")
            
            # Mark groups as open if they match
            for group in groups:
                group_key = f"{group['chain']}|{group['protocol']}"
                if group_key in open_keys:
                    group["isOpen"] = True
        except Exception as e:
            logger.warning(f"Could not fetch open positions: {e}")
        
        # Count transactions with/without historical prices
        txs_with_historical = 0
        txs_without_historical = 0
        for group in groups:
            for tx in group.get("transactions", []):
                has_historical = False
                for token in (tx.get("sends", []) or []) + (tx.get("receives", []) or []):
                    if token.get("_price_source") == "historical":
                        has_historical = True
                        break
                if has_historical:
                    txs_with_historical += 1
                else:
                    txs_without_historical += 1
        
        return {
            "status": "success",
            "data": {
                "groups": groups,
                "totalGroups": len(groups),
                "totalTransactions": len(filtered_transactions),
                "wallet": wallet.lower(),
                "tokenDict": token_dict,
                "projectDict": project_dict,
                "hiddenCounts": hidden_counts,
                "priceInfo": {
                    "historicalPrices": txs_with_historical,
                    "currentPrices": txs_without_historical,
                    "needsEnrichment": txs_without_historical > 0
                },
                "filters": {
                    "since": since_dt.isoformat(),
                    "until": until_dt.isoformat(),
                }
            }
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": str(e)})
    except Exception as e:
        logger.exception(f"Error getting grouped transactions for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get grouped transactions", "message": str(e)}
        )


@router.post("/enrich-prices")
async def enrich_transaction_prices(
    wallet: str = Query(..., description="Wallet address"),
    tx_ids: Optional[List[str]] = Query(
        None,
        description="Specific transaction IDs to enrich (default: all without prices)"
    ),
    max_transactions: int = Query(
        10,
        ge=1,
        le=50,
        description="Max transactions to enrich per request (rate limit protection)"
    )
) -> Dict[str, Any]:
    """
    Enrich transactions with historical USD prices from CoinGecko.
    
    This is called on-demand to avoid rate limiting. Prices are cached
    permanently in SQLite so subsequent loads are instant.
    
    Returns:
    - enriched: Number of transactions successfully enriched
    - failed: Number of transactions that failed (token not found, etc.)
    - remaining: Number of transactions still needing prices
    """
    try:
        cache = get_cache(wallet)
        price_service = get_price_service()
        
        # Get transactions needing prices
        if tx_ids:
            # Specific transactions requested
            needs_prices = tx_ids[:max_transactions]
        else:
            # Get all transactions without prices
            all_needing = cache.get_transactions_needing_prices()
            needs_prices = all_needing[:max_transactions]
        
        if not needs_prices:
            return {
                "status": "success",
                "data": {
                    "enriched": 0,
                    "failed": 0,
                    "remaining": 0,
                    "message": "All transactions already have prices"
                }
            }
        
        # Load transactions to enrich
        all_transactions = cache.load_transactions()
        tx_map = {
            tx.get("id", tx.get("tx", {}).get("hash", "")): tx 
            for tx in all_transactions
        }
        
        enriched = 0
        failed = 0
        
        for tx_id in needs_prices:
            tx = tx_map.get(tx_id)
            if not tx:
                failed += 1
                continue
            
            chain = tx.get("chain", "eth")
            timestamp = int(tx.get("time_at", 0))
            prices_to_save = {}
            
            # Process sends
            for token in tx.get("sends", []) or []:
                token_addr = token.get("token_id", "")
                amount = float(token.get("amount", 0))
                
                if token_addr and amount > 0:
                    try:
                        price = await price_service.get_historical_price(
                            token_addr, chain, timestamp
                        )
                        if price is not None:
                            prices_to_save[token_addr] = {
                                "price_usd": price,
                                "value_usd": price * amount
                            }
                    except Exception as e:
                        logger.warning(f"Failed to get price for {token_addr}: {e}")

            
            # Process receives
            for token in tx.get("receives", []) or []:
                token_addr = token.get("token_id", "")
                amount = float(token.get("amount", 0))
                
                if token_addr and amount > 0:
                    try:
                        price = await price_service.get_historical_price(
                            token_addr, chain, timestamp
                        )
                        if price is not None:
                            prices_to_save[token_addr] = {
                                "price_usd": price,
                                "value_usd": price * amount
                            }
                    except Exception as e:
                        logger.warning(f"Failed to get price for {token_addr}: {e}")
            
            # Save prices to cache
            if prices_to_save:
                cache.save_transaction_prices(tx_id, prices_to_save)
                enriched += 1
            else:
                # Mark as attempted even if no prices found
                # (prevents re-attempting on every request)
                cache.save_transaction_prices(tx_id, {"_attempted": {"price_usd": None, "value_usd": None}})
                failed += 1
        
        # Count remaining
        remaining = len(cache.get_transactions_needing_prices())
        
        return {
            "status": "success",
            "data": {
                "enriched": enriched,
                "failed": failed,
                "remaining": remaining,
                "processed": len(needs_prices)
            }
        }
        
    except Exception as e:
        logger.exception(f"Error enriching prices for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to enrich prices", "message": str(e)}
        )


@router.get("/cache-stats")
async def get_cache_stats(
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """
    Get cache statistics for a wallet.
    
    Shows transaction count, price coverage, date range, etc.
    """
    try:
        cache = get_cache(wallet)
        stats = cache.get_cache_stats()
        
        return {
            "status": "success",
            "data": stats
        }
        
    except Exception as e:
        logger.exception(f"Error getting cache stats for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get cache stats", "message": str(e)}
        )


@router.get("/positions")
async def get_build_positions(
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """
    Fetch open positions from DeBank for the Build page.
    
    Returns standardized position objects with:
    - position_index (unique identifier for linking transactions)
    - protocol, chain, name
    - value, tokens, P&L where available
    - detail_types for categorization
    
    Supports: Uniswap V3, GMX V2, Euler, Aerodrome, PancakeSwap, etc.
    """
    try:
        debank = await get_debank_service()
        
        # Fetch raw protocol data from DeBank
        response = await debank.client.get(
            "/user/all_complex_protocol_list",
            params={"id": wallet.lower()}
        )
        response.raise_for_status()
        protocols = response.json()
        
        if not isinstance(protocols, list):
            return {
                "status": "success",
                "data": {
                    "positions": [],
                    "wallet": wallet.lower(),
                    "protocols": []
                }
            }
        
        positions = []
        protocol_summary = []
        
        for protocol in protocols:
            protocol_id = protocol.get("id", "")
            chain = protocol.get("chain", "")
            protocol_name = protocol.get("name", protocol_id)
            items = protocol.get("portfolio_item_list", [])
            
            protocol_summary.append({
                "id": protocol_id,
                "name": protocol_name,
                "chain": chain,
                "itemCount": len(items)
            })
            
            for item in items:
                position = _parse_debank_position(item, protocol_id, chain, protocol_name)
                if position:
                    positions.append(position)
        
        return {
            "status": "success",
            "data": {
                "positions": positions,
                "wallet": wallet.lower(),
                "protocols": protocol_summary,
                "summary": {
                    "total": len(positions),
                    "byProtocol": _count_by_key(positions, "protocol"),
                    "byChain": _count_by_key(positions, "chain"),
                    "byType": _count_by_key(positions, "type")
                }
            }
        }
        
    except Exception as e:
        logger.exception(f"Error fetching positions for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to fetch positions", "message": str(e)}
        )


def _parse_debank_position(item: Dict, protocol_id: str, chain: str, protocol_name: str) -> Optional[Dict]:
    """
    Parse a DeBank portfolio item into a standardized position object.
    
    Handles different position types:
    - LP positions (Uniswap, PancakeSwap, Aerodrome)
    - Perpetuals (GMX)
    - Lending/Yield (Euler, Aave, Compound)
    - Vesting
    """
    try:
        detail = item.get("detail", {})
        detail_types = item.get("detail_types", [])
        stats = item.get("stats", {})
        pool = item.get("pool", {})
        
        # Get position index (unique identifier)
        position_index = item.get("position_index")
        
        # Determine position type
        if "perpetuals" in detail_types:
            position_type = "perpetual"
        elif "locked" in detail_types:
            position_type = "locked"
        elif "vesting" in detail_types:
            position_type = "vesting"
        elif "lending" in detail_types:
            position_type = "lending"
        elif detail.get("supply_token_list") and len(detail.get("supply_token_list", [])) >= 2:
            position_type = "lp"
        elif detail.get("supply_token_list"):
            position_type = "yield"
        else:
            position_type = "other"
        
        # Build base position object
        position = {
            "id": f"{protocol_id}_{chain}_{position_index or pool.get('id', '')}",
            "protocol": protocol_id,
            "protocolName": protocol_name,
            "chain": chain,
            "type": position_type,
            "name": item.get("name", ""),
            "positionIndex": position_index,
            "poolId": pool.get("id", ""),
            "valueUsd": float(stats.get("asset_usd_value", 0)),
            "detailTypes": detail_types,
            "status": "open",  # DeBank only returns open positions
        }
        
        # Add type-specific fields
        if position_type == "perpetual":
            position.update(_parse_perpetual_details(detail))
        elif position_type == "lp":
            position.update(_parse_lp_details(detail))
        elif position_type in ["yield", "lending"]:
            position.update(_parse_yield_details(detail))
        
        # Generate display name
        position["displayName"] = _generate_position_name(position)
        
        return position
        
    except Exception as e:
        logger.warning(f"Failed to parse position: {e}")
        return None


def _parse_perpetual_details(detail: Dict) -> Dict:
    """Parse perpetual-specific fields from DeBank detail"""
    return {
        "side": detail.get("side", ""),  # "long" or "short"
        "leverage": detail.get("leverage"),
        "entryPrice": detail.get("entry_price"),
        "markPrice": detail.get("mark_price"),
        "liquidationPrice": detail.get("liquidation_price"),
        "pnlUsd": detail.get("pnl_usd_value"),
        "marginRate": detail.get("margin_rate"),
        "fundingRate": detail.get("daily_funding_rate"),
        "marginToken": detail.get("margin_token", {}).get("symbol"),
        "positionToken": detail.get("position_token", {}).get("symbol"),
    }


def _parse_lp_details(detail: Dict) -> Dict:
    """Parse LP position details from DeBank detail"""
    supply_tokens = detail.get("supply_token_list", [])
    reward_tokens = detail.get("reward_token_list", [])
    
    tokens = []
    for token in supply_tokens:
        tokens.append({
            "symbol": token.get("symbol", ""),
            "address": token.get("id", ""),
            "amount": float(token.get("amount", 0)),
            "price": float(token.get("price", 0)),
            "valueUsd": float(token.get("amount", 0)) * float(token.get("price", 0))
        })
    
    rewards = []
    total_rewards_usd = 0
    for token in reward_tokens:
        value = float(token.get("amount", 0)) * float(token.get("price", 0))
        total_rewards_usd += value
        rewards.append({
            "symbol": token.get("symbol", ""),
            "amount": float(token.get("amount", 0)),
            "valueUsd": value
        })
    
    return {
        "tokens": tokens,
        "rewards": rewards,
        "totalRewardsUsd": total_rewards_usd
    }


def _parse_yield_details(detail: Dict) -> Dict:
    """Parse yield/lending position details"""
    supply_tokens = detail.get("supply_token_list", [])
    
    tokens = []
    for token in supply_tokens:
        tokens.append({
            "symbol": token.get("symbol", ""),
            "address": token.get("id", ""),
            "amount": float(token.get("amount", 0)),
            "price": float(token.get("price", 0)),
            "valueUsd": float(token.get("amount", 0)) * float(token.get("price", 0))
        })
    
    return {"tokens": tokens}


def _generate_position_name(position: Dict) -> str:
    """
    Generate a display name for a position.
    
    Format: [Protocol] [Type] [Asset(s)] [Date]
    Examples:
    - GMX Long ETH
    - Uniswap LP ETH/USDC
    - Euler Supply USDC
    """
    protocol = position.get("protocolName", position.get("protocol", "")).split("_")[-1].title()
    pos_type = position.get("type", "")
    
    if pos_type == "perpetual":
        side = position.get("side", "").title()
        token = position.get("positionToken", "")
        return f"{protocol} {side} {token}"
    
    elif pos_type == "lp":
        tokens = position.get("tokens", [])
        if len(tokens) >= 2:
            pair = f"{tokens[0].get('symbol', '')}/{tokens[1].get('symbol', '')}"
            return f"{protocol} LP {pair}"
        return f"{protocol} LP"
    
    elif pos_type in ["yield", "lending"]:
        tokens = position.get("tokens", [])
        if tokens:
            token = tokens[0].get("symbol", "")
            return f"{protocol} Supply {token}"
        return f"{protocol} Yield"
    
    elif pos_type == "locked":
        return f"{protocol} Locked"
    
    elif pos_type == "vesting":
        return f"{protocol} Vesting"
    
    return f"{protocol} Position"


def _count_by_key(items: List[Dict], key: str) -> Dict[str, int]:
    """Count items by a specific key"""
    counts = {}
    for item in items:
        value = item.get(key, "unknown")
        counts[value] = counts.get(value, 0) + 1
    return counts


@router.get("/positions/with-transactions")
async def get_positions_with_transactions(
    wallet: str = Query(..., description="Wallet address"),
    since: Optional[str] = Query("6m", description="Transaction lookback period")
) -> Dict[str, Any]:
    """
    DEPRECATED: This endpoint used the old auto-matching system.
    
    Use these endpoints instead:
    - GET /transactions/grouped - Get transactions grouped by protocol/type/token
    - GET /user-positions - Get user-created positions
    - POST /user-positions/{id}/transactions/{txId} - Add transaction to position
    """
    raise HTTPException(
        status_code=410,
        detail={
            "error": "This endpoint is deprecated",
            "message": "Use /transactions/grouped and /user-positions instead",
            "alternatives": [
                "GET /api/v1/build/transactions/grouped",
                "GET /api/v1/build/user-positions",
                "POST /api/v1/build/user-positions/{id}/transactions/{txId}"
            ]
        }
    )


# NOTE: The following functions were part of the old auto-matching system and are deprecated:
# - _match_transaction_to_position
# - _build_closed_positions  
# - _infer_position_type
# - _generate_closed_position_name
# They have been removed in favor of user-created positions via /user-positions endpoints.


# ===== Phase 7: Strategy Persistence API =====

from pydantic import BaseModel
from typing import List as TypeList


class StrategyPositionInput(BaseModel):
    positionId: str
    percentage: float = 100.0


class CreateStrategyRequest(BaseModel):
    name: str
    description: str | None = None
    positions: TypeList[StrategyPositionInput] = []


class UpdateStrategyRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    positions: TypeList[StrategyPositionInput] | None = None


@router.get("/strategies")
async def get_strategies(
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """
    Get all strategies for a wallet.
    """
    try:
        cache = get_cache(wallet)
        strategies = cache.get_all_strategies()
        
        return {
            "status": "success",
            "data": {
                "strategies": strategies,
                "count": len(strategies)
            }
        }
    except Exception as e:
        logger.exception(f"Error getting strategies for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get strategies", "message": str(e)}
        )


@router.post("/strategies")
async def create_strategy(
    wallet: str = Query(..., description="Wallet address"),
    request: CreateStrategyRequest = None
) -> Dict[str, Any]:
    """
    Create a new strategy.
    """
    try:
        cache = get_cache(wallet)
        
        # Generate unique ID
        import time
        strategy_id = f"strategy_{int(time.time() * 1000)}"
        
        # Convert positions to expected format
        positions = [
            {"position_id": p.positionId, "percentage": p.percentage}
            for p in (request.positions or [])
        ]
        
        strategy = cache.create_strategy(
            strategy_id=strategy_id,
            name=request.name,
            description=request.description,
            positions=positions
        )
        
        return {
            "status": "success",
            "data": strategy
        }
    except Exception as e:
        logger.exception(f"Error creating strategy for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to create strategy", "message": str(e)}
        )


@router.get("/strategies/{strategy_id}")
async def get_strategy(
    strategy_id: str,
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """
    Get a specific strategy by ID.
    """
    try:
        cache = get_cache(wallet)
        strategy = cache.get_strategy(strategy_id)
        
        if not strategy:
            raise HTTPException(status_code=404, detail="Strategy not found")
        
        return {
            "status": "success",
            "data": strategy
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting strategy {strategy_id}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get strategy", "message": str(e)}
        )


@router.put("/strategies/{strategy_id}")
async def update_strategy(
    strategy_id: str,
    wallet: str = Query(..., description="Wallet address"),
    request: UpdateStrategyRequest = None
) -> Dict[str, Any]:
    """
    Update an existing strategy.
    """
    try:
        cache = get_cache(wallet)
        
        # Convert positions if provided
        positions = None
        if request.positions is not None:
            positions = [
                {"positionId": p.positionId, "percentage": p.percentage}
                for p in request.positions
            ]
        
        strategy = cache.update_strategy(
            strategy_id=strategy_id,
            name=request.name,
            description=request.description,
            status=request.status,
            positions=positions
        )
        
        if not strategy:
            raise HTTPException(status_code=404, detail="Strategy not found")
        
        return {
            "status": "success",
            "data": strategy
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating strategy {strategy_id}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to update strategy", "message": str(e)}
        )


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(
    strategy_id: str,
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """
    Delete a strategy.
    """
    try:
        cache = get_cache(wallet)
        deleted = cache.delete_strategy(strategy_id)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Strategy not found")
        
        return {
            "status": "success",
            "data": {"deleted": True, "id": strategy_id}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting strategy {strategy_id}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to delete strategy", "message": str(e)}
        )


# ==================== User Position Endpoints ====================

@router.get("/user-positions")
async def get_user_positions(
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """Get all user-created positions for a wallet."""
    try:
        cache = get_cache(wallet)
        positions = cache.get_all_user_positions()
        
        return {
            "status": "success",
            "data": {
                "positions": positions,
                "count": len(positions)
            }
        }
    except Exception as e:
        logger.exception(f"Error getting user positions for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get positions", "message": str(e)}
        )


@router.post("/user-positions")
async def create_user_position(
    wallet: str = Query(..., description="Wallet address"),
    name: str = Query(..., description="Position name"),
    description: str = Query("", description="Position description"),
    chain: str = Query("", description="Chain"),
    protocol: str = Query("", description="Protocol"),
    position_type: str = Query("", description="Position type (lp, perpetual, yield)")
) -> Dict[str, Any]:
    """Create a new user-defined position."""
    try:
        cache = get_cache(wallet)
        position = cache.create_user_position(
            name=name,
            description=description,
            chain=chain,
            protocol=protocol,
            position_type=position_type
        )
        
        return {
            "status": "success",
            "data": {"position": position}
        }
    except Exception as e:
        logger.exception(f"Error creating position for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to create position", "message": str(e)}
        )


@router.get("/user-positions/{position_id}")
async def get_user_position(
    position_id: str,
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """Get a single user position."""
    try:
        cache = get_cache(wallet)
        position = cache.get_user_position(position_id)
        
        if not position:
            raise HTTPException(status_code=404, detail="Position not found")
        
        return {
            "status": "success",
            "data": {"position": position}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting position {position_id}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get position", "message": str(e)}
        )


@router.put("/user-positions/{position_id}")
async def update_user_position(
    position_id: str,
    wallet: str = Query(..., description="Wallet address"),
    name: str = Query(None, description="New position name"),
    description: str = Query(None, description="New description"),
    status: str = Query(None, description="New status (open/closed)")
) -> Dict[str, Any]:
    """Update a user position."""
    try:
        cache = get_cache(wallet)
        position = cache.update_user_position(
            position_id=position_id,
            name=name,
            description=description,
            status=status
        )
        
        if not position:
            raise HTTPException(status_code=404, detail="Position not found")
        
        return {
            "status": "success",
            "data": {"position": position}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating position {position_id}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to update position", "message": str(e)}
        )


@router.delete("/user-positions/{position_id}")
async def delete_user_position(
    position_id: str,
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """Delete a user position."""
    try:
        cache = get_cache(wallet)
        deleted = cache.delete_user_position(position_id)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Position not found")
        
        return {
            "status": "success",
            "data": {"deleted": True, "id": position_id}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting position {position_id}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to delete position", "message": str(e)}
        )


@router.post("/user-positions/{position_id}/transactions/{transaction_id}")
async def add_transaction_to_position(
    position_id: str,
    transaction_id: str,
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """Add a transaction to a position."""
    try:
        cache = get_cache(wallet)
        success = cache.add_transaction_to_position(position_id, transaction_id)
        
        if not success:
            raise HTTPException(status_code=400, detail="Failed to add transaction")
        
        position = cache.get_user_position(position_id)
        
        return {
            "status": "success",
            "data": {"position": position}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error adding transaction {transaction_id} to position {position_id}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to add transaction", "message": str(e)}
        )


@router.delete("/user-positions/{position_id}/transactions/{transaction_id}")
async def remove_transaction_from_position(
    position_id: str,
    transaction_id: str,
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """Remove a transaction from a position."""
    try:
        cache = get_cache(wallet)
        success = cache.remove_transaction_from_position(position_id, transaction_id)
        
        if not success:
            raise HTTPException(status_code=400, detail="Transaction not in position")
        
        position = cache.get_user_position(position_id)
        
        return {
            "status": "success",
            "data": {"position": position}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error removing transaction {transaction_id} from position {position_id}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to remove transaction", "message": str(e)}
        )


@router.get("/assigned-transactions")
async def get_assigned_transactions(
    wallet: str = Query(..., description="Wallet address")
) -> Dict[str, Any]:
    """Get all transaction IDs that are assigned to positions."""
    try:
        cache = get_cache(wallet)
        assigned_ids = cache.get_assigned_transaction_ids()
        
        return {
            "status": "success",
            "data": {
                "assignedTransactionIds": list(assigned_ids),
                "count": len(assigned_ids)
            }
        }
    except Exception as e:
        logger.exception(f"Error getting assigned transactions for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get assigned transactions", "message": str(e)}
        )
