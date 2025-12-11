import httpx
from typing import Optional
import logging
from datetime import datetime
from backend.core.config import settings

logger = logging.getLogger(__name__)

# Use demo API URL (for demo keys) or pro URL (for paid keys)
# Demo keys use: api.coingecko.com
# Pro keys use: pro-api.coingecko.com
COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"

# Token address to CoinGecko ID mapping
TOKEN_MAPPING = {
    # Ethereum Mainnet
    "0x514910771af9ca656af840dff83e8264ecf986ca": "chainlink",  # LINK
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "weth",  # WETH
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "usd-coin",  # USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "tether",  # USDT
    "0x6b175474e89094c44da98b954eedeac495271d0f": "dai",  # DAI
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "wrapped-bitcoin",  # WBTC
    # Arbitrum
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "weth",  # WETH on Arb
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "usd-coin",  # USDC on Arb
    "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": "chainlink",  # LINK on Arb
}

# Symbol to CoinGecko ID mapping (for GMX perp positions)
SYMBOL_TO_COINGECKO = {
    "ETH": "ethereum",
    "WETH": "ethereum",
    "BTC": "bitcoin",
    "WBTC": "bitcoin",
    "LINK": "chainlink",
    "SOL": "solana",
    "ARB": "arbitrum",
    "DOGE": "dogecoin",
    "PEPE": "pepe",
    "NEAR": "near",
    "SUI": "sui",
    "XRP": "ripple",
    "AAVE": "aave",
    "GMX": "gmx",
}


class CoinGeckoService:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=COINGECKO_BASE_URL,
            headers={"x-cg-demo-api-key": settings.coingecko_api_key},
            timeout=30.0
        )
        self._price_cache: dict[str, float] = {}

    async def close(self):
        await self.client.aclose()

    def _get_coingecko_id(self, token_address: str) -> Optional[str]:
        """Convert token address to CoinGecko ID"""
        return TOKEN_MAPPING.get(token_address.lower())

    async def get_current_prices(self, symbols: list[str]) -> dict[str, float]:
        """
        Get current prices for multiple symbols.

        Args:
            symbols: List of token symbols (e.g., ["ETH", "LINK", "BTC"])

        Returns:
            Dict mapping symbol to USD price
        """
        # Convert symbols to CoinGecko IDs
        coingecko_ids = []
        symbol_to_id = {}
        for symbol in symbols:
            cg_id = SYMBOL_TO_COINGECKO.get(symbol.upper())
            if cg_id:
                coingecko_ids.append(cg_id)
                symbol_to_id[cg_id] = symbol.upper()

        if not coingecko_ids:
            return {}

        try:
            response = await self.client.get(
                "/simple/price",
                params={
                    "ids": ",".join(coingecko_ids),
                    "vs_currencies": "usd"
                }
            )
            response.raise_for_status()
            data = response.json()

            # Map back to symbols
            results = {}
            for cg_id, price_data in data.items():
                symbol = symbol_to_id.get(cg_id)
                if symbol and "usd" in price_data:
                    results[symbol] = price_data["usd"]
                    logger.info(f"Current price for {symbol}: ${price_data['usd']}")

            return results

        except Exception as e:
            logger.error(f"Error fetching current prices: {e}")
            return {}

    async def get_historical_price(
        self,
        token_address: str,
        timestamp: float
    ) -> Optional[float]:
        """
        Get historical price for a token at a specific timestamp
        
        Args:
            token_address: Token contract address
            timestamp: Unix timestamp
            
        Returns:
            Price in USD or None if not found
        """
        coingecko_id = self._get_coingecko_id(token_address)
        if not coingecko_id:
            logger.warning(f"No CoinGecko ID mapping for token: {token_address}")
            return None

        # Convert timestamp to date string (DD-MM-YYYY)
        dt = datetime.utcfromtimestamp(timestamp)
        date_str = dt.strftime("%d-%m-%Y")
        
        cache_key = f"{coingecko_id}_{date_str}"
        if cache_key in self._price_cache:
            return self._price_cache[cache_key]

        try:
            response = await self.client.get(
                f"/coins/{coingecko_id}/history",
                params={"date": date_str, "localization": "false"}
            )
            response.raise_for_status()
            data = response.json()
            
            price = data.get("market_data", {}).get("current_price", {}).get("usd")
            if price:
                self._price_cache[cache_key] = price
                logger.info(f"Historical price for {coingecko_id} on {date_str}: ${price}")
            return price
            
        except Exception as e:
            logger.error(f"Error fetching historical price for {coingecko_id}: {e}")
            return None

    async def get_historical_prices_batch(
        self,
        token_addresses: list[str],
        timestamp: float
    ) -> dict[str, float]:
        """
        Get historical prices for multiple tokens at once

        Returns:
            Dict mapping token address to price
        """
        results = {}
        for address in token_addresses:
            price = await self.get_historical_price(address, timestamp)
            if price:
                results[address.lower()] = price
        return results

    async def get_price_time_series(
        self,
        symbol: str,
        from_timestamp: int,
        to_timestamp: int
    ) -> list[dict]:
        """
        Get price time series for a token over a time range.

        CoinGecko auto-determines granularity based on range:
        - 1 day: 5-minute intervals
        - 2-90 days: hourly intervals
        - 90+ days: daily intervals

        Args:
            symbol: Token symbol (e.g., "LINK", "ETH")
            from_timestamp: Start Unix timestamp
            to_timestamp: End Unix timestamp

        Returns:
            List of {timestamp, price} dicts
        """
        coingecko_id = SYMBOL_TO_COINGECKO.get(symbol.upper())
        if not coingecko_id:
            logger.warning(f"No CoinGecko ID mapping for symbol: {symbol}")
            return []

        try:
            response = await self.client.get(
                f"/coins/{coingecko_id}/market_chart/range",
                params={
                    "vs_currency": "usd",
                    "from": from_timestamp,
                    "to": to_timestamp
                }
            )
            response.raise_for_status()
            data = response.json()

            # CoinGecko returns prices as [[timestamp_ms, price], ...]
            prices = data.get("prices", [])
            result = []
            for item in prices:
                result.append({
                    "timestamp": int(item[0] / 1000),  # Convert ms to seconds
                    "price": item[1]
                })

            logger.info(f"Fetched {len(result)} price points for {symbol}")
            return result

        except Exception as e:
            logger.error(f"Error fetching price time series for {symbol}: {e}")
            return []

    async def get_price_ratio_time_series(
        self,
        symbol1: str,
        symbol2: str,
        from_timestamp: int,
        to_timestamp: int,
        interval_hours: int = 4
    ) -> list[dict]:
        """
        Get price ratio time series between two tokens.

        Args:
            symbol1: Numerator token symbol (e.g., "LINK")
            symbol2: Denominator token symbol (e.g., "ETH")
            from_timestamp: Start Unix timestamp
            to_timestamp: End Unix timestamp
            interval_hours: Resample to this interval (default 4H)

        Returns:
            List of {timestamp, price1, price2, ratio} dicts
        """
        # Fetch both price series
        prices1 = await self.get_price_time_series(symbol1, from_timestamp, to_timestamp)
        prices2 = await self.get_price_time_series(symbol2, from_timestamp, to_timestamp)

        if not prices1 or not prices2:
            return []

        # Create lookup dicts by timestamp (rounded to hour)
        def round_to_hour(ts: int) -> int:
            return (ts // 3600) * 3600

        prices1_by_hour = {round_to_hour(p["timestamp"]): p["price"] for p in prices1}
        prices2_by_hour = {round_to_hour(p["timestamp"]): p["price"] for p in prices2}

        # Find common timestamps and resample to interval
        interval_seconds = interval_hours * 3600
        common_hours = sorted(set(prices1_by_hour.keys()) & set(prices2_by_hour.keys()))

        if not common_hours:
            return []

        # Resample to desired interval
        result = []
        current_ts = common_hours[0]

        while current_ts <= common_hours[-1]:
            # Find nearest available timestamp
            nearest = min(common_hours, key=lambda x: abs(x - current_ts))
            if abs(nearest - current_ts) <= interval_seconds:
                p1 = prices1_by_hour.get(nearest, 0)
                p2 = prices2_by_hour.get(nearest, 0)
                if p1 > 0 and p2 > 0:
                    result.append({
                        "timestamp": nearest,
                        "price1": p1,
                        "price2": p2,
                        "ratio": p1 / p2
                    })
            current_ts += interval_seconds

        logger.info(f"Generated {len(result)} ratio points for {symbol1}/{symbol2}")
        return result


# Global service instance
_coingecko_service: Optional[CoinGeckoService] = None


async def get_coingecko_service() -> CoinGeckoService:
    global _coingecko_service
    if _coingecko_service is None:
        _coingecko_service = CoinGeckoService()
    return _coingecko_service


async def close_coingecko_service():
    global _coingecko_service
    if _coingecko_service:
        await _coingecko_service.close()
        _coingecko_service = None
