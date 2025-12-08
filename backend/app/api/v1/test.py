"""
Test endpoint - Comprehensive LP Position Discovery
Combines Uniswap V3 Subgraph (primary) with DeBank (secondary) for complete coverage.
"""

from fastapi import APIRouter, Query
from typing import Dict, Any, Set
import logging
from datetime import datetime, timedelta

from backend.services.discovery import TransactionDiscoveryService
from backend.services.thegraph import TheGraphService
from backend.services.gmx_subgraph import GMXSubgraphService
from backend.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/test", tags=["test"])

CHAIN_NAMES = {
    "eth": "Ethereum",
    "arb": "Arbitrum",
    "op": "Optimism",
    "base": "Base",
    "matic": "Polygon",
    "bsc": "BNB Chain",
}


def _format_position_from_subgraph(position: Dict) -> Dict:
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
) -> Dict[str, Any]:
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
        positions_by_pool: Dict[str, Dict] = {}
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
        debank_pools: Set[str] = set()
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
) -> Dict[str, Any]:
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
) -> Dict[str, Any]:
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
) -> Dict[str, Any]:
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


@router.get("/gmx-position-history/{position_key:path}")
async def get_gmx_position_history(
    position_key: str
) -> Dict[str, Any]:
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