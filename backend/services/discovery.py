"""
Transaction Discovery Service using DeBank as source of truth.

This service fetches ALL transactions across ALL chains for a wallet.
DeBank is used for discovery (completeness), while protocol-specific
subgraphs can be used later for enrichment (accuracy).

Architecture:
- Discovery: DeBank /user/all_history_list (this service)
- Enrichment: Subgraphs (on-demand, separate service)

Key improvements:
- Uses /user/used_chain_list to find ALL chains wallet has used
- Uses /user/all_history_list for cross-chain transaction discovery
- Proper pagination to fetch complete history
"""

import httpx
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

from backend.core.config import settings
from backend.services.transaction_cache import get_cache, TransactionCache

logger = logging.getLogger(__name__)

DEBANK_BASE_URL = "https://pro-openapi.debank.com/v1"

# Chain display names (will be dynamically updated from API)
DEFAULT_CHAIN_NAMES = {
    "eth": "Ethereum",
    "arb": "Arbitrum",
    "op": "Optimism", 
    "base": "Base",
    "matic": "Polygon",
    "bsc": "BNB Chain",
    "avax": "Avalanche",
    "ftm": "Fantom",
    "uni": "Unichain",
    "scrl": "Scroll",
    "xdai": "Gnosis Chain",
    "blast": "Blast",
    "monad": "Monad",
    "linea": "Linea",
    "zksync": "zkSync Era",
    "mnt": "Mantle",
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
        self.chain_names = DEFAULT_CHAIN_NAMES.copy()
    
    async def close(self):
        await self.client.aclose()
    
    async def get_used_chains(self, wallet_address: str) -> List[Dict[str, Any]]:
        """
        Get list of all chains this wallet has ever used.
        This ensures we don't miss any transactions on obscure chains.
        """
        wallet = wallet_address.lower()
        try:
            response = await self.client.get(
                "/user/used_chain_list",
                params={"id": wallet}
            )
            response.raise_for_status()
            chains = response.json()
            
            # Update chain names from API response
            for chain in chains:
                self.chain_names[chain["id"]] = chain["name"]
            
            logger.info(f"Wallet {wallet[:10]}... has used {len(chains)} chains")
            return chains
        except Exception as e:
            logger.error(f"Error fetching used chains: {e}")
            return []
    
    async def discover_transactions(
        self,
        wallet_address: str,
        chains: Optional[List[str]] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
        page_count: int = 20,
        max_pages: int = 100,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Discover all transactions for a wallet across all chains.
        Uses caching for fast subsequent loads with incremental sync.
        
        Args:
            wallet_address: The wallet to query
            chains: Optional list of chain IDs to filter (default: all used chains)
            since: Only include transactions after this time
            until: Only include transactions before this time
            page_count: Items per page (max 20)
            max_pages: Max pages to fetch total
            force_refresh: If True, clear cache and refetch everything
            
        Returns:
            Dict with transactions, metadata, and cache info
        """
        wallet = wallet_address.lower()
        cache = get_cache(wallet)
        
        # Handle force refresh
        if force_refresh:
            cache.clear_cache()
            logger.info(f"Force refresh: cleared cache for {wallet[:10]}...")
        
        # First, get all chains this wallet has used
        used_chains = await self.get_used_chains(wallet)
        used_chain_ids = [c["id"] for c in used_chains]
        chains_to_query = chains if chains else used_chain_ids
        
        since_ts = int(since.timestamp()) if since else None
        until_ts = int(until.timestamp()) if until else None
        
        # Check cache status
        cached_count = cache.get_transaction_count()
        latest_cached_ts = cache.get_latest_timestamp()
        
        if cached_count > 0 and latest_cached_ts and not force_refresh:
            # Incremental sync: only fetch transactions newer than cache
            logger.info(f"Cache hit: {cached_count} txs, syncing since {latest_cached_ts}")
            
            # Fetch only new transactions (since latest cached)
            new_result = await self._fetch_all_history(
                wallet, chains_to_query, 
                since_ts=latest_cached_ts,  # Start from last cached
                until_ts=until_ts,
                page_count=page_count, 
                max_pages=max_pages
            )
            
            # Save new transactions to cache
            if new_result["transactions"]:
                cache.save_transactions(new_result["transactions"])
                # Update metadata
                cache.save_metadata("token_dict", new_result["token_dict"])
                cache.save_metadata("project_dict", new_result["project_dict"])
                logger.info(f"Added {len(new_result['transactions'])} new transactions to cache")
            
            # Load all from cache with filters
            all_transactions = cache.load_transactions(
                since_ts=since_ts,
                until_ts=until_ts,
                chain=chains[0] if chains and len(chains) == 1 else None
            )
            
            # Load metadata from cache
            token_dict = cache.load_metadata("token_dict") or {}
            project_dict = cache.load_metadata("project_dict") or {}
            token_dict.update(new_result.get("token_dict", {}))
            project_dict.update(new_result.get("project_dict", {}))
            
            cache_status = "incremental_sync"
            new_tx_count = len(new_result["transactions"])
            
        else:
            # Full fetch (no cache or force refresh)
            logger.info(f"Full fetch for {wallet[:10]}... (no cache)")
            
            result = await self._fetch_all_history(
                wallet, chains_to_query, since_ts, until_ts,
                page_count, max_pages
            )
            
            # Save everything to cache
            cache.save_transactions(result["transactions"])
            cache.save_metadata("token_dict", result["token_dict"])
            cache.save_metadata("project_dict", result["project_dict"])
            cache.save_metadata("chain_names", self.chain_names)
            
            all_transactions = result["transactions"]
            token_dict = result["token_dict"]
            project_dict = result["project_dict"]
            cache_status = "full_fetch"
            new_tx_count = len(all_transactions)
        
        # Filter by chain if multiple specified
        if chains and len(chains) > 1:
            all_transactions = [
                tx for tx in all_transactions
                if tx.get("chain") in chains
            ]
        
        # Build summary
        summary = self._build_summary(all_transactions)
        cache_stats = cache.get_cache_stats()
        
        return {
            "transactions": all_transactions,
            "token_dict": token_dict,
            "project_dict": project_dict,
            "chains_queried": chains_to_query,
            "chains_with_data": list(summary["byChain"].keys()),
            "chain_names": self.chain_names,
            "summary": summary,
            "cache": {
                "status": cache_status,
                "new_transactions": new_tx_count,
                "total_cached": cache_stats["total_transactions"],
                "oldest_date": cache_stats["oldest_date"],
                "newest_date": cache_stats["newest_date"],
            }
        }

    async def _fetch_all_history(
        self,
        wallet: str,
        chains: List[str],
        since_ts: Optional[int],
        until_ts: Optional[int],
        page_count: int,
        max_pages: int
    ) -> Dict[str, Any]:
        """
        Fetch transaction history across all chains using all_history_list endpoint.
        This is more efficient than querying each chain separately.
        """
        all_transactions = []
        token_dict = {}
        project_dict = {}
        start_time = until_ts  # Start from most recent, paginate backwards
        
        for page in range(max_pages):
            params = {
                "id": wallet,
                "page_count": min(page_count, 20)  # DeBank max is 20
            }
            
            # Add chain filter if specific chains requested
            if chains:
                params["chain_ids"] = ",".join(chains)
            
            if start_time:
                params["start_time"] = int(start_time)
            
            try:
                response = await self.client.get("/user/all_history_list", params=params)
                response.raise_for_status()
                data = response.json()
                
                # Merge dictionaries
                token_dict.update(data.get("token_dict", {}))
                project_dict.update(data.get("project_dict", {}))
                
                # Update cate_dict for category names
                cate_dict = data.get("cate_dict", {})
                
                history = data.get("history_list", [])
                if not history:
                    logger.info(f"No more transactions after page {page}")
                    break
                
                # Process transactions
                for tx in history:
                    tx_time = tx.get("time_at", 0)
                    
                    # Skip if before our date range
                    if since_ts and tx_time < since_ts:
                        logger.info(f"Reached date limit at page {page}, tx time {tx_time} < {since_ts}")
                        return {
                            "transactions": all_transactions,
                            "token_dict": token_dict,
                            "project_dict": project_dict
                        }
                    
                    # Skip scam transactions
                    if tx.get("is_scam", False):
                        continue
                    
                    # Add category name from cate_dict
                    if tx.get("cate_id") and tx["cate_id"] in cate_dict:
                        tx["cate_name"] = cate_dict[tx["cate_id"]]
                    
                    all_transactions.append(tx)
                
                # Update start_time for next page (use oldest tx from this batch)
                oldest_tx_time = history[-1].get("time_at")
                if oldest_tx_time:
                    start_time = int(oldest_tx_time)
                
                # If we got fewer than requested, we've reached the end
                if len(history) < page_count:
                    logger.info(f"Reached end of history at page {page} ({len(history)} < {page_count})")
                    break
                
                logger.info(f"Page {page}: got {len(history)} txs, total now {len(all_transactions)}")
                    
            except Exception as e:
                logger.error(f"Error fetching all_history_list page {page}: {e}")
                break
        
        logger.info(f"Fetched total {len(all_transactions)} transactions across {len(set(tx.get('chain') for tx in all_transactions))} chains")
        
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
