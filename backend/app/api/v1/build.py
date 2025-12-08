"""
Build Page API endpoints.

Fetches transactions and groups them by protocol for the Build page workflow.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import logging

from backend.services.discovery import get_discovery_service, DEFAULT_CHAIN_NAMES

logger = logging.getLogger(__name__)
router = APIRouter()


def group_transactions_by_protocol(
    transactions: List[Dict],
    token_dict: Dict,
    project_dict: Dict
) -> List[Dict]:
    """
    Group transactions by protocol (project_id).

    Returns a list of groups, each containing:
    - protocol: project_id
    - protocolName: display name from project_dict
    - chain: primary chain for this protocol
    - transactions: list of transactions
    - transactionCount: number of transactions
    - totalIn: sum of USD received
    - totalOut: sum of USD sent
    - latestActivity: timestamp of most recent transaction
    """
    groups_by_protocol = defaultdict(lambda: {
        "transactions": [],
        "chains": set(),
        "totalIn": 0.0,
        "totalOut": 0.0,
        "latestActivity": 0
    })

    for tx in transactions:
        # Get protocol ID
        project_id = tx.get("project_id") or "unknown"

        # Skip transactions without a protocol (simple transfers, etc)
        if project_id == "unknown":
            # Check if it's a contract interaction we should track
            cate_id = tx.get("cate_id", "")
            if cate_id not in ["receive", "send"]:
                project_id = f"unknown_{tx.get('chain', 'eth')}"
            else:
                continue  # Skip simple sends/receives

        group = groups_by_protocol[project_id]
        group["transactions"].append(tx)
        group["chains"].add(tx.get("chain", "eth"))

        # Calculate USD values
        total_in = 0.0
        total_out = 0.0

        for receive in tx.get("receives", []) or []:
            token_id = receive.get("token_id", "")
            token_info = token_dict.get(token_id, {})
            price = float(token_info.get("price", 0) or 0)
            amount = float(receive.get("amount", 0) or 0)
            total_in += price * amount

        for send in tx.get("sends", []) or []:
            token_id = send.get("token_id", "")
            token_info = token_dict.get(token_id, {})
            price = float(token_info.get("price", 0) or 0)
            amount = float(send.get("amount", 0) or 0)
            total_out += price * amount

        group["totalIn"] += total_in
        group["totalOut"] += total_out

        # Track latest activity
        tx_time = tx.get("time_at", 0)
        if tx_time > group["latestActivity"]:
            group["latestActivity"] = tx_time

    # Convert to list format
    result = []
    for protocol_id, data in groups_by_protocol.items():
        # Get protocol display name
        protocol_info = project_dict.get(protocol_id, {})
        protocol_name = protocol_info.get("name", protocol_id)

        # Determine primary chain (most transactions)
        chain_counts = defaultdict(int)
        for tx in data["transactions"]:
            chain_counts[tx.get("chain", "eth")] += 1
        primary_chain = max(chain_counts, key=chain_counts.get) if chain_counts else "eth"

        # Get unique tokens involved
        tokens_seen = set()
        for tx in data["transactions"]:
            for receive in tx.get("receives", []) or []:
                token_id = receive.get("token_id", "")
                token_info = token_dict.get(token_id, {})
                symbol = token_info.get("symbol") or token_info.get("optimized_symbol", "")
                if symbol:
                    tokens_seen.add(symbol)
            for send in tx.get("sends", []) or []:
                token_id = send.get("token_id", "")
                token_info = token_dict.get(token_id, {})
                symbol = token_info.get("symbol") or token_info.get("optimized_symbol", "")
                if symbol:
                    tokens_seen.add(symbol)

        result.append({
            "groupKey": protocol_id,
            "protocol": protocol_id,
            "protocolName": protocol_name,
            "chain": primary_chain,
            "chains": list(data["chains"]),
            "tokens": list(tokens_seen)[:6],  # Limit to 6 tokens for display
            "tokensDisplay": ", ".join(list(tokens_seen)[:4]) + ("..." if len(tokens_seen) > 4 else ""),
            "transactions": sorted(data["transactions"], key=lambda x: x.get("time_at", 0), reverse=True),
            "transactionCount": len(data["transactions"]),
            "totalIn": round(data["totalIn"], 2),
            "totalOut": round(data["totalOut"], 2),
            "netValue": round(data["totalIn"] - data["totalOut"], 2),
            "latestActivity": data["latestActivity"],
            "positionType": "defi"
        })

    # Sort by latest activity (most recent first)
    result.sort(key=lambda x: x["latestActivity"], reverse=True)

    return result


@router.get("/transactions")
async def get_transactions(
    wallet: str = Query(..., description="Wallet address"),
    since: str = Query("2m", description="Time filter: 1m, 2m, 3m, 6m, 1y, all"),
    force_refresh: bool = Query(False, description="Force refresh from API"),
):
    """
    Get transactions for a wallet.
    """
    # Parse time filter
    time_filters = {
        "1m": timedelta(days=30),
        "2m": timedelta(days=60),
        "3m": timedelta(days=90),
        "6m": timedelta(days=180),
        "1y": timedelta(days=365),
        "all": None
    }

    time_delta = time_filters.get(since, timedelta(days=60))
    since_date = datetime.utcnow() - time_delta if time_delta else None

    try:
        discovery = await get_discovery_service()
        result = await discovery.discover_transactions(
            wallet_address=wallet,
            since=since_date,
            force_refresh=force_refresh
        )

        return {
            "status": "success",
            "data": {
                "transactions": result["transactions"],
                "tokenDict": result["token_dict"],
                "projectDict": result["project_dict"],
                "chainNames": result.get("chain_names", DEFAULT_CHAIN_NAMES),
                "summary": {
                    "total": len(result["transactions"]),
                    "byChain": result["summary"]["byChain"],
                    "byCategory": result["summary"].get("byCategory", {})
                },
                "cache": result.get("cache", {})
            }
        }
    except Exception as e:
        logger.error(f"Error fetching transactions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transactions/grouped")
async def get_grouped_transactions(
    wallet: str = Query(..., description="Wallet address"),
    since: str = Query("2m", description="Time filter: 1m, 2m, 3m, 6m, 1y, all"),
    force_refresh: bool = Query(False, description="Force refresh from API"),
):
    """
    Get transactions grouped by protocol.
    """
    # Parse time filter
    time_filters = {
        "1m": timedelta(days=30),
        "2m": timedelta(days=60),
        "3m": timedelta(days=90),
        "6m": timedelta(days=180),
        "1y": timedelta(days=365),
        "all": None
    }

    time_delta = time_filters.get(since, timedelta(days=60))
    since_date = datetime.utcnow() - time_delta if time_delta else None

    try:
        discovery = await get_discovery_service()
        result = await discovery.discover_transactions(
            wallet_address=wallet,
            since=since_date,
            force_refresh=force_refresh
        )

        # Group by protocol
        groups = group_transactions_by_protocol(
            result["transactions"],
            result["token_dict"],
            result["project_dict"]
        )

        return {
            "status": "success",
            "data": {
                "groups": groups,
                "totalTransactions": len(result["transactions"]),
                "totalGroups": len(groups),
                "tokenDict": result["token_dict"],
                "projectDict": result["project_dict"],
                "chainNames": result.get("chain_names", DEFAULT_CHAIN_NAMES),
                "cache": result.get("cache", {})
            }
        }
    except Exception as e:
        logger.error(f"Error fetching grouped transactions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/positions")
async def get_positions(
    wallet: str = Query(..., description="Wallet address"),
):
    """
    Get positions for a wallet.
    TODO: Implement position discovery.
    """
    return {
        "status": "success",
        "data": {
            "positions": [],
            "summary": {
                "total": 0,
                "open": 0,
                "closed": 0
            }
        }
    }


@router.get("/strategies")
async def get_strategies(
    wallet: str = Query(..., description="Wallet address"),
):
    """
    Get strategies for a wallet.
    """
    return {
        "status": "success",
        "data": {
            "strategies": []
        }
    }


@router.post("/strategies")
async def create_strategy(
    wallet: str = Query(..., description="Wallet address"),
    name: str = Query(..., description="Strategy name"),
    description: Optional[str] = Query(None, description="Strategy description"),
):
    """
    Create a new strategy.
    TODO: Implement strategy creation with persistence.
    """
    return {
        "status": "success",
        "data": {
            "id": "placeholder",
            "name": name,
            "description": description,
            "status": "draft",
            "positionIds": [],
            "createdAt": ""
        }
    }


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(
    strategy_id: str,
    wallet: str = Query(..., description="Wallet address"),
):
    """
    Delete a strategy.
    """
    return {"status": "success"}


@router.get("/user-positions")
async def get_user_positions(
    wallet: str = Query(..., description="Wallet address"),
):
    """
    Get user-created positions.
    """
    return {
        "status": "success",
        "data": {
            "positions": []
        }
    }


@router.post("/user-positions")
async def create_user_position(
    wallet: str = Query(..., description="Wallet address"),
    name: str = Query(..., description="Position name"),
    description: Optional[str] = Query("", description="Position description"),
):
    """
    Create a new user position.
    TODO: Implement position creation with persistence.
    """
    return {
        "status": "success",
        "data": {
            "id": "placeholder",
            "name": name,
            "description": description,
            "status": "open",
            "transactionIds": [],
            "transactionCount": 0
        }
    }


@router.post("/user-positions/{position_id}/transactions/{transaction_id}")
async def add_transaction_to_position(
    position_id: str,
    transaction_id: str,
    wallet: str = Query(..., description="Wallet address"),
):
    """
    Add a transaction to a position.
    """
    return {"status": "success"}


@router.delete("/user-positions/{position_id}/transactions/{transaction_id}")
async def remove_transaction_from_position(
    position_id: str,
    transaction_id: str,
    wallet: str = Query(..., description="Wallet address"),
):
    """
    Remove a transaction from a position.
    """
    return {"status": "success"}
