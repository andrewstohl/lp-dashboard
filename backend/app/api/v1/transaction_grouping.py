"""
Transaction grouping and flow inference for Build page.

Groups LP transactions by NFT position ID (extracted from mint transactions).
Groups perp transactions by market/direction.
Infers flow direction (INCREASE/DECREASE/OVERHEAD) from net value.
"""

from typing import Dict, List, Any, Tuple, Optional
from datetime import datetime
from collections import defaultdict


# === Helper Functions (must be defined first) ===

def _is_nft_token(token_id: str, amount: float) -> bool:
    """Check if a token is an NFT (amount=1, hash-like ID without 0x prefix)."""
    return amount == 1 and len(token_id) >= 20 and not token_id.startswith("0x")


def _extract_nft_id(tx: Dict) -> Optional[str]:
    """
    Extract NFT position ID from a transaction's receives.
    NFTs appear in MINT transactions with amount=1 and hash-like token_id.
    """
    for r in tx.get("receives", []) or []:
        token_id = r.get("token_id", "")
        amount = r.get("amount", 0)
        if _is_nft_token(token_id, amount):
            return token_id
    return None


def _get_pool_addresses(tx: Dict) -> List[str]:
    """
    Extract all pool addresses from a transaction.
    Pool addresses appear in to_addr (sends) and from_addr (receives).
    """
    pool_addrs = set()
    
    for s in tx.get("sends", []) or []:
        to_addr = s.get("to_addr", "")
        if to_addr and to_addr != "0x0000000000000000000000000000000000000000":
            pool_addrs.add(to_addr.lower())
    
    for r in tx.get("receives", []) or []:
        from_addr = r.get("from_addr", "")
        amount = r.get("amount", 0)
        token_id = r.get("token_id", "")
        if _is_nft_token(token_id, amount):
            continue
        if from_addr and from_addr != "0x0000000000000000000000000000000000000000":
            pool_addrs.add(from_addr.lower())
    
    return list(pool_addrs)


def _is_lp_protocol(project_id: str) -> bool:
    """Check if project is an LP protocol that uses NFT positions."""
    if not project_id:
        return False
    project_lower = project_id.lower()
    return any(x in project_lower for x in ["uniswap", "pancake", "sushi", "aero", "velo"])


# === Main Functions ===

def infer_flow_direction(tx: Dict, token_dict: Dict) -> Tuple[str, float, float, float]:
    """
    Infer the flow direction of a transaction based on net value.
    
    Returns: (direction, net_value, total_in, total_out)
    """
    sends = tx.get("sends", []) or []
    receives = tx.get("receives", []) or []
    
    total_out = 0.0
    total_in = 0.0
    
    for s in sends:
        token_id = s.get("token_id", "")
        amount = float(s.get("amount", 0))
        price = s.get("price_usd")
        if price is None:
            price = token_dict.get(token_id, {}).get("price", 0) or 0
        total_out += amount * price
    
    for r in receives:
        token_id = r.get("token_id", "")
        amount = float(r.get("amount", 0))
        if _is_nft_token(token_id, amount):
            continue
        price = r.get("price_usd")
        if price is None:
            price = token_dict.get(token_id, {}).get("price", 0) or 0
        total_in += amount * price
    
    net_value = total_in - total_out
    
    if abs(net_value) < 1.0:
        direction = "OVERHEAD"
    elif net_value > 0:
        direction = "DECREASE"
    else:
        direction = "INCREASE"
    
    return direction, net_value, total_in, total_out


def get_transaction_tokens(tx: Dict, token_dict: Dict) -> List[str]:
    """Get list of token symbols involved in a transaction (excluding NFTs)."""
    tokens = set()
    
    for s in (tx.get("sends", []) or []):
        token_id = s.get("token_id", "")
        amount = s.get("amount", 0)
        if _is_nft_token(token_id, amount):
            continue
        token_info = token_dict.get(token_id, {})
        symbol = s.get("symbol") or token_info.get("symbol") or token_info.get("optimized_symbol") or ""
        if symbol and not token_info.get("is_scam"):
            tokens.add(symbol.upper())
        elif token_id and not symbol:
            tokens.add(token_id[:10].upper())
    
    for r in (tx.get("receives", []) or []):
        token_id = r.get("token_id", "")
        amount = r.get("amount", 0)
        if _is_nft_token(token_id, amount):
            continue
        token_info = token_dict.get(token_id, {})
        symbol = r.get("symbol") or token_info.get("symbol") or token_info.get("optimized_symbol") or ""
        if symbol and not token_info.get("is_scam"):
            tokens.add(symbol.upper())
        elif token_id and not symbol:
            tokens.add(token_id[:10].upper())
    
    return sorted(list(tokens))


def infer_position_type(tx: Dict) -> str:
    """Infer position type from transaction characteristics."""
    tx_name = (tx.get("tx", {}).get("name") or "").lower()
    project_id = (tx.get("project_id") or "").lower()
    
    # Perpetual indicators
    if any(x in project_id for x in ["gmx", "gains", "kwenta", "perp"]):
        return "perpetual"
    
    # LP indicators
    lp_actions = ["addliquidity", "removeliquidity", "mint", "burn", 
                  "increaseliquidity", "decreaseliquidity", "collect", "multicall"]
    lp_protocols = ["uniswap", "pancake", "sushi", "curve", "balancer", "aero", "velo"]
    
    if any(x in tx_name for x in lp_actions):
        if any(x in project_id for x in lp_protocols):
            return "lp"
    if any(x in project_id for x in lp_protocols):
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
    Group transactions intelligently:
    - LP positions: Group by NFT ID (extracted from mint), display token pair
    - Perp positions: Group by market tokens
    - Other: Group by protocol + tokens
    
    Two-pass algorithm for LP:
    1. First pass: Find all MINTs and extract NFT ID + pool address + tokens
    2. Second pass: Match other txs to NFT positions by pool address
    """
    
    # === FIRST PASS: Build NFT position registry from MINT transactions ===
    # Maps pool_address -> list of {nft_id, tokens, chain, protocol, mint_time}
    nft_positions: Dict[str, List[Dict]] = defaultdict(list)
    
    for tx in transactions:
        project_id = tx.get("project_id") or ""
        if not _is_lp_protocol(project_id):
            continue
        
        nft_id = _extract_nft_id(tx)
        if not nft_id:
            continue
        
        # This is a MINT transaction - extract position info
        pool_addrs = _get_pool_addresses(tx)
        tokens = get_transaction_tokens(tx, token_dict)
        chain = tx.get("chain", "unknown")
        mint_time = tx.get("time_at", 0)
        
        for pool_addr in pool_addrs:
            nft_positions[pool_addr].append({
                "nft_id": nft_id,
                "tokens": tokens,
                "chain": chain,
                "protocol": project_id,
                "mint_time": mint_time,
            })
    
    # === SECOND PASS: Group all transactions ===
    groups: Dict[str, Dict] = {}
    
    for tx in transactions:
        chain = tx.get("chain", "unknown")
        project_id = tx.get("project_id") or "unknown"
        pos_type = infer_position_type(tx)
        
        # Get protocol display name
        project_info = project_dict.get(project_id, {})
        protocol_name = project_info.get("name") or project_id.replace("_", " ").title()
        
        # Get tokens from this transaction
        tokens = get_transaction_tokens(tx, token_dict)
        tokens_str = "/".join(tokens) if tokens else "Unknown"
        
        # Determine group key based on position type
        group_key = None
        display_tokens = tokens_str
        nft_id = None

        
        if pos_type == "lp" and _is_lp_protocol(project_id):
            # LP Position: Try to match to an NFT position
            pool_addrs = _get_pool_addresses(tx)
            tx_nft_id = _extract_nft_id(tx)
            
            if tx_nft_id:
                # This is a MINT - use its own NFT ID
                nft_id = tx_nft_id
                group_key = f"{chain}|{project_id}|lp|nft:{nft_id}"
                display_tokens = tokens_str
            else:
                # Try to match to a known NFT position by pool address
                matched_position = None
                for pool_addr in pool_addrs:
                    if pool_addr in nft_positions:
                        # Find the best matching position (same chain/protocol)
                        candidates = [p for p in nft_positions[pool_addr] 
                                     if p["chain"] == chain and p["protocol"] == project_id]
                        if candidates:
                            if len(candidates) == 1:
                                matched_position = candidates[0]
                            else:
                                # Multiple positions in same pool - match by token overlap
                                best_match = None
                                best_overlap = 0
                                for cand in candidates:
                                    overlap = len(set(tokens) & set(cand["tokens"]))
                                    if overlap > best_overlap:
                                        best_overlap = overlap
                                        best_match = cand
                                matched_position = best_match or candidates[0]
                            break
                
                if matched_position:
                    nft_id = matched_position["nft_id"]
                    group_key = f"{chain}|{project_id}|lp|nft:{nft_id}"
                    if matched_position["tokens"]:
                        display_tokens = "/".join(matched_position["tokens"])
                else:
                    # No NFT match - fall back to pool address grouping
                    pool_addr = pool_addrs[0] if pool_addrs else "unknown"
                    group_key = f"{chain}|{project_id}|lp|pool:{pool_addr}"
        
        elif pos_type == "perpetual":
            # Perp: Group by tokens (market)
            group_key = f"{chain}|{project_id}|perpetual|{tokens_str}"
        
        else:
            # Other: Group by protocol + tokens
            group_key = f"{chain}|{project_id}|{pos_type}|{tokens_str}"

        
        # Infer flow direction
        direction, net_value, total_in, total_out = infer_flow_direction(tx, token_dict)
        
        # Add flow info and NFT ID to transaction
        tx_with_flow = {
            **tx,
            "_flowDirection": direction,
            "_netValue": net_value,
            "_totalIn": total_in,
            "_totalOut": total_out,
            "_nftId": nft_id,
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
                "tokensDisplay": display_tokens,
                "nftId": nft_id,
                "transactions": [],
                "totalIn": 0.0,
                "totalOut": 0.0,
                "latestActivity": 0,
            }
        
        groups[group_key]["transactions"].append(tx_with_flow)
        groups[group_key]["totalIn"] += total_in
        groups[group_key]["totalOut"] += total_out
        
        # Update tokens display if this tx has better token info
        if tokens and groups[group_key]["tokensDisplay"] in ["Unknown", ""]:
            groups[group_key]["tokensDisplay"] = tokens_str
            groups[group_key]["tokens"] = tokens
        
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
