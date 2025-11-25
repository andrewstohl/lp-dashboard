"""
GMX V2 Synthetics Service

Data Sources (following standardized architecture):
- Position Discovery: DeBank (find what positions exist)
- Position Details: GMX Subsquid (real-time, on-chain source of truth)
- Current Prices: GMX Oracle API (Chainlink Data Streams)
- Historical Prices: GMX Subsquid (at specific blocks)

This service provides:
- Real-time position data from the GMX Subsquid
- Current prices from GMX's Chainlink oracle
- Entry price calculation from position history
- PnL tracking
"""

import httpx
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class GMXService:
    """GMX V2 Synthetics data service"""
    
    # GMX Subsquid endpoint (real-time position data)
    SUBSQUID_URL = "https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql"
    
    # GMX Oracle API (Chainlink Data Streams prices)
    ORACLE_URL = "https://arbitrum-api.gmxinfra.io"
    
    # Known token addresses on Arbitrum
    TOKENS = {
        "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": {"symbol": "WETH", "decimals": 18},
        "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4": {"symbol": "LINK", "decimals": 18},
        "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": {"symbol": "USDC", "decimals": 6},
        "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f": {"symbol": "WBTC", "decimals": 8},
        "0x912CE59144191C1204E64559FE8253a0e49E6548": {"symbol": "ARB", "decimals": 18},
    }
    
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._prices_cache: Dict[str, Any] = {}
        self._prices_cache_time: Optional[datetime] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30)
        return self._client
    
    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _query_subsquid(self, query: str) -> Optional[Dict]:
        """Execute a GraphQL query against GMX Subsquid"""
        client = await self._get_client()
        try:
            resp = await client.post(self.SUBSQUID_URL, json={"query": query})
            data = resp.json()
            if "errors" in data:
                logger.error(f"GMX Subsquid error: {data['errors']}")
                return None
            return data
        except Exception as e:
            logger.error(f"GMX Subsquid query failed: {e}")
            return None
    
    async def get_current_prices(self, force_refresh: bool = False) -> Dict[str, Dict]:
        """
        Get current token prices from GMX Oracle API (Chainlink Data Streams)
        
        Returns dict mapping token address (lowercase) to price data:
        {
            "0x...": {
                "symbol": "WETH",
                "price": 2930.50,  # USD
                "minPrice": 2930.00,
                "maxPrice": 2931.00
            }
        }
        """
        # Check cache (prices update every few seconds, cache for 5s)
        now = datetime.now()
        if (not force_refresh and 
            self._prices_cache and 
            self._prices_cache_time and 
            (now - self._prices_cache_time).seconds < 5):
            return self._prices_cache
        
        client = await self._get_client()
        try:
            resp = await client.get(f"{self.ORACLE_URL}/prices/tickers")
            prices_list = resp.json()
            
            prices = {}
            for p in prices_list:
                addr = p["tokenAddress"].lower()
                min_price = int(p.get("minPrice", 0)) / 1e12  # GMX uses 1e12 precision
                max_price = int(p.get("maxPrice", 0)) / 1e12
                avg_price = (min_price + max_price) / 2
                
                prices[addr] = {
                    "symbol": p.get("tokenSymbol", "UNKNOWN"),
                    "price": avg_price,
                    "minPrice": min_price,
                    "maxPrice": max_price
                }
            
            self._prices_cache = prices
            self._prices_cache_time = now
            return prices
            
        except Exception as e:
            logger.error(f"Failed to get GMX prices: {e}")
            return self._prices_cache or {}

    async def get_markets(self, market_ids: List[str] = None) -> Dict[str, Dict]:
        """
        Get market information from GMX Subsquid
        
        Returns dict mapping market address to market data:
        {
            "0x...": {
                "indexToken": "0x...",  # Token being traded
                "longToken": "0x...",   # Token for long collateral
                "shortToken": "0x..."   # Token for short collateral (usually USDC)
            }
        }
        """
        if market_ids:
            where_clause = f'where: {{id_in: {str(market_ids).replace("'", '"')}}}'
        else:
            where_clause = ""
        
        query = f"""
        {{
          markets({where_clause}, limit: 100) {{
            id
            indexToken
            longToken
            shortToken
          }}
        }}
        """
        
        data = await self._query_subsquid(query)
        if not data:
            return {}
        
        markets = {}
        for m in data.get("data", {}).get("markets", []):
            markets[m["id"]] = {
                "indexToken": m["indexToken"],
                "longToken": m["longToken"],
                "shortToken": m["shortToken"]
            }
        
        return markets

    async def get_open_positions(self, account: str) -> List[Dict[str, Any]]:
        """
        Get all open positions for an account from GMX Subsquid
        
        Args:
            account: Wallet address (any case, will be normalized)
            
        Returns:
            List of position dicts with full details including prices
        """
        # GMX Subsquid uses checksum addresses
        # Query with case-insensitive search
        query = f"""
        {{
          positions(
            where: {{account_containsInsensitive: "{account[2:]}", isSnapshot_eq: false}}
            limit: 50
          ) {{
            id
            positionKey
            account
            market
            collateralToken
            isLong
            sizeInUsd
            sizeInTokens
            collateralAmount
            entryPrice
            leverage
            unrealizedPnl
            realizedPnl
            realizedFees
            unrealizedFees
            maxSize
            openedAt
          }}
        }}
        """
        
        data = await self._query_subsquid(query)
        if not data:
            return []
        
        raw_positions = data.get("data", {}).get("positions", [])
        
        # Filter for positions with actual size
        positions = [p for p in raw_positions if int(p.get("sizeInUsd", 0)) > 0]
        
        if not positions:
            return []
        
        # Get market info for all positions
        market_ids = list(set([p["market"] for p in positions]))
        markets = await self.get_markets(market_ids)
        
        # Get current prices
        prices = await self.get_current_prices()
        
        # Get entry prices from position history
        entry_prices = await self._calculate_entry_prices(account, positions)
        
        # Enrich positions with calculated fields
        enriched = []
        for pos in positions:
            enriched_pos = await self._enrich_position(pos, markets, prices, entry_prices)
            if enriched_pos:
                enriched.append(enriched_pos)
        
        return enriched

    async def _calculate_entry_prices(
        self, 
        account: str, 
        positions: List[Dict]
    ) -> Dict[str, float]:
        """
        Calculate entry prices from position history
        
        For each open position, we calculate the weighted average entry price
        from all increases since the position was opened.
        
        Returns dict mapping (market, isLong) to entry price
        """
        entry_prices = {}
        
        # For each position, get its opening timestamp and increases since then
        for pos in positions:
            market = pos["market"]
            is_long = pos["isLong"]
            opened_at = int(pos.get("openedAt", 0))
            
            key = f"{market}_{is_long}"
            
            # Query increases since position opened
            query = f"""
            {{
              positionChanges(
                where: {{
                  account_containsInsensitive: "{account[2:]}",
                  market_eq: "{market}",
                  isLong_eq: {str(is_long).lower()},
                  type_eq: increase,
                  timestamp_gte: {opened_at}
                }}
                orderBy: timestamp_ASC
              ) {{
                sizeDeltaUsd
                sizeDeltaInTokens
                executionPrice
                timestamp
              }}
            }}
            """
            
            data = await self._query_subsquid(query)
            if not data:
                continue
            
            changes = data.get("data", {}).get("positionChanges", [])
            
            # Calculate weighted average entry
            total_cost = 0.0
            total_tokens = 0.0
            
            for c in changes:
                delta_usd = int(c["sizeDeltaUsd"]) / 1e30
                delta_tokens = int(c["sizeDeltaInTokens"]) / 1e18
                
                if delta_tokens > 0:
                    total_cost += delta_usd
                    total_tokens += delta_tokens
            
            if total_tokens > 0:
                entry_prices[key] = total_cost / total_tokens
            else:
                # Fallback: calculate from current position
                size_usd = int(pos["sizeInUsd"]) / 1e30
                size_tokens = int(pos["sizeInTokens"]) / 1e18
                if size_tokens > 0:
                    entry_prices[key] = size_usd / size_tokens
        
        return entry_prices
