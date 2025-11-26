"""
Transaction history API endpoint for reconciliation system.
Fetches transactions from all registered protocol adapters.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from dataclasses import asdict
import logging

from backend.services.adapters import ProtocolRegistry, Transaction

logger = logging.getLogger(__name__)
router = APIRouter()


def transaction_to_dict(tx: Transaction) -> Dict[str, Any]:
    """Convert Transaction dataclass to dict for JSON serialization"""
    return {
        "id": tx.id,
        "txHash": tx.tx_hash,
        "logIndex": tx.log_index,
        "timestamp": tx.timestamp,
        "blockNumber": tx.block_number,
        "protocol": tx.protocol,
        "type": tx.type,
        "positionKey": tx.position_key,
        "tokens": [
            {
                "symbol": t.symbol,
                "amount": t.amount,
                "usdValue": t.usd_value,
                "direction": t.direction
            }
            for t in tx.tokens
        ],
        "usdValue": tx.usd_value,
        "realizedPnl": tx.realized_pnl,
        "fees": tx.fees,
        "status": tx.status,
        "positionId": tx.position_id
    }


@router.get("/wallet/{address}/transactions")
async def get_wallet_transactions(
    address: str,
    since: Optional[str] = Query(
        None, 
        description="Start date (ISO format or days like '30d', '6m')"
    ),
    until: Optional[str] = Query(
        None,
        description="End date (ISO format), defaults to now"
    ),
    protocol: Optional[str] = Query(
        None,
        description="Filter by protocol (uniswap_v3, gmx_v2, euler)"
    ),
    type: Optional[str] = Query(
        None,
        description="Filter by transaction type (lp_mint, perp_open, etc.)"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=200, description="Items per page")
) -> Dict[str, Any]:
    """
    Get transaction history for a wallet.
    
    Fetches transactions from all registered protocol adapters
    and returns them in a standardized format for reconciliation.
    
    Date formats:
    - ISO: "2024-01-01" or "2024-01-01T00:00:00Z"
    - Relative: "30d" (30 days), "6m" (6 months), "1y" (1 year)
    """
    try:
        # Parse date range
        until_dt = _parse_date(until) if until else datetime.now()
        
        if since:
            since_dt = _parse_date(since)
        else:
            # Default to 6 months
            since_dt = until_dt - timedelta(days=180)
        
        # Get protocols to query
        protocols = [protocol] if protocol else None
        
        # Fetch transactions from adapters
        all_transactions = await ProtocolRegistry.fetch_all_transactions(
            wallet_address=address,
            since=since_dt,
            until=until_dt,
            protocols=protocols
        )
        
        # Filter by type if specified
        if type:
            all_transactions = [t for t in all_transactions if t.type == type]
        
        # Calculate pagination
        total = len(all_transactions)
        total_pages = (total + limit - 1) // limit
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        
        # Slice for current page
        page_transactions = all_transactions[start_idx:end_idx]
        
        # Convert to dicts
        transactions_data = [transaction_to_dict(tx) for tx in page_transactions]
        
        return {
            "status": "success",
            "data": {
                "transactions": transactions_data,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": total_pages,
                    "hasMore": page < total_pages
                },
                "filters": {
                    "since": since_dt.isoformat(),
                    "until": until_dt.isoformat(),
                    "protocol": protocol,
                    "type": type
                },
                "summary": {
                    "totalTransactions": total,
                    "byProtocol": _count_by_field(all_transactions, "protocol"),
                    "byType": _count_by_field(all_transactions, "type")
                }
            }
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": str(e)})
    except Exception as e:
        logger.exception(f"Error fetching transactions for {address}")
        raise HTTPException(
            status_code=500, 
            detail={"error": "Failed to fetch transactions"}
        )


def _parse_date(date_str: str) -> datetime:
    """
    Parse date string in various formats.
    
    Supported formats:
    - ISO: "2024-01-01", "2024-01-01T00:00:00Z"
    - Relative: "30d" (days), "6m" (months), "1y" (years)
    """
    if not date_str:
        return datetime.now()
    
    # Check for relative format
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
    
    # Try ISO format
    try:
        # Handle both with and without time
        if 'T' in date_str:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        else:
            return datetime.fromisoformat(date_str)
    except ValueError:
        raise ValueError(f"Invalid date format: {date_str}")


def _count_by_field(transactions: List[Transaction], field: str) -> Dict[str, int]:
    """Count transactions by a specific field"""
    counts: Dict[str, int] = {}
    for tx in transactions:
        value = getattr(tx, field, "unknown")
        counts[value] = counts.get(value, 0) + 1
    return counts
