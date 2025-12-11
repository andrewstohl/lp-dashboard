"""
Build endpoint - Strategy Builder API
Combines Uniswap V3 Subgraph (primary) with DeBank (secondary) for complete coverage.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Any, Optional
import logging
import asyncio
from datetime import datetime, timedelta

from backend.services.discovery import TransactionDiscoveryService
from backend.services.thegraph import TheGraphService
from backend.services.gmx_subgraph import GMXSubgraphService
from backend.services.debank import get_debank_service
from backend.services.coingecko import CoinGeckoService
from backend.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/build", tags=["build"])

CHAIN_NAMES = {
    "eth": "Ethereum",
    "arb": "Arbitrum",
    "op": "Optimism",
    "base": "Base",
    "matic": "Polygon",
    "bsc": "BNB Chain",
}


def _format_position_from_subgraph(position: dict) -> dict:
    """Format a subgraph position into our standard format."""
    pool = position.get("pool", {})
    token0 = pool.get("token0", {})
    token1 = pool.get("token1", {})
    tx = position.get("transaction", {})

    liquidity = int(position.get("liquidity", 0))
    fee_tier = int(pool.get("feeTier", 0)) / 10000

    return {
        "position_id": position.get("id"),
        "pool_address": pool.get("id", ""),
        "chain": "eth",  # Ethereum mainnet subgraph
        "chain_name": "Ethereum",
        "token0": token0.get("id", ""),
        "token1": token1.get("id", ""),
        "token0_symbol": token0.get("symbol", "UNKNOWN"),
        "token1_symbol": token1.get("symbol", "UNKNOWN"),
        "fee_tier": f"{fee_tier}%",
        "status": "ACTIVE" if liquidity > 0 else "CLOSED",
        "liquidity": str(liquidity),
        "deposited_token0": float(position.get("depositedToken0", 0)),
        "deposited_token1": float(position.get("depositedToken1", 0)),
        "withdrawn_token0": float(position.get("withdrawnToken0", 0)),
        "withdrawn_token1": float(position.get("withdrawnToken1", 0)),
        "collected_fees_token0": float(position.get("collectedFeesToken0", 0)),
        "collected_fees_token1": float(position.get("collectedFeesToken1", 0)),
        "mint_timestamp": int(tx.get("timestamp", 0)),
        "mint_block": int(tx.get("blockNumber", 0)),
        "data_source": "subgraph",
        "transactions": []  # Will be populated from DeBank if available
    }


@router.get("/uniswap-lp")
async def get_uniswap_lp_positions(
    wallet: str = Query(..., description="Wallet address"),
    force_refresh: bool = Query(False, description="Force refresh from DeBank")
) -> dict[str, Any]:
    """
    Get ALL Uniswap V3 LP positions using subgraph as primary source.

    This endpoint:
    1. Queries Uniswap V3 subgraph for ALL positions (comprehensive)
    2. Queries DeBank for transaction history (for enrichment)
    3. Merges data and shows source for each position
    4. Highlights positions that DeBank missed
    """
    try:
        # Initialize services
        thegraph = TheGraphService(settings.thegraph_api_key)
        discovery = TransactionDiscoveryService()

        # Step 1: Get ALL positions from Uniswap V3 subgraph (PRIMARY SOURCE)
        logger.info(f"Querying Uniswap V3 subgraph for positions...")
        subgraph_positions = await thegraph.get_positions_by_owner(wallet)

        # Format subgraph positions
        positions_by_pool: dict[str, dict] = {}
        for pos in subgraph_positions:
            formatted = _format_position_from_subgraph(pos)
            pool_key = formatted["pool_address"].lower()

            # Group by pool - if multiple positions in same pool, keep track
            if pool_key not in positions_by_pool:
                positions_by_pool[pool_key] = {
                    "pool_address": formatted["pool_address"],
                    "chain": formatted["chain"],
                    "chain_name": formatted["chain_name"],
                    "token0": formatted["token0"],
                    "token1": formatted["token1"],
                    "token0_symbol": formatted["token0_symbol"],
                    "token1_symbol": formatted["token1_symbol"],
                    "fee_tier": formatted["fee_tier"],
                    "positions": [],
                    "data_source": "subgraph",
                    "debank_tx_count": 0,
                    "transactions": []
                }

            positions_by_pool[pool_key]["positions"].append({
                "position_id": formatted["position_id"],
                "status": formatted["status"],
                "liquidity": formatted["liquidity"],
                "deposited_token0": formatted["deposited_token0"],
                "deposited_token1": formatted["deposited_token1"],
                "collected_fees_token0": formatted["collected_fees_token0"],
                "collected_fees_token1": formatted["collected_fees_token1"],
                "mint_timestamp": formatted["mint_timestamp"]
            })

        logger.info(f"Subgraph found {len(subgraph_positions)} positions across {len(positions_by_pool)} pools")

        # Step 2: Get transactions from DeBank (SECONDARY SOURCE for history)
        logger.info(f"Querying DeBank for transaction history...")
        since = datetime.now() - timedelta(days=365)
        debank_result = await discovery.discover_transactions(
            wallet_address=wallet,
            since=since,
            force_refresh=force_refresh,
            max_pages=500
        )

        all_txs = debank_result["transactions"]

        # Filter for LP transactions
        lp_projects = ['uniswap', 'pancake', 'sushi', 'aero', 'curve', 'balancer']
        lp_txs = [
            tx for tx in all_txs
            if any(lp in (tx.get("project_id") or "").lower() for lp in lp_projects)
        ]

        logger.info(f"DeBank returned {len(all_txs)} total txs, {len(lp_txs)} LP txs")

        # Step 3: Match DeBank transactions to subgraph positions
        debank_pools: set[str] = set()
        for tx in lp_txs:
            pool_addr = tx.get("other_addr")
            if not pool_addr:
                continue

            pool_key = pool_addr.lower()
            debank_pools.add(pool_key)

            if pool_key in positions_by_pool:
                # Add transaction to existing pool
                positions_by_pool[pool_key]["debank_tx_count"] += 1
                positions_by_pool[pool_key]["data_source"] = "both"
                positions_by_pool[pool_key]["transactions"].append({
                    "id": tx.get("id"),
                    "type": tx.get("tx", {}).get("name") or tx.get("cate_id") or "unknown",
                    "timestamp": tx.get("time_at"),
                    "hash": tx.get("tx", {}).get("hash", ""),
                })

        # Step 4: Identify pools DeBank missed
        subgraph_only_pools = set(positions_by_pool.keys()) - debank_pools

        # Build final results
        pools_list = []
        for pool_key, pool_data in positions_by_pool.items():
            pool_data["debank_missed"] = pool_key in subgraph_only_pools
            pool_data["position_count"] = len(pool_data["positions"])

            # Sort transactions by timestamp
            pool_data["transactions"].sort(
                key=lambda x: x.get("timestamp", 0),
                reverse=True
            )

            pools_list.append(pool_data)

        # Sort by most recent activity
        pools_list.sort(
            key=lambda p: max(
                [pos["mint_timestamp"] for pos in p["positions"]] +
                [tx.get("timestamp", 0) for tx in p["transactions"]],
                default=0
            ),
            reverse=True
        )

        # Cleanup
        await thegraph.close()
        await discovery.close()

        # Count active vs closed positions
        active_positions = sum(
            1 for pool in positions_by_pool.values()
            for pos in pool["positions"]
            if pos["status"] == "ACTIVE"
        )
        closed_positions = len(subgraph_positions) - active_positions

        # Build summary
        summary = {
            "subgraph_positions": len(subgraph_positions),
            "subgraph_pools": len(positions_by_pool),
            "active_positions": active_positions,
            "closed_positions": closed_positions,
            "debank_total_txs": len(all_txs),
            "debank_lp_txs": len(lp_txs),
            "note": "DeBank returns Position Manager address, not pool address - subgraph is primary source for LP positions"
        }

        return {
            "status": "success",
            "data": {
                "pools": pools_list,
                "summary": summary,
                "data_sources": {
                    "primary": "Uniswap V3 Subgraph (comprehensive)",
                    "secondary": "DeBank API (transaction history)"
                }
            }
        }

    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return {
            "status": "error",
            "detail": {"error": str(e)}
        }


@router.get("/subgraph-only")
async def get_subgraph_positions(
    wallet: str = Query(..., description="Wallet address")
) -> dict[str, Any]:
    """
    Get positions directly from Uniswap V3 subgraph only.
    Useful for debugging and comparing with DeBank.
    """
    try:
        thegraph = TheGraphService(settings.thegraph_api_key)
        positions = await thegraph.get_positions_by_owner(wallet)
        await thegraph.close()

        # Format for display
        formatted = []
        for pos in positions:
            formatted.append(_format_position_from_subgraph(pos))

        # Count active vs closed
        active = sum(1 for p in formatted if p["status"] == "ACTIVE")
        closed = sum(1 for p in formatted if p["status"] == "CLOSED")

        return {
            "status": "success",
            "data": {
                "positions": formatted,
                "total": len(formatted),
                "active": active,
                "closed": closed,
                "source": "Uniswap V3 Subgraph (Ethereum Mainnet)"
            }
        }

    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return {
            "status": "error",
            "detail": {"error": str(e)}
        }


@router.get("/position-history/{position_id}")
async def get_position_history(
    position_id: str,
    wallet: str = Query(..., description="Wallet address (required for accurate amounts)")
) -> dict[str, Any]:
    """
    Get complete transaction history for a specific position.

    STANDARDIZED DATA PIPELINE:
    - Structure: Subgraph (position info, snapshots, timestamps, blocks)
    - Amounts: DeBank (ALL token amounts - deposits, withdraws, fees)
    - Prices: Subgraph (historical prices at block level)
    - Values: Computed (amount * price)

    Returns all deposits, withdrawals, and fee collections with:
    - Transaction hash
    - Timestamp
    - Token amounts (from DeBank)
    - USD values at time of transaction (from Subgraph prices)
    """
    try:
        thegraph = TheGraphService(settings.thegraph_api_key)

        # Fetch DeBank transactions for accurate token amounts
        discovery = TransactionDiscoveryService()
        since = datetime.now() - timedelta(days=365 * 3)  # 3 years of history
        debank_result = await discovery.discover_transactions(
            wallet_address=wallet,
            since=since,
            max_pages=100
        )

        # Build dict of tx_hash -> tx data for Uniswap transactions
        debank_txs = {}
        for tx in debank_result.get("transactions", []):
            if "uniswap" in (tx.get("project_id") or "").lower():
                tx_hash = tx.get("id", "").lower()
                if tx_hash:
                    debank_txs[tx_hash] = tx

        logger.info(f"Loaded {len(debank_txs)} Uniswap transactions from DeBank for amounts")
        await discovery.close()

        # Get position history with DeBank amounts + Subgraph prices
        history = await thegraph.get_position_history(position_id, debank_txs=debank_txs)
        await thegraph.close()

        if not history:
            return {
                "status": "error",
                "detail": {"error": f"Position {position_id} not found"}
            }

        return {
            "status": "success",
            "data": history
        }

    except Exception as e:
        logger.error(f"Error getting position history: {e}", exc_info=True)
        return {
            "status": "error",
            "detail": {"error": str(e)}
        }


# ============================================================================
# GMX V2 Perpetual Position Endpoints
# ============================================================================

@router.get("/gmx-positions")
async def get_gmx_positions(
    wallet: str = Query(..., description="Wallet address")
) -> dict[str, Any]:
    """
    Get ALL GMX V2 perpetual positions (active and closed) on Arbitrum.

    GMX Data Pipeline (self-contained - no DeBank needed):
    - Structure: GMX Subgraph (positionKey groups trades)
    - Amounts: GMX Subgraph (sizeInUsd, sizeDeltaUsd, collateralAmount)
    - Prices: GMX Subgraph (executionPrice at trade time)
    - Fees: GMX Subgraph (borrowingFee, fundingFee, positionFee)
    - P&L: GMX Subgraph (basePnlUsd)

    Returns positions grouped by positionKey with summary stats.
    """
    try:
        gmx = GMXSubgraphService()
        positions = await gmx.get_all_positions(wallet)
        await gmx.close()

        # Count active vs closed
        active = sum(1 for p in positions if p["status"] == "ACTIVE")
        closed = sum(1 for p in positions if p["status"] == "CLOSED")

        # Calculate totals
        total_pnl = sum(p["total_pnl_usd"] for p in positions)
        total_size = sum(p["current_size_usd"] for p in positions)

        return {
            "status": "success",
            "data": {
                "positions": positions,
                "summary": {
                    "total_positions": len(positions),
                    "active_positions": active,
                    "closed_positions": closed,
                    "total_current_size_usd": total_size,
                    "total_realized_pnl_usd": total_pnl,
                },
                "data_sources": {
                    "structure": "GMX Synthetics Subgraph (Arbitrum)",
                    "amounts": "GMX Subgraph (self-contained)",
                    "prices": "GMX Subgraph (executionPrice)",
                    "fees": "GMX Subgraph (borrowing/funding/position fees)",
                }
            }
        }

    except Exception as e:
        logger.error(f"Error getting GMX positions: {e}", exc_info=True)
        return {
            "status": "error",
            "detail": {"error": str(e)}
        }


@router.get("/gmx-trades")
async def get_gmx_trades(
    wallet: str = Query(..., description="Wallet address")
) -> dict[str, Any]:
    """
    Get ALL GMX V2 trades as a flat list (no position grouping).

    This is the new flat trade list endpoint optimized for display in a
    sortable/filterable table. Each trade is a standalone record.

    Returns:
        List of trades with: market, side, action, size, price, pnl, fees, tx
    """
    try:
        gmx = GMXSubgraphService()
        trades = await gmx.get_all_trades(wallet)
        await gmx.close()

        # Calculate summary stats
        total_pnl = sum(t["pnl_usd"] for t in trades)
        total_trades = len(trades)
        unique_markets = len(set(t["market"] for t in trades))
        longs = sum(1 for t in trades if t["is_long"])
        shorts = total_trades - longs

        return {
            "status": "success",
            "data": {
                "trades": trades,
                "summary": {
                    "total_trades": total_trades,
                    "unique_markets": unique_markets,
                    "long_trades": longs,
                    "short_trades": shorts,
                    "total_pnl_usd": total_pnl,
                },
                "data_source": "GMX Synthetics Subgraph (Arbitrum)"
            }
        }

    except Exception as e:
        logger.error(f"Error getting GMX trades: {e}", exc_info=True)
        return {
            "status": "error",
            "detail": {"error": str(e)}
        }


@router.get("/gmx-position-history/{position_key:path}")
async def get_gmx_position_history(
    position_key: str
) -> dict[str, Any]:
    """
    Get complete trade history for a specific GMX position.

    GMX Data Pipeline (self-contained):
    - Structure: positionKey groups all trades
    - Amounts: sizeDeltaUsd, collateralAmount
    - Prices: executionPrice at trade time
    - Fees: borrowingFeeAmount, fundingFeeAmount, positionFeeAmount
    - P&L: basePnlUsd

    Returns all opens, increases, decreases, and closes with:
    - Transaction hash
    - Timestamp
    - Size changes
    - Execution price
    - P&L (for decreases)
    - Fees paid
    """
    try:
        gmx = GMXSubgraphService()
        history = await gmx.get_position_history_by_key(position_key)
        await gmx.close()

        if not history:
            return {
                "status": "error",
                "detail": {"error": f"Position {position_key} not found"}
            }

        return {
            "status": "success",
            "data": history
        }

    except Exception as e:
        logger.error(f"Error getting GMX position history: {e}", exc_info=True)
        return {
            "status": "error",
            "detail": {"error": str(e)}
        }


# ============================================================================
# Strategy Loading - Batch Enrichment for Ledger Analysis
# ============================================================================


class StrategyLPItem(BaseModel):
    """LP position item for strategy loading."""
    model_config = {"extra": "ignore"}  # Ignore extra fields from frontend

    type: str = "lp"
    position_id: str
    pool_address: str
    token0_symbol: str
    token1_symbol: str
    fee_tier: str
    status: str


class StrategyGMXTradeItem(BaseModel):
    """GMX trade item for strategy loading."""
    model_config = {"extra": "ignore"}  # Ignore extra fields from frontend

    type: str = "gmx_trade"
    tx_hash: str
    position_key: str
    # market and market_address are optional - can derive from market_name
    market: Optional[str] = None
    market_address: Optional[str] = None
    market_name: Optional[str] = None  # Legacy field - "ETH/USD" format
    side: str
    action: str
    size_delta_usd: float
    collateral_usd: float = 0.0  # Optional - default to 0
    execution_price: float
    pnl_usd: float
    timestamp: int

    def get_market(self) -> str:
        """Get market symbol, deriving from market_name if needed."""
        if self.market:
            return self.market
        if self.market_name:
            # Extract "ETH" from "ETH/USD" or "ETH/USD [1]"
            return self.market_name.split("/")[0].strip()
        return "UNKNOWN"


class StrategyLoadRequest(BaseModel):
    """Request body for loading a strategy into Ledger format."""
    wallet: str  # Needed for DeBank enrichment
    lp_items: list[StrategyLPItem] = []
    gmx_items: list[StrategyGMXTradeItem] = []
    force_refresh: bool = True  # Always fetch fresh data by default


@router.post("/strategy/debug")
async def debug_strategy_request(request: dict[str, Any]) -> dict[str, Any]:
    """Debug endpoint to see raw request body."""
    logger.info(f"DEBUG: Raw request body: {request}")
    return {
        "status": "debug",
        "received": request,
        "wallet": request.get("wallet"),
        "lp_items_count": len(request.get("lp_items", [])),
        "gmx_items_count": len(request.get("gmx_items", [])),
        "lp_items_sample": request.get("lp_items", [])[:1] if request.get("lp_items") else [],
        "gmx_items_sample": request.get("gmx_items", [])[:1] if request.get("gmx_items") else [],
    }


def aggregate_gmx_trades_to_positions(trades: list[StrategyGMXTradeItem]) -> list[dict[str, Any]]:
    """
    Aggregate individual GMX trades into position-level data for Ledger.

    IMPORTANT: Only aggregates the trades that were selected by the user.
    This ensures historical trades not part of the strategy are excluded.

    Returns PerpetualPosition-like objects for LedgerMatrix consumption.
    """
    if not trades:
        return []

    positions: dict[str, dict[str, Any]] = {}

    for trade in trades:
        key = trade.position_key
        # Use get_market() to derive market from market_name if needed
        market = trade.get_market()
        market_address = trade.market_address or ""

        if key not in positions:
            positions[key] = {
                "position_key": key,
                "market": market,
                "market_address": market_address,
                "side": trade.side,
                "is_long": trade.side == "Long",
                "trades": [],
                "total_size_usd": 0.0,
                "weighted_entry_sum": 0.0,
                "weighted_entry_size": 0.0,
                "realized_pnl": 0.0,
                "total_fees_usd": 0.0,
                "initial_margin_usd": 0.0,
                "first_trade_timestamp": trade.timestamp,
                "last_trade_timestamp": trade.timestamp,
            }

        pos = positions[key]
        pos["trades"].append({
            "tx_hash": trade.tx_hash,
            "action": trade.action,
            "size_delta_usd": trade.size_delta_usd,
            "collateral_usd": trade.collateral_usd,
            "execution_price": trade.execution_price,
            "pnl_usd": trade.pnl_usd,
            "timestamp": trade.timestamp,
        })

        # Track timestamps
        if trade.timestamp < pos["first_trade_timestamp"]:
            pos["first_trade_timestamp"] = trade.timestamp
        if trade.timestamp > pos["last_trade_timestamp"]:
            pos["last_trade_timestamp"] = trade.timestamp

        # Track size and entry price
        if trade.action in ("Open", "Increase"):
            pos["total_size_usd"] += trade.size_delta_usd
            pos["weighted_entry_sum"] += trade.execution_price * trade.size_delta_usd
            pos["weighted_entry_size"] += trade.size_delta_usd
            # First Open trade sets initial margin
            if trade.action == "Open" and pos["initial_margin_usd"] == 0:
                pos["initial_margin_usd"] = trade.collateral_usd
        elif trade.action in ("Decrease", "Close"):
            pos["total_size_usd"] -= trade.size_delta_usd
            pos["realized_pnl"] += trade.pnl_usd

    # Calculate weighted average entry price and format for Ledger
    result = []
    for pos in positions.values():
        entry_price = 0.0
        if pos["weighted_entry_size"] > 0:
            entry_price = pos["weighted_entry_sum"] / pos["weighted_entry_size"]

        # Determine status based on remaining size
        status = "ACTIVE" if pos["total_size_usd"] > 0.01 else "CLOSED"

        # Format as PerpetualPosition for LedgerMatrix
        result.append({
            "type": "perpetual",
            "protocol": "GMX V2",
            "position_name": f"{pos['market']}/USD",
            "position_key": pos["position_key"],
            "chain": "arb",
            "side": pos["side"],
            "base_token": {
                "symbol": pos["market"],
                "address": pos["market_address"],
                "price": 0.0,  # Would need live price feed
            },
            "margin_token": {
                "symbol": "USDC",
                "address": "",
                "amount": pos["initial_margin_usd"],
                "price": 1.0,
                "value_usd": pos["initial_margin_usd"],
            },
            "position_size": pos["total_size_usd"] / entry_price if entry_price > 0 else 0,
            "position_value_usd": pos["total_size_usd"],
            "entry_price": entry_price,
            "mark_price": 0.0,  # Would need live price feed
            "liquidation_price": 0.0,
            "leverage": pos["total_size_usd"] / pos["initial_margin_usd"] if pos["initial_margin_usd"] > 0 else 0,
            # pnl_usd = UNREALIZED P&L (from live position data)
            # For strategy trades, we don't have live data, so this is 0
            # Realized P&L is tracked separately in realized_pnl_usd and perpHistory
            "pnl_usd": 0.0,
            "total_value_usd": pos["total_size_usd"],
            "debt_usd": 0.0,
            "net_value_usd": pos["total_size_usd"],
            "position_index": pos["position_key"],
            "status": status,
            # Enriched fields for Performance Analysis
            "initial_margin_usd": pos["initial_margin_usd"],
            "funding_rewards_usd": 0.0,  # Would need additional query
            "realized_pnl_usd": pos["realized_pnl"],
            "total_fees_usd": pos["total_fees_usd"],
            "trade_count": len(pos["trades"]),
            "trades": pos["trades"],
        })

    return result


@router.post("/strategy/load")
async def load_strategy_for_ledger(
    request: StrategyLoadRequest
) -> dict[str, Any]:
    """
    Load and enrich a strategy for Ledger analysis.

    This endpoint mirrors the wallet/ledger endpoint data pipeline:
    1. Uses DeBank for unclaimed LP fees (force_refresh for real-time)
    2. Uses Uniswap Subgraph for LP position data and claimed fees
    3. Uses GMX Subgraph for LIVE perp data (mark_price, entry_price, pnl)
    4. Aggregates GMX trades and returns perpHistory for realized P&L

    Returns the same data structure as wallet/ledger endpoint.
    """
    fetch_timestamp = datetime.utcnow().isoformat()
    logger.info(f"Strategy load request received: wallet={request.wallet}, lp_items={len(request.lp_items)}, gmx_items={len(request.gmx_items)}, force_refresh={request.force_refresh}")
    try:
        wallet = request.wallet.lower()
        lp_items = request.lp_items
        gmx_items = request.gmx_items

        logger.info(f"Loading strategy with {len(lp_items)} LP items and {len(gmx_items)} GMX items")

        # ================================================================
        # 0. Get DeBank positions for unclaimed LP fees (force refresh)
        # ================================================================
        debank_lp_positions_by_id = {}
        debank_perp_positions = []  # For fallback only - prefer GMX subgraph

        try:
            debank = await get_debank_service()
            # Always force refresh to get real-time unclaimed fees
            debank_result = await debank.get_wallet_positions(wallet, force_refresh=request.force_refresh)
            debank_positions = debank_result.get("positions", [])

            # Separate LP and perp positions
            for pos in debank_positions:
                pos_type = pos.get("type")

                if pos_type == "perpetual":
                    # GMX perpetual position - has live unrealized P&L
                    debank_perp_positions.append(pos)
                else:
                    # LP position - for unclaimed fees lookup
                    pos_index = pos.get("position_index", "")
                    if pos_index:
                        debank_lp_positions_by_id[str(pos_index)] = pos

            logger.info(f"Loaded {len(debank_lp_positions_by_id)} DeBank LP positions for unclaimed fees")
            logger.info(f"Loaded {len(debank_perp_positions)} DeBank perp positions for unrealized P&L")
        except Exception as e:
            logger.warning(f"Could not fetch DeBank positions: {e}")

        # ================================================================
        # 1. Enrich LP Positions
        # ================================================================
        enriched_lp_positions = []

        if lp_items:
            discovery = TransactionDiscoveryService()
            graph = TheGraphService(settings.thegraph_api_key)

            try:
                # Fetch DeBank transaction history for claimed fees
                since = datetime.now() - timedelta(days=365 * 3)
                debank_result = await discovery.discover_transactions(
                    wallet_address=wallet,
                    since=since,
                    max_pages=100
                )

                # Build dict of tx_hash -> tx data for Uniswap transactions
                debank_txs = {}
                for tx in debank_result.get("transactions", []):
                    if "uniswap" in (tx.get("project_id") or "").lower():
                        tx_hash = tx.get("id", "").lower()
                        if tx_hash:
                            debank_txs[tx_hash] = tx

                logger.info(f"Loaded {len(debank_txs)} Uniswap transactions from DeBank")

                async def enrich_lp_position(item: StrategyLPItem) -> Optional[dict]:
                    try:
                        # STEP 1: Get full position data from subgraph
                        full_position = await graph.get_position_with_historical_values(
                            item.position_id,
                            coingecko_service=None,
                            owner_address=wallet
                        )

                        if not full_position:
                            logger.warning(f"Could not get position data for {item.position_id}")
                            return None

                        # STEP 2: Get transaction history for claimed fees breakdown
                        history = await graph.get_position_history(item.position_id, debank_txs)

                        # Calculate claimed fees from Collect transactions
                        claimed_fees = {"token0": 0, "token1": 0, "total": 0}
                        transactions = []

                        if history:
                            transactions = history.get("transactions", [])
                            for tx in transactions:
                                if tx["action"] == "Collect":
                                    claimed_fees["token0"] += tx["token0_value_usd"]
                                    claimed_fees["token1"] += tx["token1_value_usd"]
                                    claimed_fees["total"] += tx["total_value_usd"]

                        # Fallback to collected_fees from position
                        if claimed_fees["total"] == 0:
                            collected = full_position.get("collected_fees", {})
                            claimed_fees = {
                                "token0": collected.get("token0", 0) * full_position.get("token0", {}).get("price", 0),
                                "token1": collected.get("token1", 0) * full_position.get("token1", {}).get("price", 0),
                                "total": collected.get("total_usd", 0)
                            }

                        # STEP 3: Get unclaimed fees from DeBank
                        unclaimed_fees_usd = 0
                        debank_pos = debank_lp_positions_by_id.get(str(item.position_id))
                        if debank_pos:
                            unclaimed_fees_usd = debank_pos.get("unclaimed_fees_usd", 0)
                            logger.info(f"Position {item.position_id}: Found unclaimed fees ${unclaimed_fees_usd:.2f} from DeBank")

                        # Build LPPosition format matching wallet/ledger endpoint
                        return {
                            "pool_name": full_position.get("pool_name", f"{item.token0_symbol}/{item.token1_symbol}"),
                            "pool_address": full_position.get("pool_address", item.pool_address),
                            "position_index": item.position_id,
                            "chain": full_position.get("chain", "eth"),
                            "fee_tier": full_position.get("fee_tier", 0.0005),
                            "in_range": full_position.get("in_range", True),
                            "token0": full_position.get("token0", {
                                "symbol": item.token0_symbol,
                                "address": "",
                                "amount": 0,
                                "price": 0,
                                "value_usd": 0,
                            }),
                            "token1": full_position.get("token1", {
                                "symbol": item.token1_symbol,
                                "address": "",
                                "amount": 0,
                                "price": 0,
                                "value_usd": 0,
                            }),
                            "total_value_usd": full_position.get("total_value_usd", 0),
                            "unclaimed_fees_usd": unclaimed_fees_usd,
                            "initial_deposits": full_position.get("initial_deposits", {
                                "token0": {"amount": 0, "value_usd": 0},
                                "token1": {"amount": 0, "value_usd": 0}
                            }),
                            "initial_total_value_usd": full_position.get("initial_total_value_usd", 0),
                            "claimed_fees": claimed_fees,
                            "position_mint_timestamp": full_position.get("position_mint_timestamp", 0),
                            "gas_fees_usd": full_position.get("gas_fees_usd", 0),
                            "transaction_count": full_position.get("transaction_count", len(transactions)),
                            "status": item.status,
                            "transactions": transactions,
                            "data_sources": {
                                "position": "uniswap_subgraph",
                                "unclaimed_fees": "debank" if unclaimed_fees_usd > 0 else "none",
                                "transactions": history.get("data_sources", {}) if history else {},
                            },
                        }
                    except Exception as e:
                        logger.error(f"Error enriching LP position {item.position_id}: {e}", exc_info=True)
                        return None

                # Parallel fetch all LP positions
                lp_tasks = [enrich_lp_position(item) for item in lp_items]
                lp_results = await asyncio.gather(*lp_tasks)
                enriched_lp_positions = [r for r in lp_results if r is not None]

            finally:
                await discovery.close()
                await graph.close()

        # ================================================================
        # 2. Aggregate GMX Trades into Positions
        # ================================================================
        aggregated_perp_positions = aggregate_gmx_trades_to_positions(gmx_items)

        # ================================================================
        # 2b. Enrich ACTIVE positions with LIVE data from GMX Subgraph
        # ================================================================
        # PRIMARY: GMX Subgraph (real-time mark_price from tokenPrice entity)
        # FALLBACK: DeBank (for entry_price if subgraph doesn't have it)
        # FINAL FALLBACK: CoinGecko (if neither has mark_price)

        def normalize_market(symbol: str) -> str:
            """Normalize market symbols for matching (ETH/WETH, BTC/WBTC)"""
            upper = symbol.upper()
            if upper in ("WETH", "ETH"):
                return "ETH"
            if upper in ("WBTC", "BTC"):
                return "BTC"
            return upper

        # Fetch LIVE perp positions from GMX subgraph (like wallet/ledger does)
        gmx_subgraph_positions = []
        try:
            gmx_subgraph = GMXSubgraphService()
            gmx_subgraph_positions = await gmx_subgraph.get_full_positions(wallet)
            await gmx_subgraph.close()
            logger.info(f"Fetched {len(gmx_subgraph_positions)} live positions from GMX subgraph")
        except Exception as e:
            logger.warning(f"Could not fetch GMX subgraph positions: {e}")

        def find_matching_subgraph_perp(
            subgraph_positions: list[dict],
            market: str,
            side: str
        ) -> Optional[dict]:
            """Find a GMX subgraph position matching the strategy position"""
            normalized_market = normalize_market(market)

            for pos in subgraph_positions:
                # GMX subgraph positions have base_token.symbol and side
                base_symbol = pos.get("base_token", {}).get("symbol", "")
                pos_side = pos.get("side", "")

                if normalize_market(base_symbol) == normalized_market and pos_side == side:
                    return pos

            return None

        def find_matching_debank_perp(
            debank_positions: list[dict],
            market: str,
            side: str
        ) -> Optional[dict]:
            """Find a DeBank perp position matching the strategy position"""
            normalized_market = normalize_market(market)

            for pos in debank_positions:
                base_symbol = pos.get("base_token", {}).get("symbol", "")
                pos_side = pos.get("side", "")

                if normalize_market(base_symbol) == normalized_market and pos_side == side:
                    return pos

            return None

        # Enrich active positions with live data
        for perp in aggregated_perp_positions:
            if perp.get("status") != "ACTIVE":
                continue

            market = perp.get("base_token", {}).get("symbol", "")
            side = perp.get("side", "")

            # PRIMARY: Try GMX subgraph first (real-time, no cache)
            subgraph_pos = find_matching_subgraph_perp(gmx_subgraph_positions, market, side)

            if subgraph_pos:
                # Use GMX subgraph's mark_price (from tokenPrice entity, always fresh)
                subgraph_mark_price = subgraph_pos.get("mark_price", 0)
                subgraph_entry_price = subgraph_pos.get("entry_price", 0)
                subgraph_pnl = subgraph_pos.get("pnl_usd", 0)

                if subgraph_mark_price > 0:
                    perp["mark_price"] = subgraph_mark_price
                    if "base_token" in perp:
                        perp["base_token"]["price"] = subgraph_mark_price

                if subgraph_entry_price > 0:
                    perp["entry_price"] = subgraph_entry_price

                perp["pnl_usd"] = subgraph_pnl
                perp["_data_source"] = "gmx_subgraph"
                logger.info(f"GMX Subgraph: {side} {market} entry=${subgraph_entry_price:.2f}, mark=${subgraph_mark_price:.2f}, pnl=${subgraph_pnl:.2f}")
            else:
                # FALLBACK: Try DeBank (may be cached)
                debank_pos = find_matching_debank_perp(debank_perp_positions, market, side)

                if debank_pos:
                    debank_entry_price = debank_pos.get("entry_price", 0)
                    debank_mark_price = debank_pos.get("mark_price", 0)
                    unrealized_pnl = debank_pos.get("pnl_usd", 0)

                    if debank_entry_price > 0:
                        perp["entry_price"] = debank_entry_price
                    if debank_mark_price > 0:
                        perp["mark_price"] = debank_mark_price
                        if "base_token" in perp:
                            perp["base_token"]["price"] = debank_mark_price

                    perp["pnl_usd"] = unrealized_pnl
                    perp["_data_source"] = "debank"
                    logger.info(f"DeBank fallback: {side} {market} entry=${debank_entry_price:.2f}, mark=${debank_mark_price:.2f}, pnl=${unrealized_pnl:.2f}")
                else:
                    perp["_data_source"] = "aggregated_trades"
                    logger.warning(f"No live data found for {side} {market} - using aggregated trade values")

        # FINAL FALLBACK: CoinGecko for any positions still missing mark_price
        positions_needing_price = [
            p for p in aggregated_perp_positions
            if p.get("status") == "ACTIVE" and p.get("mark_price", 0) == 0
        ]

        if positions_needing_price:
            try:
                coingecko = CoinGeckoService()
                symbols = list(set(
                    p.get("base_token", {}).get("symbol", "")
                    for p in positions_needing_price
                    if p.get("base_token", {}).get("symbol")
                ))

                if symbols:
                    live_prices = await coingecko.get_current_prices(symbols)
                    logger.info(f"CoinGecko fallback prices: {live_prices}")

                    for perp in positions_needing_price:
                        market = perp.get("base_token", {}).get("symbol", "")
                        normalized = normalize_market(market)
                        live_price = live_prices.get(normalized) or live_prices.get(market.upper())

                        if live_price and live_price > 0:
                            perp["mark_price"] = live_price
                            if "base_token" in perp:
                                perp["base_token"]["price"] = live_price
                            perp["_data_source"] = "coingecko"
                            logger.info(f"CoinGecko fallback: {perp.get('side')} {market} mark_price=${live_price:.2f}")

                await coingecko.close()
            except Exception as e:
                logger.warning(f"CoinGecko fallback failed: {e}")

        # Calculate total realized P&L from all perp positions
        total_realized_pnl = sum(p.get("realized_pnl_usd", 0) for p in aggregated_perp_positions)
        total_margin = sum(p.get("initial_margin_usd", 0) for p in aggregated_perp_positions)

        # ================================================================
        # 3. Return Ledger-Ready Data (matching wallet/ledger format)
        # ================================================================
        return {
            "status": "success",
            "data": {
                "wallet": wallet,
                "lp_positions": enriched_lp_positions,
                "perp_positions": aggregated_perp_positions,
                "gmx_rewards": None,  # Not applicable for strategy mode
                "perp_history": {
                    "realized_pnl": total_realized_pnl,
                    "current_margin": total_margin,
                    "total_funding_claimed": 0  # Would need additional query
                },
                "total_gas_fees_usd": sum(p.get("gas_fees_usd", 0) for p in enriched_lp_positions),
                "fetched_at": fetch_timestamp,  # When this data was fetched
                "summary": {
                    "lp_count": len(enriched_lp_positions),
                    "perp_count": len(aggregated_perp_positions),
                    "total_lp_initial_value": sum(
                        p.get("initial_total_value_usd", 0) for p in enriched_lp_positions
                    ),
                    "total_perp_realized_pnl": total_realized_pnl,
                },
                "data_sources": {
                    "lp_positions": "uniswap_subgraph",
                    "unclaimed_fees": "debank (force_refresh)" if request.force_refresh else "debank (cached)",
                    "perp_mark_price": "gmx_subgraph (real-time)",
                    "perp_entry_price": "gmx_subgraph (real-time)",
                    "perp_unrealized_pnl": "gmx_subgraph (real-time)",
                    "fallback_price": "coingecko",
                }
            }
        }

    except Exception as e:
        logger.error(f"Error loading strategy: {e}", exc_info=True)
        return {
            "status": "error",
            "detail": {"error": str(e)}
        }


# ============================================================================
# Sensitivity Analysis - Price Ratio and Threshold Analysis
# ============================================================================


class PriceRatioRequest(BaseModel):
    """Request for price ratio time series."""
    symbol1: str  # e.g., "LINK"
    symbol2: str  # e.g., "ETH"
    from_timestamp: int  # Unix timestamp
    to_timestamp: Optional[int] = None  # Default to now
    interval_hours: int = 4  # 4H chart by default
    threshold: Optional[float] = None  # Optional threshold for breach markers


@router.post("/price-ratio-history")
async def get_price_ratio_history(
    request: PriceRatioRequest
) -> dict[str, Any]:
    """
    Get price ratio time series between two tokens for sensitivity analysis.

    Returns:
    - Time series of price ratio (symbol1/symbol2)
    - Optional threshold breach markers
    - Statistics (mean, std, min, max)

    Use for:
    - Analyzing hedge effectiveness
    - Optimizing rebalance thresholds
    - Understanding price correlation between LP tokens
    """
    try:
        from_ts = request.from_timestamp
        to_ts = request.to_timestamp or int(datetime.utcnow().timestamp())

        coingecko = CoinGeckoService()
        ratio_data = await coingecko.get_price_ratio_time_series(
            symbol1=request.symbol1,
            symbol2=request.symbol2,
            from_timestamp=from_ts,
            to_timestamp=to_ts,
            interval_hours=request.interval_hours
        )
        await coingecko.close()

        if not ratio_data:
            return {
                "status": "error",
                "detail": {"error": f"Could not fetch price data for {request.symbol1}/{request.symbol2}"}
            }

        # Calculate statistics
        ratios = [d["ratio"] for d in ratio_data]
        initial_ratio = ratios[0] if ratios else 0
        current_ratio = ratios[-1] if ratios else 0

        import statistics
        mean_ratio = statistics.mean(ratios) if ratios else 0
        std_ratio = statistics.stdev(ratios) if len(ratios) > 1 else 0
        min_ratio = min(ratios) if ratios else 0
        max_ratio = max(ratios) if ratios else 0

        # Calculate threshold breaches if threshold provided
        breaches = []
        if request.threshold and request.threshold > 0:
            # Threshold is a percentage deviation from initial ratio
            # e.g., threshold=0.05 means trigger when ratio deviates 5% from initial
            upper_bound = initial_ratio * (1 + request.threshold)
            lower_bound = initial_ratio * (1 - request.threshold)

            in_breach = False
            breach_start = None
            breach_direction = None

            for i, point in enumerate(ratio_data):
                ratio = point["ratio"]
                is_breach = ratio > upper_bound or ratio < lower_bound

                if is_breach and not in_breach:
                    # Start of breach
                    in_breach = True
                    breach_start = point["timestamp"]
                    breach_direction = "above" if ratio > upper_bound else "below"
                elif not is_breach and in_breach:
                    # End of breach
                    in_breach = False
                    breaches.append({
                        "start_timestamp": breach_start,
                        "end_timestamp": point["timestamp"],
                        "direction": breach_direction,
                        "peak_deviation": 0,  # Would need to track
                    })
                    breach_start = None

            # Handle ongoing breach
            if in_breach and breach_start:
                breaches.append({
                    "start_timestamp": breach_start,
                    "end_timestamp": to_ts,
                    "direction": breach_direction,
                    "ongoing": True,
                })

        # Calculate deviation percentage at each point
        for point in ratio_data:
            if initial_ratio > 0:
                point["deviation_pct"] = (point["ratio"] - initial_ratio) / initial_ratio * 100
            else:
                point["deviation_pct"] = 0

        return {
            "status": "success",
            "data": {
                "symbol1": request.symbol1,
                "symbol2": request.symbol2,
                "interval_hours": request.interval_hours,
                "time_series": ratio_data,
                "statistics": {
                    "initial_ratio": initial_ratio,
                    "current_ratio": current_ratio,
                    "mean_ratio": mean_ratio,
                    "std_ratio": std_ratio,
                    "min_ratio": min_ratio,
                    "max_ratio": max_ratio,
                    "total_change_pct": ((current_ratio - initial_ratio) / initial_ratio * 100) if initial_ratio > 0 else 0,
                    "volatility_pct": (std_ratio / mean_ratio * 100) if mean_ratio > 0 else 0,
                },
                "threshold_analysis": {
                    "threshold": request.threshold,
                    "breaches": breaches,
                    "breach_count": len(breaches),
                    "upper_bound": initial_ratio * (1 + request.threshold) if request.threshold else None,
                    "lower_bound": initial_ratio * (1 - request.threshold) if request.threshold else None,
                } if request.threshold else None,
                "data_source": "coingecko",
            }
        }

    except Exception as e:
        logger.error(f"Error getting price ratio history: {e}", exc_info=True)
        return {
            "status": "error",
            "detail": {"error": str(e)}
        }