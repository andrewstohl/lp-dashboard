"""
GMX V2 Subgraph Service

Data source for perpetual position data following the standardized architecture:
- Position discovery: DeBank (find what positions exist)
- Position details: GMX V2 Subgraph (real-time, on-chain source of truth)
- Prices: GMX Oracle API (Chainlink-based, real-time)

Price format: raw_price / 10^(30 - token_decimals)
Position values in subgraph use 30 decimal precision.
"""

import httpx
from typing import Dict, List, Optional, Any
import logging

logger = logging.getLogger(__name__)


# GMX V2 Market addresses on Arbitrum
GMX_MARKETS = {
    "0x70d95587d40a2caf56bd97485ab3eec10bee6336": {"name": "ETH/USD", "index_token": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"},
    "0x7f1fa204bb700853d36994da19f830b6ad18455c": {"name": "LINK/USD", "index_token": "0xf97f4df75117a78c1a5a0dbb814af92458539fb4"},
    "0x47c031236e19d024b42f8ae6780e44a573170703": {"name": "BTC/USD", "index_token": "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f"},
    "0x450bb6774dd8a756274e0ab4107953259d2ac541": {"name": "BTC/USD", "index_token": "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f"},
    "0x09400d9db990d5ed3f35d7be61dfaeb900af03c9": {"name": "SOL/USD", "index_token": "0x2bcc6d6cdbbdc0a4071e48bb3b969b06b3330c07"},
    "0x2d340912aa47e33c90efb078e69e70efe2b34b9b": {"name": "DOGE/USD", "index_token": "0xc4da4c24fd591125c3f47b340b6f4f76111883d8"},
    "0x9f159014cc218e942e9e9481742fe5bfa9ac5a2c": {"name": "UNI/USD", "index_token": "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0"},
}

# Token decimals for price conversion
TOKEN_DECIMALS = {
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": 18,  # WETH
    "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": 18,  # LINK
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": 8,   # WBTC
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 6,   # USDC
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": 6,   # USDC.e
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": 6,   # USDT
    "0x2bcc6d6cdbbdc0a4071e48bb3b969b06b3330c07": 9,   # SOL
    "0xc4da4c24fd591125c3f47b340b6f4f76111883d8": 8,   # DOGE
    "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0": 18,  # UNI
}

TOKEN_SYMBOLS = {
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
    "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": "LINK",
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "WBTC",
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": "USDC.e",
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "USDT",
}


class GMXService:
    """Service for querying GMX V2 position data from subgraph and oracle."""
    
    def __init__(self):
        self.subgraph_url = "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api"
        self.oracle_url = "https://arbitrum-api.gmxinfra.io/prices/tickers"
        self._client: Optional[httpx.AsyncClient] = None
        self._price_cache: Dict[str, Dict] = {}
    
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30)
        return self._client
    
    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _query_subgraph(self, query: str) -> Optional[Dict]:
        """Execute a GraphQL query against the GMX subgraph."""
        client = await self._get_client()
        try:
            response = await client.post(self.subgraph_url, json={"query": query})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"GMX subgraph query error: {e}")
            return None
    
    async def get_oracle_prices(self) -> Dict[str, Dict]:
        """
        Get current token prices from GMX Oracle API.
        
        Returns dict of token_address -> {min_price, max_price, mid_price}
        Prices are in USD with proper decimal adjustment.
        """
        client = await self._get_client()
        try:
            response = await client.get(self.oracle_url)
            response.raise_for_status()
            data = response.json()
            
            prices = {}
            for item in data:
                addr = item["tokenAddress"].lower()
                decimals = TOKEN_DECIMALS.get(addr, 18)
                divisor = 10 ** (30 - decimals)
                
                raw_min = int(item["minPrice"])
                raw_max = int(item["maxPrice"])
                
                prices[addr] = {
                    "min_price": raw_min / divisor,
                    "max_price": raw_max / divisor,
                    "mid_price": (raw_min + raw_max) / (2 * divisor),
                    "symbol": item.get("tokenSymbol", ""),
                    "decimals": decimals
                }
            
            self._price_cache = prices
            return prices
            
        except Exception as e:
            logger.error(f"GMX oracle price fetch error: {e}")
            return self._price_cache  # Return cached if available
    
    def _convert_price(self, raw_price: int, token_decimals: int = 18) -> float:
        """
        Convert GMX raw execution price to USD.
        
        GMX execution prices use 12 decimal precision for USD per token.
        This is different from oracle prices which use 30 - token_decimals.
        """
        if raw_price == 0:
            return 0.0
        # Execution prices are stored with 12 decimal precision
        return raw_price / 1e12
    
    def _convert_size_usd(self, raw_size: int) -> float:
        """Convert GMX raw size in USD (30 decimals) to float."""
        return raw_size / 1e30
    
    def _convert_token_amount(self, raw_amount: int, decimals: int) -> float:
        """Convert raw token amount to float."""
        return raw_amount / (10 ** decimals)

    async def get_position_current_state(
        self,
        account: str,
        market_address: str,
        collateral_token: str,
        is_long: bool
    ) -> Optional[Dict[str, Any]]:
        """
        Get the current state of a specific position.
        
        The sizeInUsd field in the latest positionIncrease/positionDecrease
        represents the CURRENT position size after that transaction.
        
        Args:
            account: Wallet address
            market_address: GMX market address
            collateral_token: Collateral token address  
            is_long: True for long, False for short
        
        Returns:
            Position data dict or None if not found
        """
        is_long_str = "true" if is_long else "false"
        
        query = """
        {
          increases: positionIncreases(
            where: {
              account: "%s"
              marketAddress: "%s"
              collateralTokenAddress: "%s"
              isLong: %s
            }
            orderBy: transaction__timestamp
            orderDirection: desc
            first: 1
          ) {
            positionKey
            sizeInUsd
            sizeInTokens
            collateralAmount
            executionPrice
            borrowingFactor
            transaction { timestamp hash blockNumber }
          }
          decreases: positionDecreases(
            where: {
              account: "%s"
              marketAddress: "%s"
              collateralTokenAddress: "%s"
              isLong: %s
            }
            orderBy: transaction__timestamp
            orderDirection: desc
            first: 1
          ) {
            positionKey
            sizeInUsd
            sizeInTokens
            collateralAmount
            basePnlUsd
            transaction { timestamp hash blockNumber }
          }
        }
        """ % (
            account.lower(), market_address.lower(), collateral_token.lower(), is_long_str,
            account.lower(), market_address.lower(), collateral_token.lower(), is_long_str
        )
        
        data = await self._query_subgraph(query)
        if not data or "data" not in data:
            return None
        
        increases = data["data"].get("increases", [])
        decreases = data["data"].get("decreases", [])
        
        if not increases and not decreases:
            return None
        
        # Get the most recent transaction (increase or decrease)
        inc = increases[0] if increases else {}
        dec = decreases[0] if decreases else {}
        
        inc_ts = int(inc.get("transaction", {}).get("timestamp", 0) or 0)
        dec_ts = int(dec.get("transaction", {}).get("timestamp", 0) or 0)
        
        latest = inc if inc_ts > dec_ts else dec
        
        # Get market info
        market_info = GMX_MARKETS.get(market_address.lower(), {})
        market_name = market_info.get("name", market_address[:10])
        index_token = market_info.get("index_token", "")
        
        # Get token decimals
        collateral_decimals = TOKEN_DECIMALS.get(collateral_token.lower(), 6)
        index_decimals = TOKEN_DECIMALS.get(index_token.lower(), 18)
        
        # Convert values
        size_usd = self._convert_size_usd(int(latest.get("sizeInUsd", 0)))
        size_tokens = self._convert_token_amount(
            int(latest.get("sizeInTokens", 0)), 
            index_decimals
        )
        collateral = self._convert_token_amount(
            int(latest.get("collateralAmount", 0)),
            collateral_decimals
        )
        
        return {
            "position_key": latest.get("positionKey", ""),
            "market_address": market_address.lower(),
            "market_name": market_name,
            "collateral_token": collateral_token.lower(),
            "collateral_symbol": TOKEN_SYMBOLS.get(collateral_token.lower(), ""),
            "index_token": index_token,
            "is_long": is_long,
            "size_usd": size_usd,
            "size_tokens": size_tokens,
            "collateral_amount": collateral,
            "last_update_timestamp": max(inc_ts, dec_ts),
            "last_update_block": int(latest.get("transaction", {}).get("blockNumber", 0))
        }

    async def get_position_entry_history(
        self,
        account: str,
        market_address: str,
        collateral_token: str,
        is_long: bool
    ) -> List[Dict]:
        """
        Get position increases (entries) for the CURRENT position only.
        
        Important: Only includes entries since the last time the position
        was at zero size, to correctly calculate the current position's
        weighted average entry price.
        
        Returns list of entries with size, price, and timestamp.
        """
        is_long_str = "true" if is_long else "false"
        
        # Get both increases and decreases to find position open/close points
        query = """
        {
          increases: positionIncreases(
            where: {
              account: "%s"
              marketAddress: "%s"
              collateralTokenAddress: "%s"
              isLong: %s
            }
            orderBy: transaction__timestamp
            orderDirection: asc
            first: 200
          ) {
            sizeDeltaUsd
            sizeInUsd
            sizeDeltaInTokens
            executionPrice
            collateralDeltaAmount
            transaction { timestamp blockNumber }
          }
          decreases: positionDecreases(
            where: {
              account: "%s"
              marketAddress: "%s"
              collateralTokenAddress: "%s"
              isLong: %s
            }
            orderBy: transaction__timestamp
            orderDirection: asc
            first: 200
          ) {
            sizeDeltaUsd
            sizeInUsd
            transaction { timestamp blockNumber }
          }
        }
        """ % (
            account.lower(), market_address.lower(), collateral_token.lower(), is_long_str,
            account.lower(), market_address.lower(), collateral_token.lower(), is_long_str
        )
        
        data = await self._query_subgraph(query)
        if not data or "data" not in data:
            return []
        
        increases = data["data"].get("increases", [])
        decreases = data["data"].get("decreases", [])
        
        # Find the last time position was closed (sizeInUsd went to 0)
        last_close_timestamp = 0
        for dec in decreases:
            size_after = int(dec.get("sizeInUsd", 0))
            if size_after == 0:
                ts = int(dec.get("transaction", {}).get("timestamp", 0))
                if ts > last_close_timestamp:
                    last_close_timestamp = ts
        
        # Get market and token info for conversions
        market_info = GMX_MARKETS.get(market_address.lower(), {})
        index_token = market_info.get("index_token", "")
        index_decimals = TOKEN_DECIMALS.get(index_token.lower(), 18)
        collateral_decimals = TOKEN_DECIMALS.get(collateral_token.lower(), 6)
        
        # Only include entries AFTER the last close
        entries = []
        for inc in increases:
            inc_timestamp = int(inc.get("transaction", {}).get("timestamp", 0))
            
            # Skip entries from before the current position opened
            if inc_timestamp <= last_close_timestamp:
                continue
            
            size_delta_usd = self._convert_size_usd(int(inc.get("sizeDeltaUsd", 0)))
            
            # Skip zero-size entries (collateral adjustments only)
            if size_delta_usd == 0:
                continue
                
            size_delta_tokens = self._convert_token_amount(
                int(inc.get("sizeDeltaInTokens", 0)),
                index_decimals
            )
            exec_price = self._convert_price(int(inc.get("executionPrice", 0)))
            collateral_delta = self._convert_token_amount(
                int(inc.get("collateralDeltaAmount", 0)),
                collateral_decimals
            )
            
            entries.append({
                "size_delta_usd": size_delta_usd,
                "size_delta_tokens": size_delta_tokens,
                "execution_price": exec_price,
                "collateral_delta": collateral_delta,
                "timestamp": inc_timestamp,
                "block": int(inc.get("transaction", {}).get("blockNumber", 0))
            })
        
        return entries
    
    def calculate_weighted_entry_price(self, entries: List[Dict]) -> float:
        """Calculate weighted average entry price from position entries."""
        total_size_usd = 0.0
        weighted_price_sum = 0.0
        
        for entry in entries:
            size = entry.get("size_delta_usd", 0)
            price = entry.get("execution_price", 0)
            if size > 0 and price > 0:
                total_size_usd += size
                weighted_price_sum += size * price
        
        if total_size_usd == 0:
            return 0.0
        
        return weighted_price_sum / total_size_usd

    async def get_full_position(
        self,
        account: str,
        market_address: str,
        collateral_token: str,
        is_long: bool
    ) -> Optional[Dict[str, Any]]:
        """
        Get complete position data with current state, prices, and PnL.
        
        This is the main method to use - combines subgraph position data
        with oracle prices to provide full position analysis.
        
        Returns:
            Complete position dict with:
            - Position details (size, collateral, leverage)
            - Entry price (weighted average from history)
            - Current mark price (from oracle)
            - Unrealized PnL
            - Liquidation price estimate
        """
        # Get current position state
        position = await self.get_position_current_state(
            account, market_address, collateral_token, is_long
        )
        
        if not position or position["size_usd"] == 0:
            return None
        
        # Get entry history and calculate weighted entry price
        entries = await self.get_position_entry_history(
            account, market_address, collateral_token, is_long
        )
        entry_price = self.calculate_weighted_entry_price(entries)
        
        # Get current oracle prices
        prices = await self.get_oracle_prices()
        
        index_token = position["index_token"]
        collateral_token_addr = position["collateral_token"]
        
        index_price = prices.get(index_token, {}).get("mid_price", 0)
        collateral_price = prices.get(collateral_token_addr, {}).get("mid_price", 1.0)
        
        # Calculate position metrics
        size_usd = position["size_usd"]
        size_tokens = position["size_tokens"]
        collateral_amount = position["collateral_amount"]
        collateral_value_usd = collateral_amount * collateral_price
        
        # Calculate leverage
        leverage = size_usd / collateral_value_usd if collateral_value_usd > 0 else 0
        
        # Calculate unrealized PnL
        # For shorts: PnL = (entry_price - current_price) * size_tokens
        # For longs: PnL = (current_price - entry_price) * size_tokens
        if is_long:
            unrealized_pnl = (index_price - entry_price) * size_tokens
        else:
            unrealized_pnl = (entry_price - index_price) * size_tokens
        
        # Estimate liquidation price (simplified)
        # Liquidation occurs when losses exceed collateral minus fees
        # For shorts: liq_price = entry_price + (collateral_value / size_tokens)
        # For longs: liq_price = entry_price - (collateral_value / size_tokens)
        liq_buffer = collateral_value_usd * 0.95  # 5% buffer for fees
        if size_tokens > 0:
            if is_long:
                liquidation_price = entry_price - (liq_buffer / size_tokens)
            else:
                liquidation_price = entry_price + (liq_buffer / size_tokens)
        else:
            liquidation_price = 0
        
        return {
            "position_key": position["position_key"],
            "market_address": position["market_address"],
            "market_name": position["market_name"],
            "is_long": is_long,
            "side": "Long" if is_long else "Short",
            
            # Size
            "size_usd": size_usd,
            "size_tokens": size_tokens,
            
            # Collateral
            "collateral_token": collateral_token_addr,
            "collateral_symbol": position["collateral_symbol"],
            "collateral_amount": collateral_amount,
            "collateral_value_usd": collateral_value_usd,
            
            # Prices
            "entry_price": entry_price,
            "mark_price": index_price,
            "liquidation_price": max(0, liquidation_price),
            
            # Leverage & PnL
            "leverage": leverage,
            "unrealized_pnl_usd": unrealized_pnl,
            
            # Index token info
            "index_token": index_token,
            "index_symbol": TOKEN_SYMBOLS.get(index_token, ""),
            
            # Metadata
            "entry_count": len(entries),
            "last_update_timestamp": position["last_update_timestamp"],
            
            # Data source
            "data_source": "gmx_subgraph"
        }

    @staticmethod
    def parse_debank_position_index(position_index: str) -> Optional[Dict]:
        """
        Parse DeBank position index format into GMX query parameters.
        
        DeBank format: {collateral_token}_{market_address}_{is_long}
        Example: 0xaf88d065e77c8cc2239327c5edb3a432268e5831_0x70d95587d40a2caf56bd97485ab3eec10bee6336_False
        
        Returns:
            Dict with collateral_token, market_address, is_long or None if invalid
        """
        try:
            parts = position_index.split("_")
            if len(parts) != 3:
                return None
            
            collateral_token = parts[0].lower()
            market_address = parts[1].lower()
            is_long = parts[2].lower() == "true"
            
            return {
                "collateral_token": collateral_token,
                "market_address": market_address,
                "is_long": is_long
            }
        except Exception as e:
            logger.error(f"Error parsing DeBank position index: {e}")
            return None
    
    async def get_position_from_debank_index(
        self,
        account: str,
        position_index: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get full position data using DeBank's position index format.
        
        This is a convenience method for migrating from DeBank to subgraph.
        """
        params = self.parse_debank_position_index(position_index)
        if not params:
            return None
        
        return await self.get_full_position(
            account=account,
            market_address=params["market_address"],
            collateral_token=params["collateral_token"],
            is_long=params["is_long"]
        )
    
    async def get_all_open_positions(self, account: str) -> List[Dict[str, Any]]:
        """
        Get all open positions for an account.
        
        Queries all position increases and finds positions with non-zero size.
        """
        query = """
        {
          positionIncreases(
            where: {account: "%s"}
            orderBy: transaction__timestamp
            orderDirection: desc
            first: 100
          ) {
            positionKey
            marketAddress
            collateralTokenAddress
            isLong
            sizeInUsd
            transaction { timestamp }
          }
        }
        """ % account.lower()
        
        data = await self._query_subgraph(query)
        if not data or "data" not in data:
            return []
        
        increases = data["data"].get("positionIncreases", [])
        
        # Group by unique position identifier
        seen_positions = {}
        for inc in increases:
            key = f"{inc['marketAddress']}_{inc['collateralTokenAddress']}_{inc['isLong']}"
            if key not in seen_positions:
                seen_positions[key] = {
                    "market_address": inc["marketAddress"],
                    "collateral_token": inc["collateralTokenAddress"],
                    "is_long": inc["isLong"]
                }
        
        # Get full data for each unique position
        positions = []
        for params in seen_positions.values():
            position = await self.get_full_position(
                account=account,
                market_address=params["market_address"],
                collateral_token=params["collateral_token"],
                is_long=params["is_long"]
            )
            if position and position["size_usd"] > 100:  # Filter out dust
                positions.append(position)
        
        return positions

    async def get_prices_at_block(self, block_number: int) -> Dict[str, float]:
        """
        Get token prices at a specific block from subgraph.
        
        Note: The synthetics-stats subgraph stores prices in trade events.
        We query the most recent trade before the given block to get prices.
        """
        query = """
        {
          tradeActions(
            where: {transaction_: {blockNumber_lte: %d}}
            orderBy: timestamp
            orderDirection: desc
            first: 10
          ) {
            marketAddress
            indexTokenPriceMin
            indexTokenPriceMax
            collateralTokenPriceMin
            collateralTokenPriceMax
            transaction { blockNumber }
          }
        }
        """ % block_number
        
        data = await self._query_subgraph(query)
        if not data or "data" not in data:
            return {}
        
        trades = data["data"].get("tradeActions", [])
        
        prices = {}
        for trade in trades:
            market = trade.get("marketAddress", "").lower()
            market_info = GMX_MARKETS.get(market, {})
            index_token = market_info.get("index_token", "")
            
            if index_token:
                index_decimals = TOKEN_DECIMALS.get(index_token.lower(), 18)
                raw_price = int(trade.get("indexTokenPriceMin", 0) or 0)
                if raw_price > 0:
                    prices[index_token.lower()] = self._convert_price(raw_price, index_decimals)
        
        return prices
    
    async def get_position_initial_value(
        self,
        account: str,
        market_address: str,
        collateral_token: str,
        is_long: bool
    ) -> Dict[str, Any]:
        """
        Get the initial USD value of position entries at time of each trade.
        
        Similar to Uniswap's get_position_mint_values, this returns the USD
        values recorded at the time of each position increase.
        """
        entries = await self.get_position_entry_history(
            account, market_address, collateral_token, is_long
        )
        
        total_size_usd = 0.0
        total_collateral_usd = 0.0
        entry_details = []
        
        collateral_decimals = TOKEN_DECIMALS.get(collateral_token.lower(), 6)
        
        for entry in entries:
            size_usd = entry.get("size_delta_usd", 0)
            collateral_amount = entry.get("collateral_delta", 0)
            
            # For GMX, sizeDeltaUsd IS the USD value at time of trade
            # Collateral USD value can be estimated from collateral price at that block
            # For simplicity, assume collateral is stablecoin (USDC) at ~$1
            collateral_usd = collateral_amount  # USDC assumption
            
            total_size_usd += size_usd
            total_collateral_usd += collateral_usd
            
            entry_details.append({
                "size_usd": size_usd,
                "collateral_usd": collateral_usd,
                "execution_price": entry.get("execution_price", 0),
                "timestamp": entry.get("timestamp", 0),
                "block": entry.get("block", 0)
            })
        
        return {
            "total_initial_size_usd": total_size_usd,
            "total_initial_collateral_usd": total_collateral_usd,
            "entry_count": len(entries),
            "entries": entry_details
        }
