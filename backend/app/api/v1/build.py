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
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging

from backend.services.discovery import get_discovery_service, DEFAULT_CHAIN_NAMES
from backend.services.transaction_cache import get_cache
from backend.services.coingecko_prices import get_price_service
from backend.services.debank import get_debank_service

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
    """
    total_value = 0.0
    
    for token in tx.get("receives", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        token_info = token_dict.get(token_id, {})
        price = token_info.get("price", 0) or 0
        total_value += amount * price
    
    for token in tx.get("sends", []) or []:
        token_id = token.get("token_id", "")
        amount = float(token.get("amount", 0))
        token_info = token_dict.get(token_id, {})
        price = token_info.get("price", 0) or 0
        total_value += amount * price
    
    # If we can calculate value and it's below threshold, it's dust
    return total_value > 0 and total_value < threshold_usd


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


def _filter_transactions(
    transactions: List[Dict],
    token_dict: Dict,
    show_spam: bool = False,
    show_dust: bool = False,
    show_approvals: bool = False,
    show_bridges_swaps: bool = False,
    show_failed: bool = False,
    categories: Optional[List[str]] = None
) -> List[Dict]:
    """
    Filter transactions for Build page display.
    
    Default behavior (Build page) per MVT rules:
    - Hide spam/scam tokens
    - Hide dust (<$0.10)
    - Hide standalone approvals
    - Hide bridges and swaps (not positions)
    - Hide failed transactions
    - Show only position-relevant transactions
    """
    filtered = []
    hidden_counts = {
        "spam": 0,
        "dust": 0,
        "approval": 0,
        "bridge_swap": 0,
        "failed": 0
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
    Fetch positions and link transactions to each position.
    
    This is the core Build page endpoint that:
    1. Fetches open positions from DeBank
    2. Fetches transactions from cache
    3. Links transactions to positions by matching identifiers
    4. Returns unmatched transactions separately
    """
    try:
        # Get positions
        positions_response = await get_build_positions(wallet)
        positions = positions_response["data"]["positions"]
        
        # Get transactions
        until_dt = datetime.now()
        since_dt = _parse_date(since) if since else (until_dt - timedelta(days=180))
        
        discovery = await get_discovery_service()
        tx_result = await discovery.discover_transactions(
            wallet_address=wallet,
            chains=None,
            since=since_dt,
            until=until_dt,
            force_refresh=False
        )
        
        all_transactions = tx_result["transactions"]
        token_dict = tx_result["token_dict"]
        
        # Apply MVT filtering
        filtered_txs, _ = _filter_transactions(
            all_transactions, token_dict,
            show_spam=False, show_dust=False, 
            show_approvals=False, show_bridges_swaps=False, show_failed=False
        )
        
        # Link transactions to positions
        position_transactions = {p["id"]: [] for p in positions}
        unmatched_transactions = []
        
        for tx in filtered_txs:
            matched_position_id = _match_transaction_to_position(tx, positions, token_dict)
            
            if matched_position_id:
                position_transactions[matched_position_id].append(tx)
            else:
                unmatched_transactions.append(tx)
        
        # Add transactions to positions
        for position in positions:
            position["transactions"] = position_transactions.get(position["id"], [])
            position["transactionCount"] = len(position["transactions"])
            position["status"] = "open"
        
        # Build closed positions from unmatched transactions
        closed_positions = _build_closed_positions(unmatched_transactions, token_dict)
        
        # Combine open and closed positions
        all_positions = positions + closed_positions
        
        # Recalculate unmatched (only those that didn't get grouped into closed positions)
        closed_tx_count = sum(p.get("transactionCount", 0) for p in closed_positions)
        truly_unmatched = len(unmatched_transactions) - closed_tx_count
        
        return {
            "status": "success",
            "data": {
                "transactions": filtered_txs,
                "positions": all_positions,
                "openPositions": positions,
                "closedPositions": closed_positions,
                "unmatchedTransactions": [tx for tx in unmatched_transactions if not tx.get("project_id")],
                "wallet": wallet.lower(),
                "tokenDict": token_dict,
                "summary": {
                    "total": len(filtered_txs),
                    "totalPositions": len(all_positions),
                    "openPositions": len(positions),
                    "closedPositions": len(closed_positions),
                    "totalTransactions": len(filtered_txs),
                    "matchedTransactions": len(filtered_txs) - truly_unmatched,
                    "unmatchedTransactions": truly_unmatched,
                    "matchRate": f"{((len(filtered_txs) - truly_unmatched) / len(filtered_txs) * 100):.1f}%" if filtered_txs else "0%"
                }
            }
        }
        
    except Exception as e:
        logger.exception(f"Error getting positions with transactions for {wallet}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to get positions with transactions", "message": str(e)}
        )


def _match_transaction_to_position(tx: Dict, positions: List[Dict], token_dict: Dict) -> Optional[str]:
    """
    Match a transaction to a position.
    
    Matching strategies (in priority order):
    1. Exact NFT tokenId match (for LP positions)
    2. Protocol + chain match (for all position types)
    3. Pool address match (for yield/lending)
    """
    tx_project = (tx.get("project_id") or "").lower()
    tx_chain = tx.get("chain", "")
    tx_name = (tx.get("tx", {}).get("name") or "").lower()
    
    # Skip if no project (can't match)
    if not tx_project:
        return None
    
    # Build list of candidate positions on same chain
    candidates = []
    
    for position in positions:
        pos_protocol = (position.get("protocol") or "").lower()
        pos_chain = position.get("chain", "")
        pos_type = position.get("type", "")
        
        # Chain must match
        if pos_chain != tx_chain:
            continue
        
        # Protocol must be related
        # Handle various naming: uniswap3 <-> uniswap, arb_gmx2 <-> gmx, etc.
        protocol_match = False
        if pos_protocol and tx_project:
            # Extract core protocol name (remove chain prefix/suffix)
            pos_core = pos_protocol.replace("arb_", "").replace("eth_", "").replace("base_", "").replace("uni_", "")
            tx_core = tx_project.replace("arb_", "").replace("eth_", "").replace("base_", "").replace("uni_", "")
            
            if pos_core in tx_core or tx_core in pos_core:
                protocol_match = True
            # Special cases
            if "gmx" in pos_core and "gmx" in tx_core:
                protocol_match = True
            if "uniswap" in pos_core and "uniswap" in tx_core:
                protocol_match = True
            if "euler" in pos_core and "euler" in tx_core:
                protocol_match = True
        
        if protocol_match:
            candidates.append(position)
    
    # If we have exactly one candidate, return it
    if len(candidates) == 1:
        return candidates[0]["id"]
    
    # If multiple candidates, try to narrow down
    if len(candidates) > 1:
        # For perpetuals, all GMX trades go to the GMX positions
        # We can't distinguish which specific position without deeper analysis
        # For now, match to the first perpetual if it's a GMX transaction
        perp_candidates = [c for c in candidates if c.get("type") == "perpetual"]
        if perp_candidates and "gmx" in tx_project:
            return perp_candidates[0]["id"]
        
        # For LP, match to LP positions
        lp_candidates = [c for c in candidates if c.get("type") == "lp"]
        if lp_candidates and tx_name in ["mint", "burn", "increaseliquidity", "decreaseliquidity", "collect"]:
            return lp_candidates[0]["id"]
        
        # For yield, match any yield position
        yield_candidates = [c for c in candidates if c.get("type") in ["yield", "lending"]]
        if yield_candidates:
            return yield_candidates[0]["id"]
        
        # Default to first candidate
        return candidates[0]["id"]
    
    return None


def _build_closed_positions(unmatched_txs: List[Dict], token_dict: Dict) -> List[Dict]:
    """
    Build closed position entries from unmatched transactions.
    
    Groups transactions by protocol + chain to identify potential closed positions.
    """
    # Group transactions by protocol + chain
    groups = {}
    
    for tx in unmatched_txs:
        project = tx.get("project_id") or ""
        chain = tx.get("chain", "")
        
        if not project:
            continue
            
        key = f"{project}_{chain}"
        if key not in groups:
            groups[key] = {
                "protocol": project,
                "chain": chain,
                "transactions": [],
                "earliest": None,
                "latest": None
            }
        
        groups[key]["transactions"].append(tx)
        
        tx_time = tx.get("time_at", 0)
        if groups[key]["earliest"] is None or tx_time < groups[key]["earliest"]:
            groups[key]["earliest"] = tx_time
        if groups[key]["latest"] is None or tx_time > groups[key]["latest"]:
            groups[key]["latest"] = tx_time
    
    # Convert groups to closed position objects
    closed_positions = []
    
    for key, group in groups.items():
        txs = group["transactions"]
        if len(txs) < 1:
            continue
        
        # Determine position type from transactions
        pos_type = _infer_position_type(txs)
        
        # Calculate total value from transactions
        total_value = 0.0
        for tx in txs:
            for token in (tx.get("sends", []) or []) + (tx.get("receives", []) or []):
                token_id = token.get("token_id", "")
                amount = float(token.get("amount", 0))
                info = token_dict.get(token_id, {})
                price = float(info.get("price", 0) or 0)
                total_value += amount * price
        
        # Generate ID and name
        protocol_name = group["protocol"].replace("arb_", "").replace("eth_", "").replace("base_", "").title()
        
        position = {
            "id": f"closed_{key}",
            "protocol": group["protocol"],
            "protocolName": protocol_name,
            "chain": group["chain"],
            "type": pos_type,
            "name": f"Closed {protocol_name}",
            "positionIndex": None,
            "poolId": None,
            "valueUsd": 0,  # Closed positions have 0 current value
            "historicalValueUsd": total_value,
            "detailTypes": [],
            "status": "closed",
            "openedAt": group["earliest"],
            "closedAt": group["latest"],
            "transactionCount": len(txs),
            "transactions": txs
        }
        
        # Generate display name
        position["displayName"] = _generate_closed_position_name(position, txs, token_dict)
        
        closed_positions.append(position)
    
    return closed_positions


def _infer_position_type(txs: List[Dict]) -> str:
    """Infer position type from transaction patterns"""
    tx_names = [tx.get("tx", {}).get("name", "").lower() for tx in txs]
    projects = [tx.get("project_id", "").lower() for tx in txs]
    
    # Check for perpetual indicators
    if any("gmx" in p for p in projects):
        if any(name in ["executeorder", "batch", "createorder"] for name in tx_names):
            return "perpetual"
    
    # Check for LP indicators
    lp_keywords = ["mint", "burn", "increaseliquidity", "decreaseliquidity", "addliquidity", "removeliquidity"]
    if any(keyword in name for name in tx_names for keyword in lp_keywords):
        return "lp"
    
    # Check for yield/lending indicators
    yield_keywords = ["deposit", "withdraw", "supply", "borrow", "repay", "stake", "unstake"]
    if any(keyword in name for name in tx_names for keyword in yield_keywords):
        return "yield"
    
    return "other"


def _generate_closed_position_name(position: Dict, txs: List[Dict], token_dict: Dict) -> str:
    """
    Generate a display name for a closed position.
    
    Format: [Protocol] [Type] [Asset(s)] [MM/DD/YY]
    Examples:
    - PancakeSwap LP CAKE/BNB 10/05/24
    - Uniswap LP ETH/USDC 09/01/24
    - Astherus Yield 11/15/24
    """
    protocol = position.get("protocolName", "Unknown")
    # Clean up protocol name
    protocol = protocol.replace("Bsc_", "").replace("Arb_", "").replace("Eth_", "").replace("Base_", "")
    protocol = protocol.replace("Matic_", "").replace("Uni_", "")
    
    pos_type = position.get("type", "")
    
    # Get open date from position
    opened_at = position.get("openedAt")
    date_str = ""
    if opened_at:
        from datetime import datetime
        dt = datetime.fromtimestamp(opened_at)
        date_str = dt.strftime("%m/%d/%y")
    
    # Try to extract token symbols from transactions
    token_symbols = []
    for tx in txs[:10]:  # Check first 10 transactions
        for token in (tx.get("sends", []) or []) + (tx.get("receives", []) or []):
            token_id = token.get("token_id", "")
            if token_id and not token_id.startswith("0x0000"):
                # Look up symbol from token_dict
                token_info = token_dict.get(token_id, {})
                symbol = token_info.get("symbol") or token_info.get("optimized_symbol")
                if symbol and symbol not in token_symbols and len(token_symbols) < 2:
                    token_symbols.append(symbol)
    
    # Build name based on type
    if pos_type == "perpetual":
        assets = token_symbols[0] if token_symbols else ""
        return f"{protocol} Perp {assets} {date_str}".strip()
    elif pos_type == "lp":
        if len(token_symbols) >= 2:
            assets = f"{token_symbols[0]}/{token_symbols[1]}"
        elif token_symbols:
            assets = token_symbols[0]
        else:
            assets = ""
        return f"{protocol} LP {assets} {date_str}".strip()
    elif pos_type == "yield":
        assets = token_symbols[0] if token_symbols else ""
        return f"{protocol} Yield {assets} {date_str}".strip()
    else:
        return f"{protocol} {date_str}".strip()
    if pos_type == "perpetual":
        return f"{protocol} Perp (Closed)"
    elif pos_type == "lp":
        return f"{protocol} LP (Closed)"
    elif pos_type == "yield":
        return f"{protocol} Yield (Closed)"
    
    return f"{protocol} Position (Closed)"



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
