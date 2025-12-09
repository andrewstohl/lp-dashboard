"""
GMX V2 Synthetics Subgraph Service

Queries the GMX synthetics-stats subgraph for:
- Position history (increases/decreases)
- Trade actions with realized P&L
- Market metadata

Used to supplement DeBank data with accurate historical values.
"""

import httpx
from typing import Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# GMX V2 Synthetics Stats Subgraph (Arbitrum)
GMX_SUBGRAPH_URL = "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api"

# Known token addresses on Arbitrum
TOKEN_INFO = {
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": {"symbol": "WETH", "decimals": 18},
    "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": {"symbol": "LINK", "decimals": 18},
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": {"symbol": "USDC", "decimals": 6},
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": {"symbol": "WBTC", "decimals": 8},
    "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a": {"symbol": "GMX", "decimals": 18},
}

# Known market addresses (cached from subgraph queries)
# Note: Some tokens have multiple markets (e.g., ETH/USD) with different collateral pools
# decimals: index token decimals used to calculate price precision (30 - decimals)
MARKET_INFO = {
    # ETH markets (two different collateral pools) - WETH has 18 decimals
    "0x70d95587d40a2caf56bd97485ab3eec10bee6336": {"name": "ETH/USD [1]", "index_token": "ETH", "decimals": 18},
    "0x450bb6774dd8a756274e0ab4107953259d2ac541": {"name": "ETH/USD [2]", "index_token": "ETH", "decimals": 18},
    # BTC market - WBTC has 8 decimals
    "0x47c031236e19d024b42f8ae6780e44a573170703": {"name": "BTC/USD", "index_token": "BTC", "decimals": 8},
    # Major alts - most use 18 decimals
    "0x7f1fa204bb700853d36994da19f830b6ad18455c": {"name": "LINK/USD", "index_token": "LINK", "decimals": 18},
    "0x09400d9db990d5ed3f35d7be61dfaeb900af03c9": {"name": "SOL/USD", "index_token": "SOL", "decimals": 9},
    "0xc25cef6061cf5de5eb761b50e4743c1f5d7e5407": {"name": "ARB/USD", "index_token": "ARB", "decimals": 18},
    "0x672fea44f4583ddad620d60c1ac31021f47558cb": {"name": "ARB/USD [2]", "index_token": "ARB", "decimals": 18},
    "0x55391d178ce46e7ac8eaaea50a72d1a5a8a622da": {"name": "GMX/USD", "index_token": "GMX", "decimals": 18},
    "0x1cbba6346f110c8a5ea739ef2d1eb182990e4eb2": {"name": "AAVE/USD", "index_token": "AAVE", "decimals": 18},
    # Memes
    "0x6853ea96ff216fab11d2d930ce3c508556a4bdc4": {"name": "DOGE/USD", "index_token": "DOGE", "decimals": 8},
    "0x2b477989a149b17073d9c9c82ec9cb03591e20c6": {"name": "PEPE/USD", "index_token": "PEPE", "decimals": 18},
    "0x2d340912aa47e33c90efb078e69e70efe2b34b9b": {"name": "WIF/USD", "index_token": "WIF", "decimals": 6},
    "0x7c11f78ce78768518d743e81fdfa2f860c6b9a77": {"name": "SATS/USD", "index_token": "SATS", "decimals": 18},
    # L1/L2 tokens
    "0x9f159014cc218e942e9e9481742fe5bfa9ac5a2c": {"name": "STX/USD", "index_token": "STX", "decimals": 18},
    "0xb3588455858a49d3244237cee00880ccb84b91dd": {"name": "XRP/USD", "index_token": "XRP", "decimals": 6},
    "0xf22cffa7b4174554ff9dbf7b5a8c01faadcea722": {"name": "SUI/USD", "index_token": "SUI", "decimals": 9},
    "0xfaeae570b07618d3f10360608e43c241181c4614": {"name": "NEAR/USD", "index_token": "NEAR", "decimals": 24},
}

# GMX V2 precision constants
# GMX stores USD values with 30 decimal precision
GMX_USD_PRECISION = 10**30
# Collateral amounts (USDC) use 6 decimals
USDC_PRECISION = 10**6


class GMXSubgraphService:
    """Service for querying GMX V2 Synthetics subgraph."""
    
    def __init__(self):
        self.url = GMX_SUBGRAPH_URL
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30)
        return self._client
    
    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
    
    async def _query(self, query: str) -> Optional[dict]:
        """Execute a GraphQL query."""
        try:
            client = await self._get_client()
            response = await client.post(self.url, json={"query": query})
            data = response.json()
            
            if "errors" in data:
                logger.error(f"GMX Subgraph error: {data['errors']}")
                return None
            
            return data
        except Exception as e:
            logger.error(f"GMX Subgraph query failed: {e}")
            return None
    
    def _safe_int(self, val, default: int = 0) -> int:
        """Safely convert value to int."""
        if val is None:
            return default
        try:
            return int(val)
        except (ValueError, TypeError):
            return default
    
    def _get_token_symbol(self, address: str) -> str:
        """Get token symbol from address."""
        info = TOKEN_INFO.get(address.lower(), {})
        return info.get("symbol", address[:8] + "...")
    
    def _get_market_name(self, address: str) -> str:
        """Get market name from address."""
        info = MARKET_INFO.get(address.lower(), {})
        return info.get("name", "Unknown")

    def _get_price_precision(self, market_address: str) -> float:
        """
        Get the price precision divisor for a market.

        GMX stores execution prices as: price * 10^(30 - indexTokenDecimals)
        So to get USD price, divide by 10^(30 - decimals)
        """
        info = MARKET_INFO.get(market_address.lower(), {})
        decimals = info.get("decimals", 18)  # Default to 18 for unknown tokens
        return 10 ** (30 - decimals)

    async def get_all_positions(
        self,
        wallet_address: str,
        limit: int = 100
    ) -> list[dict[str, Any]]:
        """
        Get ALL GMX V2 perpetual positions (both active and closed).

        This mirrors the Uniswap get_positions_by_owner() pattern.
        Groups by positionKey and returns summary for each position.

        Returns:
            List of position summaries with status, trades, P&L
        """
        wallet = wallet_address.lower()

        # Query position increases
        inc_query = """
        {
          positionIncreases(
            where: {account: "%s"}
            orderBy: transaction__timestamp
            orderDirection: desc
            first: %d
          ) {
            id
            positionKey
            marketAddress
            sizeInUsd
            sizeDeltaUsd
            collateralAmount
            executionPrice
            isLong
            transaction {
              id
              timestamp
              blockNumber
            }
          }
        }
        """ % (wallet, limit)

        # Query position decreases
        dec_query = """
        {
          positionDecreases(
            where: {account: "%s"}
            orderBy: transaction__timestamp
            orderDirection: desc
            first: %d
          ) {
            id
            positionKey
            marketAddress
            sizeInUsd
            sizeDeltaUsd
            collateralAmount
            executionPrice
            basePnlUsd
            isLong
            transaction {
              id
              timestamp
              blockNumber
            }
          }
        }
        """ % (wallet, limit)

        inc_data = await self._query(inc_query)
        dec_data = await self._query(dec_query)

        increases = inc_data.get("data", {}).get("positionIncreases", []) if inc_data else []
        decreases = dec_data.get("data", {}).get("positionDecreases", []) if dec_data else []

        logger.info(f"Found {len(increases)} increases and {len(decreases)} decreases for {wallet[:10]}...")

        # Group by positionKey
        positions_map: dict[str, dict] = {}

        for inc in increases:
            pos_key = inc.get("positionKey", "")
            if not pos_key:
                continue

            if pos_key not in positions_map:
                market_addr = inc.get("marketAddress", "").lower()
                market_info = MARKET_INFO.get(market_addr, {})
                positions_map[pos_key] = {
                    "position_key": pos_key,
                    "market_address": market_addr,
                    "market_name": market_info.get("name", "Unknown"),
                    "index_symbol": market_info.get("index_token", "?"),
                    "is_long": inc.get("isLong", False),
                    "side": "Long" if inc.get("isLong", False) else "Short",
                    "increases": [],
                    "decreases": [],
                }

            tx = inc.get("transaction", {})
            price_precision = self._get_price_precision(market_addr)
            positions_map[pos_key]["increases"].append({
                "timestamp": self._safe_int(tx.get("timestamp", 0)),
                "tx_hash": tx.get("id", ""),
                "size_delta_usd": self._safe_int(inc.get("sizeDeltaUsd", 0)) / GMX_USD_PRECISION,
                "size_after_usd": self._safe_int(inc.get("sizeInUsd", 0)) / GMX_USD_PRECISION,
                "execution_price": self._safe_int(inc.get("executionPrice", 0)) / price_precision,
                "collateral": self._safe_int(inc.get("collateralAmount", 0)) / USDC_PRECISION,
            })

        for dec in decreases:
            pos_key = dec.get("positionKey", "")
            if not pos_key:
                continue

            if pos_key not in positions_map:
                market_addr = dec.get("marketAddress", "").lower()
                market_info = MARKET_INFO.get(market_addr, {})
                positions_map[pos_key] = {
                    "position_key": pos_key,
                    "market_address": market_addr,
                    "market_name": market_info.get("name", "Unknown"),
                    "index_symbol": market_info.get("index_token", "?"),
                    "is_long": dec.get("isLong", False),
                    "side": "Long" if dec.get("isLong", False) else "Short",
                    "increases": [],
                    "decreases": [],
                }

            tx = dec.get("transaction", {})
            price_precision = self._get_price_precision(market_addr)
            positions_map[pos_key]["decreases"].append({
                "timestamp": self._safe_int(tx.get("timestamp", 0)),
                "tx_hash": tx.get("id", ""),
                "size_delta_usd": self._safe_int(dec.get("sizeDeltaUsd", 0)) / GMX_USD_PRECISION,
                "size_after_usd": self._safe_int(dec.get("sizeInUsd", 0)) / GMX_USD_PRECISION,
                "execution_price": self._safe_int(dec.get("executionPrice", 0)) / price_precision,
                "collateral": self._safe_int(dec.get("collateralAmount", 0)) / USDC_PRECISION,
                "pnl_usd": self._safe_int(dec.get("basePnlUsd", 0)) / GMX_USD_PRECISION,
            })

        # Build position summaries
        positions = []
        for pos_key, pos_data in positions_map.items():
            all_trades = pos_data["increases"] + pos_data["decreases"]

            # Get timestamps
            timestamps = [t["timestamp"] for t in all_trades if t.get("timestamp")]
            first_timestamp = min(timestamps) if timestamps else 0
            last_timestamp = max(timestamps) if timestamps else 0

            # Get current size from the most recent event
            all_sorted = sorted(all_trades, key=lambda x: x["timestamp"])
            current_size = all_sorted[-1]["size_after_usd"] if all_sorted else 0

            # Calculate total P&L from decreases
            total_pnl = sum(d.get("pnl_usd", 0) for d in pos_data["decreases"])

            # Calculate total size opened
            total_size_opened = sum(i["size_delta_usd"] for i in pos_data["increases"])

            positions.append({
                "position_key": pos_key,
                "market_address": pos_data["market_address"],
                "market_name": pos_data["market_name"],
                "index_symbol": pos_data["index_symbol"],
                "side": pos_data["side"],
                "is_long": pos_data["is_long"],
                "status": "ACTIVE" if current_size > 0.01 else "CLOSED",
                "current_size_usd": current_size,
                "total_size_opened_usd": total_size_opened,
                "total_trades": len(all_trades),
                "increase_count": len(pos_data["increases"]),
                "decrease_count": len(pos_data["decreases"]),
                "total_pnl_usd": total_pnl,
                "first_trade_timestamp": first_timestamp,
                "last_trade_timestamp": last_timestamp,
            })

        # Sort by last activity
        positions.sort(key=lambda x: x.get("last_trade_timestamp", 0), reverse=True)

        return positions

    async def get_all_trades(
        self,
        wallet_address: str,
        limit: int = 200
    ) -> list[dict[str, Any]]:
        """
        Get ALL GMX V2 trades as a flat list (no position grouping).

        Returns a simple list of all increases and decreases, each as a
        standalone trade record. This is optimized for display in a flat
        table with filtering/sorting.

        Returns:
            List of trade records with: market, side, action, size, price, pnl, fees, tx
        """
        wallet = wallet_address.lower()

        # Query position increases
        inc_query = """
        {
          positionIncreases(
            where: {account: "%s"}
            orderBy: transaction__timestamp
            orderDirection: desc
            first: %d
          ) {
            id
            positionKey
            marketAddress
            sizeInUsd
            sizeDeltaUsd
            collateralAmount
            executionPrice
            isLong
            transaction {
              id
              timestamp
            }
          }
        }
        """ % (wallet, limit)

        # Query position decreases
        dec_query = """
        {
          positionDecreases(
            where: {account: "%s"}
            orderBy: transaction__timestamp
            orderDirection: desc
            first: %d
          ) {
            id
            positionKey
            marketAddress
            sizeInUsd
            sizeDeltaUsd
            collateralAmount
            executionPrice
            basePnlUsd
            isLong
            transaction {
              id
              timestamp
            }
          }
        }
        """ % (wallet, limit)

        inc_data = await self._query(inc_query)
        dec_data = await self._query(dec_query)

        increases = inc_data.get("data", {}).get("positionIncreases", []) if inc_data else []
        decreases = dec_data.get("data", {}).get("positionDecreases", []) if dec_data else []

        logger.info(f"Found {len(increases)} increases and {len(decreases)} decreases for flat trade list")

        trades = []

        # Track first increase per position key to determine Open vs Increase
        position_first_increase: dict[str, int] = {}
        for inc in increases:
            pos_key = inc.get("positionKey", "")
            ts = self._safe_int(inc.get("transaction", {}).get("timestamp", 0))
            if pos_key not in position_first_increase or ts < position_first_increase[pos_key]:
                position_first_increase[pos_key] = ts

        # Process increases
        for inc in increases:
            pos_key = inc.get("positionKey", "")
            market_addr = inc.get("marketAddress", "").lower()
            market_info = MARKET_INFO.get(market_addr, {})
            tx = inc.get("transaction", {})
            ts = self._safe_int(tx.get("timestamp", 0))
            price_precision = self._get_price_precision(market_addr)

            # Determine if this is the first increase (Open) or subsequent (Increase)
            is_first = ts == position_first_increase.get(pos_key, 0)

            trades.append({
                "timestamp": ts,
                "tx_hash": tx.get("id", ""),
                "position_key": pos_key,
                "market_address": market_addr,
                "market": market_info.get("index_token", "?"),
                "market_name": market_info.get("name", "Unknown"),
                "side": "Long" if inc.get("isLong", False) else "Short",
                "is_long": inc.get("isLong", False),
                "action": "Open" if is_first else "Increase",
                "size_delta_usd": self._safe_int(inc.get("sizeDeltaUsd", 0)) / GMX_USD_PRECISION,
                "size_after_usd": self._safe_int(inc.get("sizeInUsd", 0)) / GMX_USD_PRECISION,
                "collateral_usd": self._safe_int(inc.get("collateralAmount", 0)) / USDC_PRECISION,
                "execution_price": self._safe_int(inc.get("executionPrice", 0)) / price_precision,
                "pnl_usd": 0.0,
                "fees_usd": 0.0,  # Fees would require additional query
            })

        # Process decreases
        for dec in decreases:
            pos_key = dec.get("positionKey", "")
            market_addr = dec.get("marketAddress", "").lower()
            market_info = MARKET_INFO.get(market_addr, {})
            tx = dec.get("transaction", {})
            ts = self._safe_int(tx.get("timestamp", 0))
            price_precision = self._get_price_precision(market_addr)
            size_after = self._safe_int(dec.get("sizeInUsd", 0)) / GMX_USD_PRECISION

            trades.append({
                "timestamp": ts,
                "tx_hash": tx.get("id", ""),
                "position_key": pos_key,
                "market_address": market_addr,
                "market": market_info.get("index_token", "?"),
                "market_name": market_info.get("name", "Unknown"),
                "side": "Long" if dec.get("isLong", False) else "Short",
                "is_long": dec.get("isLong", False),
                "action": "Close" if size_after < 0.01 else "Decrease",
                "size_delta_usd": self._safe_int(dec.get("sizeDeltaUsd", 0)) / GMX_USD_PRECISION,
                "size_after_usd": size_after,
                "collateral_usd": self._safe_int(dec.get("collateralAmount", 0)) / USDC_PRECISION,
                "execution_price": self._safe_int(dec.get("executionPrice", 0)) / price_precision,
                "pnl_usd": self._safe_int(dec.get("basePnlUsd", 0)) / GMX_USD_PRECISION,
                "fees_usd": 0.0,  # Fees would require additional query
            })

        # Sort by timestamp, newest first
        trades.sort(key=lambda x: x["timestamp"], reverse=True)

        return trades

    async def get_position_history_by_key(
        self,
        position_key: str
    ) -> Optional[dict[str, Any]]:
        """
        Get complete trade history for a specific GMX position.

        This mirrors the Uniswap get_position_history() pattern.

        GMX Data Pipeline (self-contained - no DeBank needed):
        - Structure: GMX Subgraph (positionKey groups trades)
        - Amounts: GMX Subgraph (sizeDeltaUsd, collateralAmount)
        - Prices: GMX Subgraph (executionPrice at trade time)
        - Fees: GMX Subgraph (borrowingFee, fundingFee, positionFee)
        - P&L: GMX Subgraph (basePnlUsd)

        Returns:
            Dict with position info and transactions list
        """
        # Query position increases
        inc_query = """
        {
          positionIncreases(
            where: {positionKey: "%s"}
            orderBy: transaction__timestamp
            orderDirection: asc
            first: 100
          ) {
            id
            positionKey
            marketAddress
            isLong
            sizeInUsd
            sizeDeltaUsd
            collateralAmount
            executionPrice
            transaction {
              id
              timestamp
              blockNumber
            }
          }
        }
        """ % position_key

        # Query position decreases
        dec_query = """
        {
          positionDecreases(
            where: {positionKey: "%s"}
            orderBy: transaction__timestamp
            orderDirection: asc
            first: 100
          ) {
            id
            positionKey
            marketAddress
            isLong
            sizeInUsd
            sizeDeltaUsd
            collateralAmount
            executionPrice
            basePnlUsd
            priceImpactUsd
            transaction {
              id
              timestamp
              blockNumber
            }
          }
        }
        """ % position_key

        # Query trade actions for fee data
        actions_query = """
        {
          tradeActions(
            where: {orderKey: "%s"}
            orderBy: timestamp
            orderDirection: asc
            first: 100
          ) {
            id
            eventName
            borrowingFeeAmount
            fundingFeeAmount
            positionFeeAmount
            pnlUsd
            timestamp
            transaction {
              id
            }
          }
        }
        """ % position_key

        inc_data = await self._query(inc_query)
        dec_data = await self._query(dec_query)
        actions_data = await self._query(actions_query)

        increases = inc_data.get("data", {}).get("positionIncreases", []) if inc_data else []
        decreases = dec_data.get("data", {}).get("positionDecreases", []) if dec_data else []
        actions = actions_data.get("data", {}).get("tradeActions", []) if actions_data else []

        if not increases and not decreases:
            logger.warning(f"Position {position_key} not found")
            return None

        # Get market info from first trade
        first_trade = increases[0] if increases else decreases[0]
        market_addr = first_trade.get("marketAddress", "").lower()
        market_info = MARKET_INFO.get(market_addr, {})
        is_long = first_trade.get("isLong", False)
        price_precision = self._get_price_precision(market_addr)

        # Build fee lookup by tx_hash
        fees_by_tx = {}
        for action in actions:
            tx_id = action.get("transaction", {}).get("id", "").lower()
            if tx_id:
                fees_by_tx[tx_id] = {
                    "borrowing_fee": self._safe_int(action.get("borrowingFeeAmount", 0)) / USDC_PRECISION,
                    "funding_fee": self._safe_int(action.get("fundingFeeAmount", 0)) / USDC_PRECISION,
                    "position_fee": self._safe_int(action.get("positionFeeAmount", 0)) / USDC_PRECISION,
                }

        # Build transactions list
        transactions = []

        # Process increases
        is_first_increase = True
        for inc in increases:
            tx = inc.get("transaction", {})
            tx_hash = tx.get("id", "").lower()
            fees = fees_by_tx.get(tx_hash, {})

            transactions.append({
                "timestamp": self._safe_int(tx.get("timestamp", 0)),
                "block_number": self._safe_int(tx.get("blockNumber", 0)),
                "tx_hash": tx.get("id", ""),
                "action": "Open" if is_first_increase else "Increase",
                "size_delta_usd": self._safe_int(inc.get("sizeDeltaUsd", 0)) / GMX_USD_PRECISION,
                "size_after_usd": self._safe_int(inc.get("sizeInUsd", 0)) / GMX_USD_PRECISION,
                "collateral_usd": self._safe_int(inc.get("collateralAmount", 0)) / USDC_PRECISION,
                "execution_price": self._safe_int(inc.get("executionPrice", 0)) / price_precision,
                "pnl_usd": 0.0,
                "borrowing_fee_usd": fees.get("borrowing_fee", 0),
                "funding_fee_usd": fees.get("funding_fee", 0),
                "position_fee_usd": fees.get("position_fee", 0),
                "total_fees_usd": sum(fees.values()) if fees else 0,
            })
            is_first_increase = False

        # Process decreases
        for dec in decreases:
            tx = dec.get("transaction", {})
            tx_hash = tx.get("id", "").lower()
            fees = fees_by_tx.get(tx_hash, {})
            size_after = self._safe_int(dec.get("sizeInUsd", 0)) / GMX_USD_PRECISION

            transactions.append({
                "timestamp": self._safe_int(tx.get("timestamp", 0)),
                "block_number": self._safe_int(tx.get("blockNumber", 0)),
                "tx_hash": tx.get("id", ""),
                "action": "Close" if size_after < 0.01 else "Decrease",
                "size_delta_usd": self._safe_int(dec.get("sizeDeltaUsd", 0)) / GMX_USD_PRECISION,
                "size_after_usd": size_after,
                "collateral_usd": self._safe_int(dec.get("collateralAmount", 0)) / USDC_PRECISION,
                "execution_price": self._safe_int(dec.get("executionPrice", 0)) / price_precision,
                "pnl_usd": self._safe_int(dec.get("basePnlUsd", 0)) / GMX_USD_PRECISION,
                "price_impact_usd": self._safe_int(dec.get("priceImpactUsd", 0)) / GMX_USD_PRECISION,
                "borrowing_fee_usd": fees.get("borrowing_fee", 0),
                "funding_fee_usd": fees.get("funding_fee", 0),
                "position_fee_usd": fees.get("position_fee", 0),
                "total_fees_usd": sum(fees.values()) if fees else 0,
            })

        # Sort by timestamp
        transactions.sort(key=lambda x: x["timestamp"])

        # Calculate summary
        total_size_opened = sum(tx["size_delta_usd"] for tx in transactions if tx["action"] in ("Open", "Increase"))
        total_size_closed = sum(tx["size_delta_usd"] for tx in transactions if tx["action"] in ("Close", "Decrease"))
        total_pnl = sum(tx["pnl_usd"] for tx in transactions)
        total_fees = sum(tx["total_fees_usd"] for tx in transactions)

        # Current status
        current_size = transactions[-1]["size_after_usd"] if transactions else 0
        status = "ACTIVE" if current_size > 0.01 else "CLOSED"

        return {
            "position_key": position_key,
            "status": status,
            "market": {
                "address": market_addr,
                "name": market_info.get("name", "Unknown"),
                "index_symbol": market_info.get("index_token", "?"),
            },
            "side": "Long" if is_long else "Short",
            "is_long": is_long,
            "current_size_usd": current_size,
            "transactions": transactions,
            "summary": {
                "total_transactions": len(transactions),
                "total_size_opened_usd": total_size_opened,
                "total_size_closed_usd": total_size_closed,
                "total_pnl_usd": total_pnl,
                "total_fees_usd": total_fees,
                "net_pnl_usd": total_pnl - total_fees,
            },
            "data_sources": {
                "structure": "gmx_subgraph",
                "amounts": "gmx_subgraph",
                "prices": "gmx_subgraph",
                "fees": "gmx_subgraph",
            }
        }

    async def get_position_history(
        self,
        wallet_address: str,
        limit: int = 50
    ) -> dict[str, Any]:
        """
        Get position increase/decrease history for a wallet.
        
        Returns the most recent events grouped by position key.
        """
        wallet = wallet_address.lower()
        
        # Query position increases
        inc_query = """
        {
          positionIncreases(
            where: {account: "%s"}
            orderBy: transaction__timestamp
            orderDirection: desc
            first: %d
          ) {
            id
            positionKey
            marketAddress
            collateralTokenAddress
            sizeInUsd
            sizeInTokens
            collateralAmount
            sizeDeltaUsd
            isLong
            basePnlUsd
            transaction {
              timestamp
              hash
            }
          }
        }
        """ % (wallet, limit)
        
        # Query position decreases
        dec_query = """
        {
          positionDecreases(
            where: {account: "%s"}
            orderBy: transaction__timestamp
            orderDirection: desc
            first: %d
          ) {
            id
            positionKey
            marketAddress
            collateralTokenAddress
            sizeInUsd
            sizeInTokens
            collateralAmount
            sizeDeltaUsd
            isLong
            basePnlUsd
            transaction {
              timestamp
              hash
            }
          }
        }
        """ % (wallet, limit)
        
        inc_data = await self._query(inc_query)
        dec_data = await self._query(dec_query)
        
        increases = inc_data.get("data", {}).get("positionIncreases", []) if inc_data else []
        decreases = dec_data.get("data", {}).get("positionDecreases", []) if dec_data else []
        
        return {
            "increases": increases,
            "decreases": decreases
        }
    
    async def get_current_positions(
        self,
        wallet_address: str
    ) -> list[dict[str, Any]]:
        """
        Get current open positions by analyzing position events.
        
        Finds the most recent event for each position key and returns
        positions where sizeInUsd > 0.
        """
        history = await self.get_position_history(wallet_address)
        
        # Combine all events
        all_events = []
        
        for inc in history["increases"]:
            ts = self._safe_int(inc.get("transaction", {}).get("timestamp", 0))
            all_events.append({
                "type": "increase",
                "timestamp": ts,
                "position_key": inc.get("positionKey"),
                "market_address": inc.get("marketAddress"),
                "size_usd": self._safe_int(inc.get("sizeInUsd", 0)) / GMX_USD_PRECISION,
                "size_tokens": self._safe_int(inc.get("sizeInTokens", 0)) / 1e18,
                "collateral": self._safe_int(inc.get("collateralAmount", 0)) / USDC_PRECISION,
                "is_long": inc.get("isLong"),
                "collateral_token": inc.get("collateralTokenAddress"),
            })
        
        for dec in history["decreases"]:
            ts = self._safe_int(dec.get("transaction", {}).get("timestamp", 0))
            all_events.append({
                "type": "decrease",
                "timestamp": ts,
                "position_key": dec.get("positionKey"),
                "market_address": dec.get("marketAddress"),
                "size_usd": self._safe_int(dec.get("sizeInUsd", 0)) / GMX_USD_PRECISION,
                "size_tokens": self._safe_int(dec.get("sizeInTokens", 0)) / 1e18,
                "collateral": self._safe_int(dec.get("collateralAmount", 0)) / USDC_PRECISION,
                "is_long": dec.get("isLong"),
                "collateral_token": dec.get("collateralTokenAddress"),
            })
        
        # Group by position key and find latest event
        positions_by_key = {}
        for event in all_events:
            key = event["position_key"]
            if key not in positions_by_key or event["timestamp"] > positions_by_key[key]["timestamp"]:
                positions_by_key[key] = event
        
        # Filter to open positions (size > 0)
        open_positions = []
        for key, pos in positions_by_key.items():
            if pos["size_usd"] > 0:
                market_name = self._get_market_name(pos["market_address"])
                open_positions.append({
                    "position_key": key,
                    "market_address": pos["market_address"],
                    "market_name": market_name,
                    "side": "Long" if pos["is_long"] else "Short",
                    "size_usd": pos["size_usd"],
                    "size_tokens": pos["size_tokens"],
                    "collateral_usd": pos["collateral"],
                    "last_updated": pos["timestamp"],
                })
        
        return open_positions

    async def get_trade_history(
        self,
        wallet_address: str,
        limit: int = 100
    ) -> list[dict[str, Any]]:
        """
        Get trade action history with P&L for each trade.
        """
        wallet = wallet_address.lower()
        
        query = """
        {
          tradeActions(
            where: {account: "%s"}
            orderBy: timestamp
            orderDirection: desc
            first: %d
          ) {
            id
            eventName
            marketAddress
            sizeDeltaUsd
            executionPrice
            pnlUsd
            basePnlUsd
            fundingFeeAmount
            borrowingFeeAmount
            positionFeeAmount
            isLong
            timestamp
            transaction {
              hash
            }
          }
        }
        """ % (wallet, limit)
        
        data = await self._query(query)
        if not data:
            return []
        
        trades = data.get("data", {}).get("tradeActions", [])
        
        results = []
        for t in trades:
            ts = self._safe_int(t.get("timestamp", 0))
            market_addr = t.get("marketAddress", "")
            price_precision = self._get_price_precision(market_addr)
            results.append({
                "event": t.get("eventName"),
                "market_address": market_addr,
                "market_name": self._get_market_name(market_addr),
                "side": "Long" if t.get("isLong") else "Short",
                "size_delta_usd": self._safe_int(t.get("sizeDeltaUsd", 0)) / GMX_USD_PRECISION,
                "execution_price": self._safe_int(t.get("executionPrice", 0)) / price_precision,
                "pnl_usd": self._safe_int(t.get("pnlUsd", 0)) / GMX_USD_PRECISION,
                "funding_fee": self._safe_int(t.get("fundingFeeAmount", 0)) / GMX_USD_PRECISION,
                "borrowing_fee": self._safe_int(t.get("borrowingFeeAmount", 0)) / GMX_USD_PRECISION,
                "position_fee": self._safe_int(t.get("positionFeeAmount", 0)) / GMX_USD_PRECISION,
                "timestamp": ts,
                "date": datetime.fromtimestamp(ts).isoformat() if ts else None,
                "tx_hash": t.get("transaction", {}).get("hash"),
            })
        
        return results
    
    async def get_realized_pnl(
        self,
        wallet_address: str,
        since_timestamp: Optional[int] = None
    ) -> dict[str, Any]:
        """
        Calculate total realized P&L from trade history.
        
        Args:
            wallet_address: Wallet to query
            since_timestamp: Only include trades after this timestamp
        """
        trades = await self.get_trade_history(wallet_address, limit=500)
        
        total_pnl = 0.0
        total_fees = 0.0
        trade_count = 0
        
        for trade in trades:
            # Skip if before timestamp filter
            if since_timestamp and trade["timestamp"] < since_timestamp:
                continue
            
            # Only count executed orders with P&L
            if trade["event"] == "OrderExecuted" and trade["pnl_usd"] != 0:
                total_pnl += trade["pnl_usd"]
                trade_count += 1
            
            # Sum up fees
            total_fees += trade["funding_fee"] + trade["borrowing_fee"] + trade["position_fee"]
        
        return {
            "total_realized_pnl": total_pnl,
            "total_fees_paid": total_fees,
            "net_pnl": total_pnl - total_fees,
            "trade_count": trade_count,
            "since_timestamp": since_timestamp,
        }
    
    async def get_position_entry_data(
        self,
        wallet_address: str,
        position_key: str
    ) -> Optional[dict[str, Any]]:
        """
        Get entry data for a specific position.
        
        Calculates average entry price from position events,
        only considering events since the position was last opened from zero.
        """
        wallet = wallet_address.lower()
        
        # Query both increases and decreases to find when position was last at 0
        inc_query = """
        {
          positionIncreases(
            where: {account: "%s", positionKey: "%s"}
            orderBy: transaction__timestamp
            orderDirection: asc
            first: 100
          ) {
            sizeInUsd
            sizeDeltaUsd
            sizeDeltaInTokens
            collateralDeltaAmount
            transaction {
              timestamp
            }
          }
        }
        """ % (wallet, position_key)
        
        dec_query = """
        {
          positionDecreases(
            where: {account: "%s", positionKey: "%s"}
            orderBy: transaction__timestamp
            orderDirection: asc
            first: 100
          ) {
            sizeInUsd
            sizeDeltaUsd
            transaction {
              timestamp
            }
          }
        }
        """ % (wallet, position_key)
        
        inc_data = await self._query(inc_query)
        dec_data = await self._query(dec_query)
        
        if not inc_data:
            return None
        
        increases = inc_data.get("data", {}).get("positionIncreases", [])
        decreases = dec_data.get("data", {}).get("positionDecreases", []) if dec_data else []
        
        if not increases:
            return None
        
        # Combine and sort all events by timestamp
        all_events = []
        for inc in increases:
            ts = self._safe_int(inc.get("transaction", {}).get("timestamp", 0))
            all_events.append({
                "type": "increase",
                "timestamp": ts,
                "size_after": self._safe_int(inc.get("sizeInUsd", 0)) / GMX_USD_PRECISION,
                "size_delta_usd": self._safe_int(inc.get("sizeDeltaUsd", 0)) / GMX_USD_PRECISION,
                "size_delta_tokens": self._safe_int(inc.get("sizeDeltaInTokens", 0)) / 1e18,
                "collateral_delta": self._safe_int(inc.get("collateralDeltaAmount", 0)) / USDC_PRECISION,
            })
        
        for dec in decreases:
            ts = self._safe_int(dec.get("transaction", {}).get("timestamp", 0))
            all_events.append({
                "type": "decrease",
                "timestamp": ts,
                "size_after": self._safe_int(dec.get("sizeInUsd", 0)) / GMX_USD_PRECISION,
            })
        
        # Sort by timestamp
        all_events.sort(key=lambda x: x["timestamp"])
        
        # Find the last time position was closed (size_after == 0 on decrease)
        last_close_idx = -1
        for i, event in enumerate(all_events):
            if event["type"] == "decrease" and event["size_after"] == 0:
                last_close_idx = i
        
        # Calculate entry price from increases after last close
        total_size_usd = 0.0
        total_size_tokens = 0.0
        total_collateral = 0.0
        first_timestamp = None
        increase_count = 0
        
        for i, event in enumerate(all_events):
            # Skip events before position was last reopened
            if i <= last_close_idx:
                continue
            
            if event["type"] == "increase":
                total_size_usd += event["size_delta_usd"]
                total_size_tokens += event["size_delta_tokens"]
                total_collateral += event["collateral_delta"]
                increase_count += 1
                
                if first_timestamp is None:
                    first_timestamp = event["timestamp"]
        
        # Average entry price = total USD / total tokens
        avg_entry_price = total_size_usd / total_size_tokens if total_size_tokens > 0 else 0
        
        return {
            "position_key": position_key,
            "average_entry_price": avg_entry_price,
            "total_size_usd": total_size_usd,
            "total_size_tokens": total_size_tokens,
            "total_collateral_deposited": total_collateral,
            "first_open_timestamp": first_timestamp,
            "increase_count": increase_count,
        }

    async def get_enriched_positions(
        self,
        wallet_address: str
    ) -> list[dict[str, Any]]:
        """
        Get current positions enriched with entry price and historical data.
        
        Combines position state with entry calculations.
        """
        positions = await self.get_current_positions(wallet_address)
        
        enriched = []
        for pos in positions:
            entry_data = await self.get_position_entry_data(
                wallet_address, 
                pos["position_key"]
            )
            
            enriched.append({
                **pos,
                "entry_price": entry_data["average_entry_price"] if entry_data else 0,
                "total_collateral_deposited": entry_data["total_collateral_deposited"] if entry_data else 0,
                "first_open_timestamp": entry_data["first_open_timestamp"] if entry_data else 0,
                "increase_count": entry_data["increase_count"] if entry_data else 0,
            })
        
        return enriched
    
    async def get_market_info(self, market_addresses: list[str]) -> dict[str, dict]:
        """
        Get market metadata for given market addresses.
        """
        if not market_addresses:
            return {}
        
        addresses_str = str(market_addresses).replace("'", '"')
        
        query = """
        {
          marketInfos(where: {id_in: %s}) {
            id
            marketToken
            indexToken
            longToken
            shortToken
          }
        }
        """ % addresses_str
        
        data = await self._query(query)
        if not data:
            return {}
        
        markets = data.get("data", {}).get("marketInfos", [])
        
        result = {}
        for m in markets:
            index_token = m.get("indexToken", "").lower()
            result[m["id"].lower()] = {
                "market_token": m.get("marketToken"),
                "index_token": index_token,
                "index_symbol": self._get_token_symbol(index_token),
                "long_token": m.get("longToken"),
                "short_token": m.get("shortToken"),
            }
        
        return result

    async def get_token_prices(self, token_addresses: list[str]) -> dict[str, float]:
        """
        Get current token prices from GMX subgraph.
        
        GMX stores prices with (30 - tokenDecimals) precision.
        """
        if not token_addresses:
            return {}
        
        # Build query for each token
        query_parts = []
        for i, addr in enumerate(token_addresses):
            query_parts.append(f't{i}: tokenPrice(id: "{addr.lower()}") {{ minPrice maxPrice }}')
        
        query = "{ " + " ".join(query_parts) + " }"
        
        data = await self._query(query)
        if not data or "data" not in data:
            return {}
        
        prices = {}
        for i, addr in enumerate(token_addresses):
            token_data = data["data"].get(f"t{i}")
            if token_data:
                raw_price = self._safe_int(token_data.get("minPrice", 0))
                
                # Get token decimals to calculate price precision
                token_info = TOKEN_INFO.get(addr.lower(), {})
                token_decimals = token_info.get("decimals", 18)
                
                # Price precision = 30 - tokenDecimals
                price_decimals = 30 - token_decimals
                prices[addr.lower()] = raw_price / (10 ** price_decimals)
        
        return prices

    async def get_full_positions(self, wallet_address: str) -> list[dict[str, Any]]:
        """
        Get complete position data from GMX subgraph with all calculated fields.
        
        Returns positions in the format expected by the frontend, matching
        the structure previously provided by DeBank.
        """
        # Get enriched positions (with entry price)
        positions = await self.get_enriched_positions(wallet_address)
        
        if not positions:
            return []
        
        # Collect all token addresses we need prices for
        token_addresses = set()
        for pos in positions:
            market_addr = pos.get("market_address", "").lower()
            market_info = MARKET_INFO.get(market_addr, {})
            index_token = market_info.get("index_token", "")
            
            # Map index token name to address
            for addr, info in TOKEN_INFO.items():
                if info["symbol"] == index_token:
                    token_addresses.add(addr)
                    break
        
        # Add USDC for collateral pricing
        token_addresses.add("0xaf88d065e77c8cc2239327c5edb3a432268e5831")
        
        # Get current prices
        prices = await self.get_token_prices(list(token_addresses))
        usdc_price = prices.get("0xaf88d065e77c8cc2239327c5edb3a432268e5831", 1.0)
        
        full_positions = []
        for pos in positions:
            market_addr = pos.get("market_address", "").lower()
            market_info = MARKET_INFO.get(market_addr, {})
            index_token_symbol = market_info.get("index_token", "")
            
            # Get index token address and price
            index_token_addr = None
            for addr, info in TOKEN_INFO.items():
                if info["symbol"] == index_token_symbol:
                    index_token_addr = addr
                    break
            
            mark_price = prices.get(index_token_addr, 0) if index_token_addr else 0
            entry_price = pos.get("entry_price", 0)
            size_usd = pos.get("size_usd", 0)
            size_tokens = pos.get("size_tokens", 0)
            collateral_usd = pos.get("collateral_usd", 0)
            is_short = pos.get("side") == "Short"
            
            # Calculate PnL
            if entry_price > 0 and mark_price > 0 and size_tokens > 0:
                if is_short:
                    # Short: profit when price goes down
                    pnl_usd = (entry_price - mark_price) * size_tokens
                else:
                    # Long: profit when price goes up
                    pnl_usd = (mark_price - entry_price) * size_tokens
            else:
                pnl_usd = 0
            
            # Calculate leverage
            leverage = size_usd / collateral_usd if collateral_usd > 0 else 0
            
            # Calculate liquidation price
            # For shorts: liq_price = entry_price * (1 + 1/leverage * 0.95)
            # For longs: liq_price = entry_price * (1 - 1/leverage * 0.95)
            # The 0.95 accounts for ~5% buffer before liquidation
            if leverage > 0 and entry_price > 0:
                if is_short:
                    liq_price = entry_price * (1 + (1 / leverage) * 0.95)
                else:
                    liq_price = entry_price * (1 - (1 / leverage) * 0.95)
            else:
                liq_price = 0
            
            # Net value = collateral + PnL
            net_value_usd = collateral_usd + pnl_usd
            
            full_positions.append({
                "type": "perpetual",
                "protocol": "GMX V2",
                "position_name": f"{pos['side']} {index_token_symbol}",
                "chain": "arb",
                "side": pos["side"],
                "base_token": {
                    "symbol": index_token_symbol,
                    "address": index_token_addr,
                    "price": mark_price
                },
                "margin_token": {
                    "symbol": "USDC",
                    "address": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
                    "amount": collateral_usd,  # USDC amount = USD value
                    "price": usdc_price,
                    "value_usd": collateral_usd * usdc_price
                },
                "position_size": size_tokens,
                "position_value_usd": size_usd,
                "entry_price": entry_price,
                "mark_price": mark_price,
                "liquidation_price": liq_price,
                "leverage": leverage,
                "pnl_usd": pnl_usd,
                "net_value_usd": net_value_usd,
                "position_index": pos.get("position_key", ""),
                "initial_margin_usd": pos.get("total_collateral_deposited", collateral_usd),
                "first_open_timestamp": pos.get("first_open_timestamp", 0),
                "data_source": "gmx_subgraph"
            })
        
        return full_positions
