"""
GMX V2 Synthetics Subgraph Service

Queries the GMX synthetics-stats subgraph for:
- Position history (increases/decreases)
- Trade actions with realized P&L
- Market metadata

Used to supplement DeBank data with accurate historical values.
"""

import httpx
from typing import Dict, List, Any, Optional
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

# Known market addresses
MARKET_INFO = {
    "0x70d95587d40a2caf56bd97485ab3eec10bee6336": {"name": "ETH/USD", "index_token": "WETH"},
    "0x7f1fa204bb700853d36994da19f830b6ad18455c": {"name": "LINK/USD", "index_token": "LINK"},
    "0x47c031236e19d024b42f8ae6780e44a573170703": {"name": "BTC/USD", "index_token": "WBTC"},
}


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
    
    async def _query(self, query: str) -> Optional[Dict]:
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

    async def get_position_history(
        self,
        wallet_address: str,
        limit: int = 50
    ) -> Dict[str, Any]:
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
    ) -> List[Dict[str, Any]]:
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
                "size_usd": self._safe_int(inc.get("sizeInUsd", 0)) / 1e30,
                "size_tokens": self._safe_int(inc.get("sizeInTokens", 0)) / 1e18,
                "collateral": self._safe_int(inc.get("collateralAmount", 0)) / 1e6,
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
                "size_usd": self._safe_int(dec.get("sizeInUsd", 0)) / 1e30,
                "size_tokens": self._safe_int(dec.get("sizeInTokens", 0)) / 1e18,
                "collateral": self._safe_int(dec.get("collateralAmount", 0)) / 1e6,
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
    ) -> List[Dict[str, Any]]:
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
            results.append({
                "event": t.get("eventName"),
                "market_address": t.get("marketAddress"),
                "market_name": self._get_market_name(t.get("marketAddress", "")),
                "side": "Long" if t.get("isLong") else "Short",
                "size_delta_usd": self._safe_int(t.get("sizeDeltaUsd", 0)) / 1e30,
                "execution_price": self._safe_int(t.get("executionPrice", 0)) / 1e30,
                "pnl_usd": self._safe_int(t.get("pnlUsd", 0)) / 1e30,
                "funding_fee": self._safe_int(t.get("fundingFeeAmount", 0)) / 1e30,
                "borrowing_fee": self._safe_int(t.get("borrowingFeeAmount", 0)) / 1e30,
                "position_fee": self._safe_int(t.get("positionFeeAmount", 0)) / 1e30,
                "timestamp": ts,
                "date": datetime.fromtimestamp(ts).isoformat() if ts else None,
                "tx_hash": t.get("transaction", {}).get("hash"),
            })
        
        return results
    
    async def get_realized_pnl(
        self,
        wallet_address: str,
        since_timestamp: Optional[int] = None
    ) -> Dict[str, Any]:
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
    ) -> Optional[Dict[str, Any]]:
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
                "size_after": self._safe_int(inc.get("sizeInUsd", 0)) / 1e30,
                "size_delta_usd": self._safe_int(inc.get("sizeDeltaUsd", 0)) / 1e30,
                "size_delta_tokens": self._safe_int(inc.get("sizeDeltaInTokens", 0)) / 1e18,
                "collateral_delta": self._safe_int(inc.get("collateralDeltaAmount", 0)) / 1e6,
            })
        
        for dec in decreases:
            ts = self._safe_int(dec.get("transaction", {}).get("timestamp", 0))
            all_events.append({
                "type": "decrease",
                "timestamp": ts,
                "size_after": self._safe_int(dec.get("sizeInUsd", 0)) / 1e30,
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
    ) -> List[Dict[str, Any]]:
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
    
    async def get_market_info(self, market_addresses: List[str]) -> Dict[str, Dict]:
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


# Convenience function for quick testing
async def test_gmx_subgraph():
    """Test the GMX subgraph service."""
    service = GMXSubgraphService()
    
    wallet = "0x23b50a703d3076b73584df48251931ebf5937ba2"
    
    print("=== Current Positions ===")
    positions = await service.get_current_positions(wallet)
    for p in positions:
        print(f"{p['market_name']} {p['side']}: ${p['size_usd']:,.2f}")
    
    print("\n=== Enriched Positions ===")
    enriched = await service.get_enriched_positions(wallet)
    for p in enriched:
        print(f"{p['market_name']} {p['side']}")
        print(f"  Size: ${p['size_usd']:,.2f}")
        print(f"  Entry Price: ${p['entry_price']:,.2f}")
        print(f"  Collateral Deposited: ${p['total_collateral_deposited']:,.2f}")
    
    print("\n=== Realized P&L ===")
    pnl = await service.get_realized_pnl(wallet)
    print(f"Total Realized P&L: ${pnl['total_realized_pnl']:,.2f}")
    print(f"Total Fees: ${pnl['total_fees_paid']:,.2f}")
    print(f"Net P&L: ${pnl['net_pnl']:,.2f}")
    
    await service.close()


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_gmx_subgraph())
