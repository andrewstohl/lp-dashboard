"""
Transaction Cache Service

Caches discovered transactions in SQLite to avoid repeated API calls.
Supports incremental sync - only fetches new transactions since last sync.

Storage: SQLite database per wallet in /app/cache/ directory
"""

import sqlite3
import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Cache directory
CACHE_DIR = Path("/app/cache")
CACHE_DIR.mkdir(exist_ok=True)


class TransactionCache:
    """
    SQLite-based transaction cache for a single wallet.
    """
    
    def __init__(self, wallet_address: str):
        self.wallet = wallet_address.lower()
        self.db_path = CACHE_DIR / f"{self.wallet}.db"
        self._init_db()
    
    def _init_db(self):
        """Initialize database schema"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS transactions (
                    tx_id TEXT PRIMARY KEY,
                    chain TEXT NOT NULL,
                    time_at INTEGER NOT NULL,
                    data JSON NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_time_at ON transactions(time_at DESC)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_chain ON transactions(chain)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value JSON NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()

    def get_latest_timestamp(self) -> Optional[int]:
        """Get timestamp of most recent cached transaction"""
        with sqlite3.connect(self.db_path) as conn:
            result = conn.execute(
                "SELECT MAX(time_at) FROM transactions"
            ).fetchone()
            return result[0] if result and result[0] else None
    
    def get_oldest_timestamp(self) -> Optional[int]:
        """Get timestamp of oldest cached transaction"""
        with sqlite3.connect(self.db_path) as conn:
            result = conn.execute(
                "SELECT MIN(time_at) FROM transactions"
            ).fetchone()
            return result[0] if result and result[0] else None
    
    def get_transaction_count(self) -> int:
        """Get total number of cached transactions"""
        with sqlite3.connect(self.db_path) as conn:
            result = conn.execute(
                "SELECT COUNT(*) FROM transactions"
            ).fetchone()
            return result[0] if result else 0
    
    def save_transactions(self, transactions: List[Dict[str, Any]]):
        """Save transactions to cache (upsert)"""
        if not transactions:
            return
        
        with sqlite3.connect(self.db_path) as conn:
            for tx in transactions:
                tx_id = tx.get("id", tx.get("tx", {}).get("hash", ""))
                chain = tx.get("chain", "unknown")
                time_at = tx.get("time_at", 0)
                
                conn.execute("""
                    INSERT OR REPLACE INTO transactions (tx_id, chain, time_at, data)
                    VALUES (?, ?, ?, ?)
                """, (tx_id, chain, int(time_at), json.dumps(tx)))
            
            conn.commit()
        
        logger.info(f"Cached {len(transactions)} transactions for {self.wallet[:10]}...")

    def load_transactions(
        self, 
        since_ts: Optional[int] = None,
        until_ts: Optional[int] = None,
        chain: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Load transactions from cache with optional filters"""
        query = "SELECT data FROM transactions WHERE 1=1"
        params = []
        
        if since_ts:
            query += " AND time_at >= ?"
            params.append(since_ts)
        
        if until_ts:
            query += " AND time_at <= ?"
            params.append(until_ts)
        
        if chain:
            query += " AND chain = ?"
            params.append(chain)
        
        query += " ORDER BY time_at DESC"
        
        with sqlite3.connect(self.db_path) as conn:
            results = conn.execute(query, params).fetchall()
            return [json.loads(row[0]) for row in results]
    
    def save_metadata(self, key: str, value: Any):
        """Save metadata (token_dict, project_dict, etc.)"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO metadata (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            """, (key, json.dumps(value)))
            conn.commit()
    
    def load_metadata(self, key: str) -> Optional[Any]:
        """Load metadata by key"""
        with sqlite3.connect(self.db_path) as conn:
            result = conn.execute(
                "SELECT value FROM metadata WHERE key = ?", (key,)
            ).fetchone()
            return json.loads(result[0]) if result else None
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
            
            chains = conn.execute("""
                SELECT chain, COUNT(*) FROM transactions GROUP BY chain
            """).fetchall()
            
            oldest = self.get_oldest_timestamp()
            newest = self.get_latest_timestamp()
            
            return {
                "wallet": self.wallet,
                "total_transactions": total,
                "by_chain": dict(chains),
                "oldest_timestamp": oldest,
                "newest_timestamp": newest,
                "oldest_date": datetime.fromtimestamp(oldest).isoformat() if oldest else None,
                "newest_date": datetime.fromtimestamp(newest).isoformat() if newest else None,
            }
    
    def clear_cache(self):
        """Clear all cached data for this wallet"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM transactions")
            conn.execute("DELETE FROM metadata")
            conn.commit()
        logger.info(f"Cleared cache for {self.wallet[:10]}...")


def get_cache(wallet_address: str) -> TransactionCache:
    """Get or create cache for a wallet"""
    return TransactionCache(wallet_address)
