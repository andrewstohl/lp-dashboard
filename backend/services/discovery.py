"""
Transaction Discovery Service using DeBank as source of truth.

This service fetches ALL transactions across ALL chains for a wallet.
DeBank is used for discovery (completeness), while protocol-specific
subgraphs can be used later for enrichment (accuracy).

Architecture:
- Discovery: DeBank /user/history_list (this service)
- Enrichment: Subgraphs (on-demand, separate service)
"""

import httpx
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

from backend.core.config import settings

logger = logging.getLogger(__name__)

DEBANK_BASE_URL = "https://pro-openapi.debank.com/v1"

# Supported chains for discovery
SUPPORTED_CHAINS = [
    "eth",      # Ethereum
    "arb",      # Arbitrum
    "op",       # Optimism
    "base",     # Base
    "matic",    # Polygon
    "bsc",      # BNB Chain
    "avax",     # Avalanche
    "ftm",      # Fantom
    "sol",      # Solana (if supported)
]

# Chain display names
CHAIN_NAMES = {
    "eth": "Ethereum",
    "arb": "Arbitrum",
    "op": "Optimism", 
    "base": "Base",
    "matic": "Polygon",
    "bsc": "BNB Chain",
    "avax": "Avalanche",
    "ftm": "Fantom",
}


class TransactionDiscoveryService:
    """
    Discovers all transactions for a wallet using DeBank API.
    Returns DeBank's native format for maximum flexibility.
    """
    
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=DEBANK_BASE_URL,
            headers={"AccessKey": settings.debank_access_key},
            timeout=30.0
        )
    
    async def close(self):
        await self.client.aclose()
    
    async def discover_transactions(
        self,
        wallet_address: str,
        chains: Optional[List[str]] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
        page_count: int = 20,
        max_pages_per_chain: int = 50
    ) -> Dict[str, Any]:
        """
        Discover all transactions for a wallet across specified chains.
        
        Args:
            wallet_address: The wallet to query
            chains: List of chain IDs to query (default: all supported)
            since: Only include transactions after this time
            until: Only include transactions before this time
            page_count: Items per page (max 20)
            max_pages_per_chain: Max pages to fetch per chain
            
        Returns:
            Dict with:
            - transactions: List of raw DeBank transactions
            - token_dict: Token metadata
            - project_dict: Project/protocol metadata
            - chains_queried: Which chains were searched
            - summary: Counts by chain and project
        """
        wallet = wallet_address.lower()
        chains_to_query = chains or SUPPORTED_CHAINS
        
        since_ts = int(since.timestamp()) if since else None
        until_ts = int(until.timestamp()) if until else None
        
        all_transactions = []
        merged_token_dict = {}
        merged_project_dict = {}
        chains_with_data = []
        
        for chain in chains_to_query:
            try:
                result = await self._fetch_chain_history(
                    wallet, chain, since_ts, until_ts,
                    page_count, max_pages_per_chain
                )
                
                if result["transactions"]:
                    chains_with_data.append(chain)
                    all_transactions.extend(result["transactions"])
                    merged_token_dict.update(result["token_dict"])
                    merged_project_dict.update(result["project_dict"])
                    
            except Exception as e:
                logger.warning(f"Error fetching {chain} history: {e}")
                continue
        
        # Sort all transactions by timestamp (newest first)
        all_transactions.sort(key=lambda x: x.get("time_at", 0), reverse=True)
        
        # Build summary
        summary = self._build_summary(all_transactions)
        
        return {
            "transactions": all_transactions,
            "token_dict": merged_token_dict,
            "project_dict": merged_project_dict,
            "chains_queried": chains_to_query,
            "chains_with_data": chains_with_data,
            "summary": summary
        }
    
    async def _fetch_chain_history(
        self,
        wallet: str,
        chain: str,
        since_ts: Optional[int],
        until_ts: Optional[int],
        page_count: int,
        max_pages: int
    ) -> Dict[str, Any]:
        """Fetch transaction history for a single chain"""
        
        all_transactions = []
        token_dict = {}
        project_dict = {}
        start_time = until_ts  # Start from most recent, paginate backwards
        
        for page in range(max_pages):
            params = {
                "id": wallet,
                "chain_id": chain,
                "page_count": min(page_count, 20)
            }
            if start_time:
                params["start_time"] = start_time
            
            try:
                response = await self.client.get("/user/history_list", params=params)
                response.raise_for_status()
                data = response.json()
                
                # Merge dictionaries
                token_dict.update(data.get("token_dict", {}))
                project_dict.update(data.get("project_dict", {}))
                
                history = data.get("history_list", [])
                if not history:
                    break
                
                # Filter by date range and add to results
                for tx in history:
                    tx_time = tx.get("time_at", 0)
                    
                    # Skip if before our range
                    if since_ts and tx_time < since_ts:
                        # We've gone past our date range, stop pagination
                        return {
                            "transactions": all_transactions,
                            "token_dict": token_dict,
                            "project_dict": project_dict
                        }
                    
                    # Skip scam transactions
                    if tx.get("is_scam", False):
                        continue
                    
                    all_transactions.append(tx)
                
                # Update start_time for next page
                start_time = history[-1].get("time_at")
                
                # If we got fewer than requested, we've reached the end
                if len(history) < page_count:
                    break
                    
            except Exception as e:
                logger.error(f"Error fetching {chain} history page {page}: {e}")
                break
        
        return {
            "transactions": all_transactions,
            "token_dict": token_dict,
            "project_dict": project_dict
        }
    
    def _build_summary(self, transactions: List[Dict]) -> Dict[str, Any]:
        """Build summary statistics from transactions"""
        by_chain = {}
        by_project = {}
        by_category = {}
        
        for tx in transactions:
            # Count by chain
            chain = tx.get("chain", "unknown")
            by_chain[chain] = by_chain.get(chain, 0) + 1
            
            # Count by project
            project = tx.get("project_id") or "other"
            by_project[project] = by_project.get(project, 0) + 1
            
            # Count by category
            category = tx.get("cate_id") or tx.get("tx", {}).get("name", "unknown")
            by_category[category] = by_category.get(category, 0) + 1
        
        return {
            "total": len(transactions),
            "byChain": by_chain,
            "byProject": by_project,
            "byCategory": by_category
        }


# Global service instance
_discovery_service: Optional[TransactionDiscoveryService] = None


async def get_discovery_service() -> TransactionDiscoveryService:
    """Dependency injection for TransactionDiscoveryService"""
    global _discovery_service
    if _discovery_service is None:
        _discovery_service = TransactionDiscoveryService()
    return _discovery_service


async def close_discovery_service():
    """Cleanup on shutdown"""
    global _discovery_service
    if _discovery_service:
        await _discovery_service.close()
        _discovery_service = None
