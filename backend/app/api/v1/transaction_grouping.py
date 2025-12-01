"""
Transaction grouping and flow inference for Build page.
Groups transactions by network > protocol > type > token.
Infers flow direction (INCREASE/DECREASE/OVERHEAD) from net value.
"""

from typing import Dict, List, Any, Tuple
from datetime import datetime


def infer_flow_direction(tx: Dict, token_dict: Dict) -> Tuple[str, float, float, float]:
    """
    Infer the flow direction of a transaction based on net value.
    
    Returns: (direction, net_value, total_in, total_out)
    - INCREASE: Money left wallet (opening/adding to position)
    - DECREASE: Money entered wallet (closing/reducing position)
    - OVERHEAD: Negligible net movement
    """
    sends = tx.get("sends", []) or []
    receives = tx.get("receives", []) or []
    
    total_out = 0.0
    total_in = 0.0
    
    for s in sends:
        token_id = s.get("token_id", "")
        amount = float(s.get("amount", 0))
        price = token_dict.get(token_id, {}).get("price", 0) or 0
        total_out += amount * price
    
    for r in receives:
        token_id = r.get("token_id", "")
        amount = float(r.get("amount", 0))
        price = token_dict.get(token_id, {}).get("price", 0) or 0
        total_in += amount * price
    
    net_value = total_in - total_out
    
    if abs(net_value) < 1.0:
        direction = "OVERHEAD"
    elif net_value > 0:
        direction = "DECREASE"  # Money came in = reducing position
    else:
        direction = "INCREASE"  # Money went out = adding to position
    
    return direction, net_value, total_in, total_out


def get_transaction_tokens(tx: Dict, token_dict: Dict) -> List[str]:
    """Get list of token symbols involved in a transaction."""
    tokens = set()
    
    for s in (tx.get("sends", []) or []):
        token_id = s.get("token_id", "")
        token_info = token_dict.get(token_id, {})
        symbol = token_info.get("symbol") or token_info.get("optimized_symbol") or ""
        if symbol and not token_info.get("is_scam"):
            tokens.add(symbol.upper())
    
    for r in (tx.get("receives", []) or []):
        token_id = r.get("token_id", "")
        token_info = token_dict.get(token_id, {})
        symbol = token_info.get("symbol") or token_info.get("optimized_symbol") or ""
        if symbol and not token_info.get("is_scam"):
            tokens.add(symbol.upper())
    
    return sorted(list(tokens))


def infer_position_type(tx: Dict) -> str:
    """Infer position type from transaction characteristics."""
    tx_name = (tx.get("tx", {}).get("name") or "").lower()
    project_id = (tx.get("project_id") or "").lower()
    
    # Perpetual indicators
    if any(x in project_id for x in ["gmx", "gains", "kwenta", "perp"]):
        if any(x in tx_name for x in ["short", "long", "order", "position"]):
            return "perpetual"
        return "perpetual"
    
    # LP indicators
    if any(x in tx_name for x in ["addliquidity", "removeliquidity", "mint", "burn", "increaseliquidity", "decreaseliquidity", "collect"]):
        return "lp"
    if any(x in project_id for x in ["uniswap", "pancake", "sushi", "curve", "balancer"]):
        return "lp"
    
    # Yield/lending indicators
    if any(x in tx_name for x in ["deposit", "withdraw", "supply", "borrow", "repay"]):
        return "yield"
    if any(x in project_id for x in ["aave", "compound", "euler", "silo", "morpho"]):
        return "yield"
    
    return "other"


def group_transactions(
    transactions: List[Dict],
    token_dict: Dict,
    project_dict: Dict
) -> List[Dict]:
    """
    Group transactions by network > protocol > type > token.
    
    Returns list of groups, each containing:
    - groupKey: unique identifier
    - chain, protocol, positionType, tokens
    - transactions: list with flow direction added
    - summary: total in/out, transaction count
    - latestActivity: timestamp of most recent transaction
    """
    groups: Dict[str, Dict] = {}
    
    for tx in transactions:
        chain = tx.get("chain", "unknown")
        project_id = tx.get("project_id") or "unknown"
        
        # Get protocol display name
        project_info = project_dict.get(project_id, {})
        protocol_name = project_info.get("name") or project_id.replace("_", " ").title()
        
        # Infer position type
        pos_type = infer_position_type(tx)
        
        # Get tokens involved
        tokens = get_transaction_tokens(tx, token_dict)
        tokens_str = "/".join(tokens) if tokens else "Unknown"
        
        # Create group key
        group_key = f"{chain}|{project_id}|{pos_type}|{tokens_str}"
        
        # Infer flow direction
        direction, net_value, total_in, total_out = infer_flow_direction(tx, token_dict)
        
        # Add flow info to transaction
        tx_with_flow = {
            **tx,
            "_flowDirection": direction,
            "_netValue": net_value,
            "_totalIn": total_in,
            "_totalOut": total_out,
        }
        
        # Add to group
        if group_key not in groups:
            groups[group_key] = {
                "groupKey": group_key,
                "chain": chain,
                "protocol": project_id,
                "protocolName": protocol_name,
                "positionType": pos_type,
                "tokens": tokens,
                "tokensDisplay": tokens_str,
                "transactions": [],
                "totalIn": 0.0,
                "totalOut": 0.0,
                "latestActivity": 0,
            }
        
        groups[group_key]["transactions"].append(tx_with_flow)
        groups[group_key]["totalIn"] += total_in
        groups[group_key]["totalOut"] += total_out
        
        tx_time = tx.get("time_at", 0)
        if tx_time > groups[group_key]["latestActivity"]:
            groups[group_key]["latestActivity"] = tx_time
    
    # Convert to list and sort by latest activity (most recent first)
    result = list(groups.values())
    result.sort(key=lambda g: -g["latestActivity"])
    
    # Sort transactions within each group by time (most recent first)
    for group in result:
        group["transactions"].sort(key=lambda t: -t.get("time_at", 0))
        group["transactionCount"] = len(group["transactions"])
        group["netValue"] = group["totalIn"] - group["totalOut"]
    
    return result
