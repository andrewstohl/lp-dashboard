"""
Transaction Discovery API endpoint for reconciliation system.

Uses DeBank as source of truth for discovering ALL transactions
across ALL chains. Protocol-specific subgraphs are used for 
enrichment (pricing accuracy) when needed, not for discovery.

Architecture:
- Discovery: DeBank /user/history_list (complete coverage)
- Enrichment: Subgraphs (on-demand, not in this endpoint)
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging

from backend.services.discovery import get_discovery_service, CHAIN_NAMES

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/wallet/{address}/transactions")
async def get_wallet_transactions(
    address: str,
    since: Optional[str] = Query(
        None, 
        description="Start date (ISO format or relative like '30d', '6m')"
    ),
    until: Optional[str] = Query(
        None,
        description="End date (ISO format), defaults to now"
    ),
    chain: Optional[str] = Query(
        None,
        description="Filter by chain (eth, arb, op, base, matic, etc.)"
    ),
    project: Optional[str] = Query(
        None,
        description="Filter by project/protocol (arb_gmx2, uniswap3, etc.)"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=200, description="Items per page")
) -> Dict[str, Any]:
    """
    Discover all transactions for a wallet.
    
    Uses DeBank as the source of truth to ensure COMPLETE coverage
    across all chains and protocols. This is the "bank sync" equivalent
    from QuickBooks - it discovers everything before reconciliation.
    
    Returns DeBank's native format for maximum flexibility.
    Token and project metadata are included for display purposes.
    
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
        
        # Determine chains to query
        chains = [chain] if chain else None  # None = all chains
        
        # Discover transactions via DeBank
        discovery = await get_discovery_service()
        result = await discovery.discover_transactions(
            wallet_address=address,
            chains=chains,
            since=since_dt,
            until=until_dt
        )
        
        all_transactions = result["transactions"]
        
        # Filter by project if specified
        if project:
            all_transactions = [
                tx for tx in all_transactions 
                if tx.get("project_id") == project
            ]
        
        # Calculate pagination
        total = len(all_transactions)
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        
        # Slice for current page
        page_transactions = all_transactions[start_idx:end_idx]
        
        # Rebuild summary after filtering
        summary = _build_summary(all_transactions) if project else result["summary"]
        
        return {
            "status": "success",
            "data": {
                "transactions": page_transactions,
                "wallet": address.lower(),
                "tokenDict": result["token_dict"],
                "projectDict": result["project_dict"],
                "chainNames": CHAIN_NAMES,
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
                    "chain": chain,
                    "project": project
                },
                "summary": summary,
                "chainsQueried": result["chains_queried"],
                "chainsWithData": result["chains_with_data"]
            }
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": str(e)})
    except Exception as e:
        logger.exception(f"Error discovering transactions for {address}")
        raise HTTPException(
            status_code=500, 
            detail={"error": "Failed to discover transactions", "message": str(e)}
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


def _build_summary(transactions: List[Dict]) -> Dict[str, Any]:
    """Build summary statistics from transactions"""
    by_chain = {}
    by_project = {}
    
    for tx in transactions:
        chain = tx.get("chain", "unknown")
        by_chain[chain] = by_chain.get(chain, 0) + 1
        
        project = tx.get("project_id") or "other"
        by_project[project] = by_project.get(project, 0) + 1
    
    return {
        "total": len(transactions),
        "byChain": by_chain,
        "byProject": by_project
    }
