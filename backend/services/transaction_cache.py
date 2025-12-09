"""
Transaction Cache Service

Caches discovered transactions in SQLite to avoid repeated API calls.
Supports incremental sync - only fetches new transactions since last sync.
Supports price caching - stores USD prices separately from raw transaction data.

Storage: SQLite database per wallet in /app/cache/ directory
"""

import sqlite3
import json
import logging
from pathlib import Path
from typing import Any, Optional
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
            # Main transactions table
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
            
            # Price cache table - stores USD prices per token per transaction
            conn.execute("""
                CREATE TABLE IF NOT EXISTS transaction_prices (
                    tx_id TEXT NOT NULL,
                    token_address TEXT NOT NULL,
                    price_usd REAL,
                    value_usd REAL,
                    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (tx_id, token_address)
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_prices_tx ON transaction_prices(tx_id)
            """)
            
            # Metadata table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value JSON NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # ===== Phase 7: Strategy Persistence =====
            
            # Strategies table - user-defined groupings of positions
            conn.execute("""
                CREATE TABLE IF NOT EXISTS strategies (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Strategy-Position assignments (many-to-many with allocation %)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS strategy_positions (
                    strategy_id TEXT NOT NULL,
                    position_id TEXT NOT NULL,
                    percentage REAL NOT NULL DEFAULT 100.0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (strategy_id, position_id),
                    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sp_strategy ON strategy_positions(strategy_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_sp_position ON strategy_positions(position_id)
            """)
            
            # Position customizations (user-defined names, notes)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS position_customizations (
                    position_id TEXT PRIMARY KEY,
                    custom_name TEXT,
                    notes TEXT,
                    hidden INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # User-created positions
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_positions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    chain TEXT,
                    protocol TEXT,
                    position_type TEXT,
                    status TEXT DEFAULT 'open',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Position-Transaction links
            conn.execute("""
                CREATE TABLE IF NOT EXISTS position_transactions (
                    position_id TEXT NOT NULL,
                    transaction_id TEXT NOT NULL,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (position_id, transaction_id),
                    FOREIGN KEY (position_id) REFERENCES user_positions(id)
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pt_position ON position_transactions(position_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pt_transaction ON position_transactions(transaction_id)
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
    
    def save_transactions(self, transactions: list[dict[str, Any]]):
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
    ) -> list[dict[str, Any]]:
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

    # ===== Price Caching Methods =====
    
    def save_token_price(
        self, 
        tx_id: str, 
        token_address: str, 
        price_usd: Optional[float],
        value_usd: Optional[float]
    ):
        """Save a single token price for a transaction"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO transaction_prices 
                (tx_id, token_address, price_usd, value_usd, fetched_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (tx_id, token_address.lower(), price_usd, value_usd))
            conn.commit()
    
    def save_transaction_prices(self, tx_id: str, prices: dict[str, dict[str, float]]):
        """
        Save multiple token prices for a transaction.
        
        Args:
            tx_id: Transaction ID
            prices: Dict mapping token_address -> {price_usd, value_usd}
        """
        with sqlite3.connect(self.db_path) as conn:
            for token_addr, price_data in prices.items():
                conn.execute("""
                    INSERT OR REPLACE INTO transaction_prices 
                    (tx_id, token_address, price_usd, value_usd, fetched_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (
                    tx_id, 
                    token_addr.lower(), 
                    price_data.get("price_usd"),
                    price_data.get("value_usd")
                ))
            conn.commit()
    
    def get_transaction_prices(self, tx_id: str) -> dict[str, dict[str, float]]:
        """
        Get all cached prices for a transaction.
        
        Returns:
            Dict mapping token_address -> {price_usd, value_usd}
        """
        with sqlite3.connect(self.db_path) as conn:
            results = conn.execute("""
                SELECT token_address, price_usd, value_usd 
                FROM transaction_prices 
                WHERE tx_id = ?
            """, (tx_id,)).fetchall()
            
            return {
                row[0]: {"price_usd": row[1], "value_usd": row[2]}
                for row in results
            }
    
    def has_prices(self, tx_id: str) -> bool:
        """Check if a transaction has any cached prices"""
        with sqlite3.connect(self.db_path) as conn:
            result = conn.execute("""
                SELECT COUNT(*) FROM transaction_prices WHERE tx_id = ?
            """, (tx_id,)).fetchone()
            return result[0] > 0 if result else False
    
    def get_transactions_needing_prices(self) -> list[str]:
        """Get list of transaction IDs that don't have cached prices"""
        with sqlite3.connect(self.db_path) as conn:
            results = conn.execute("""
                SELECT t.tx_id 
                FROM transactions t
                LEFT JOIN transaction_prices p ON t.tx_id = p.tx_id
                WHERE p.tx_id IS NULL
            """).fetchall()
            return [row[0] for row in results]

    def load_transactions_with_prices(
        self, 
        since_ts: Optional[int] = None,
        until_ts: Optional[int] = None,
        chain: Optional[str] = None
    ) -> list[dict[str, Any]]:
        """
        Load transactions and merge in cached prices.
        
        Returns transactions with price_usd and value_usd added to sends/receives.
        """
        transactions = self.load_transactions(since_ts, until_ts, chain)
        
        for tx in transactions:
            tx_id = tx.get("id", tx.get("tx", {}).get("hash", ""))
            prices = self.get_transaction_prices(tx_id)
            
            if not prices:
                continue
            
            # Merge prices into sends
            for token in tx.get("sends", []) or []:
                token_addr = token.get("token_id", "").lower()
                if token_addr in prices:
                    token["price_usd"] = prices[token_addr]["price_usd"]
                    token["value_usd"] = prices[token_addr]["value_usd"]
            
            # Merge prices into receives
            for token in tx.get("receives", []) or []:
                token_addr = token.get("token_id", "").lower()
                if token_addr in prices:
                    token["price_usd"] = prices[token_addr]["price_usd"]
                    token["value_usd"] = prices[token_addr]["value_usd"]
        
        return transactions

    # ===== Metadata Methods =====
    
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

    def get_cache_stats(self) -> dict[str, Any]:
        """Get cache statistics"""
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
            
            chains = conn.execute("""
                SELECT chain, COUNT(*) FROM transactions GROUP BY chain
            """).fetchall()
            
            # Count transactions with prices
            priced = conn.execute("""
                SELECT COUNT(DISTINCT tx_id) FROM transaction_prices
            """).fetchone()[0]
            
            oldest = self.get_oldest_timestamp()
            newest = self.get_latest_timestamp()
            
            return {
                "wallet": self.wallet,
                "total_transactions": total,
                "transactions_with_prices": priced,
                "transactions_needing_prices": total - priced,
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
            conn.execute("DELETE FROM transaction_prices")
            conn.execute("DELETE FROM metadata")
            conn.commit()
        logger.info(f"Cleared cache for {self.wallet[:10]}...")
    
    def clear_prices(self):
        """Clear only cached prices (keep transactions)"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM transaction_prices")
            conn.commit()
        logger.info(f"Cleared price cache for {self.wallet[:10]}...")

    # ===== Strategy CRUD Methods =====
    
    def create_strategy(
        self, 
        strategy_id: str,
        name: str, 
        description: Optional[str] = None,
        positions: Optional[list[dict[str, Any]]] = None
    ) -> dict[str, Any]:
        """
        Create a new strategy.
        
        Args:
            strategy_id: Unique ID for the strategy
            name: Strategy name
            description: Optional description
            positions: List of {position_id, percentage} dicts
        
        Returns:
            Created strategy dict
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO strategies (id, name, description, status)
                VALUES (?, ?, ?, 'draft')
            """, (strategy_id, name, description))
            
            # Add position assignments if provided
            if positions:
                for pos in positions:
                    conn.execute("""
                        INSERT INTO strategy_positions (strategy_id, position_id, percentage)
                        VALUES (?, ?, ?)
                    """, (strategy_id, pos["position_id"], pos.get("percentage", 100.0)))
            
            conn.commit()
        
        return self.get_strategy(strategy_id)
    
    def get_strategy(self, strategy_id: str) -> Optional[dict[str, Any]]:
        """Get a strategy by ID with its positions"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            row = conn.execute("""
                SELECT * FROM strategies WHERE id = ?
            """, (strategy_id,)).fetchone()
            
            if not row:
                return None
            
            # Get position assignments
            positions = conn.execute("""
                SELECT position_id, percentage FROM strategy_positions
                WHERE strategy_id = ?
            """, (strategy_id,)).fetchall()
            
            return {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "status": row["status"],
                "positionIds": [p["position_id"] for p in positions],
                "positions": [
                    {"positionId": p["position_id"], "percentage": p["percentage"]}
                    for p in positions
                ],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
    
    def get_all_strategies(self) -> list[dict[str, Any]]:
        """Get all strategies for this wallet"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            rows = conn.execute("""
                SELECT id FROM strategies ORDER BY created_at DESC
            """).fetchall()
            
            return [self.get_strategy(row["id"]) for row in rows]
    
    def update_strategy(
        self, 
        strategy_id: str, 
        name: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        positions: Optional[list[dict[str, Any]]] = None
    ) -> Optional[dict[str, Any]]:
        """Update a strategy"""
        with sqlite3.connect(self.db_path) as conn:
            # Build update query dynamically
            updates = []
            params = []
            
            if name is not None:
                updates.append("name = ?")
                params.append(name)
            if description is not None:
                updates.append("description = ?")
                params.append(description)
            if status is not None:
                updates.append("status = ?")
                params.append(status)
            
            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(strategy_id)
                conn.execute(f"""
                    UPDATE strategies SET {', '.join(updates)} WHERE id = ?
                """, params)
            
            # Update positions if provided
            if positions is not None:
                # Clear existing and re-insert
                conn.execute("DELETE FROM strategy_positions WHERE strategy_id = ?", (strategy_id,))
                for pos in positions:
                    conn.execute("""
                        INSERT INTO strategy_positions (strategy_id, position_id, percentage)
                        VALUES (?, ?, ?)
                    """, (strategy_id, pos["positionId"], pos.get("percentage", 100.0)))
            
            conn.commit()
        
        return self.get_strategy(strategy_id)
    
    def delete_strategy(self, strategy_id: str) -> bool:
        """Delete a strategy"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("DELETE FROM strategies WHERE id = ?", (strategy_id,))
            conn.commit()
            return cursor.rowcount > 0

    # ==================== User Position CRUD ====================
    
    def create_user_position(
        self,
        name: str,
        description: str = "",
        chain: str = "",
        protocol: str = "",
        position_type: str = ""
    ) -> dict[str, Any]:
        """Create a new user-defined position"""
        import uuid
        position_id = str(uuid.uuid4())
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO user_positions (id, name, description, chain, protocol, position_type)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (position_id, name, description, chain, protocol, position_type))
            conn.commit()
        
        return self.get_user_position(position_id)
    
    def get_user_position(self, position_id: str) -> Optional[dict[str, Any]]:
        """Get a single user position with its transactions"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            row = conn.execute(
                "SELECT * FROM user_positions WHERE id = ?",
                (position_id,)
            ).fetchone()
            
            if not row:
                return None
            
            position = dict(row)
            
            # Get linked transaction IDs
            tx_rows = conn.execute("""
                SELECT transaction_id, added_at
                FROM position_transactions
                WHERE position_id = ?
                ORDER BY added_at DESC
            """, (position_id,)).fetchall()
            
            position["transactionIds"] = [r["transaction_id"] for r in tx_rows]
            position["transactionCount"] = len(tx_rows)
            
            return position
    
    def get_all_user_positions(self) -> list[dict[str, Any]]:
        """Get all user-created positions with their transaction IDs"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            rows = conn.execute("""
                SELECT * FROM user_positions
                ORDER BY updated_at DESC
            """).fetchall()
            
            positions = []
            for row in rows:
                position = dict(row)
                
                # Get linked transaction IDs
                tx_rows = conn.execute("""
                    SELECT transaction_id FROM position_transactions
                    WHERE position_id = ?
                    ORDER BY added_at DESC
                """, (position["id"],)).fetchall()
                
                position["transactionIds"] = [r["transaction_id"] for r in tx_rows]
                position["transactionCount"] = len(tx_rows)
                
                positions.append(position)
            
            return positions
    
    def update_user_position(
        self,
        position_id: str,
        name: str = None,
        description: str = None,
        status: str = None
    ) -> Optional[dict[str, Any]]:
        """Update a user position"""
        updates = []
        params = []
        
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        
        if not updates:
            return self.get_user_position(position_id)
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(position_id)
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(f"""
                UPDATE user_positions
                SET {', '.join(updates)}
                WHERE id = ?
            """, params)
            conn.commit()
        
        return self.get_user_position(position_id)
    
    def delete_user_position(self, position_id: str) -> bool:
        """Delete a user position and its transaction links"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM position_transactions WHERE position_id = ?", (position_id,))
            cursor = conn.execute("DELETE FROM user_positions WHERE id = ?", (position_id,))
            conn.commit()
            return cursor.rowcount > 0
    
    def add_transaction_to_position(self, position_id: str, transaction_id: str) -> bool:
        """Add a transaction to a position"""
        with sqlite3.connect(self.db_path) as conn:
            try:
                conn.execute("""
                    INSERT OR IGNORE INTO position_transactions (position_id, transaction_id)
                    VALUES (?, ?)
                """, (position_id, transaction_id))
                conn.commit()
                return True
            except Exception:
                return False
    
    def remove_transaction_from_position(self, position_id: str, transaction_id: str) -> bool:
        """Remove a transaction from a position"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                DELETE FROM position_transactions
                WHERE position_id = ? AND transaction_id = ?
            """, (position_id, transaction_id))
            conn.commit()
            return cursor.rowcount > 0
    
    def get_assigned_transaction_ids(self) -> set:
        """Get all transaction IDs that are assigned to any position"""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT DISTINCT transaction_id FROM position_transactions"
            ).fetchall()
            return {row[0] for row in rows}


def get_cache(wallet_address: str) -> TransactionCache:
    """Get or create cache for a wallet"""
    return TransactionCache(wallet_address)
