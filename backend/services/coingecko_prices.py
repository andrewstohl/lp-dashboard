import httpx
from typing import Dict, List, Optional, Tuple, Any
import logging
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)

# Use demo API URL (for demo keys) or pro URL (for paid keys)
COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"

# Chain ID to CoinGecko platform mapping
CHAIN_TO_PLATFORM = {
    "eth": "ethereum",
    "arb": "arbitrum-one",
    "op": "optimistic-ethereum",
    "base": "base",
    "polygon": "polygon-pos",
    "bsc": "binance-smart-chain",
    "avax": "avalanche",
    "ftm": "fantom",
    "gnosis": "xdai",
    "scroll": "scroll",
    "blast": "blast",
    "zksync": "zksync",
    "linea": "linea",
    "manta": "manta-pacific",
}

# Well-known token mappings (address -> coingecko_id)
# Organized by chain for clarity
KNOWN_TOKENS = {
    # Native/Wrapped ETH (same ID across chains)
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "weth",  # WETH Mainnet
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "weth",  # WETH Arbitrum
    "0x4200000000000000000000000000000000000006": "weth",  # WETH Optimism/Base
    
    # Stablecoins
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "usd-coin",  # USDC Mainnet
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "usd-coin",  # USDC Arbitrum
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "usd-coin",  # USDC Base
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "tether",  # USDT Mainnet
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "tether",  # USDT Arbitrum
    "0x6b175474e89094c44da98b954eedeac495271d0f": "dai",  # DAI Mainnet
    
    # Major tokens
    "0x514910771af9ca656af840dff83e8264ecf986ca": "chainlink",  # LINK Mainnet
    "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": "chainlink",  # LINK Arbitrum
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "wrapped-bitcoin",  # WBTC Mainnet
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "wrapped-bitcoin",  # WBTC Arbitrum
}


class CoinGeckoPriceService:
    """
    Enhanced CoinGecko service for historical price lookups.
    Supports looking up tokens by address+chain with fallback strategies.
    """
    
    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.client = httpx.AsyncClient(
            base_url=COINGECKO_BASE_URL,
            headers={"x-cg-demo-api-key": api_key} if api_key else {},
            timeout=30.0
        )
        # In-memory cache: (coingecko_id, date_str) -> price
        self._price_cache: Dict[Tuple[str, str], float] = {}
        # Token ID cache: (address, chain) -> coingecko_id
        self._token_id_cache: Dict[Tuple[str, str], Optional[str]] = {}
        # Rate limiting
        self._last_request_time = 0.0
        self._min_request_interval = 0.5  # 500ms between requests (demo tier)

    async def close(self):
        await self.client.aclose()

    async def _rate_limit(self):
        """Enforce rate limiting between requests"""
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_request_interval:
            await asyncio.sleep(self._min_request_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    def _get_known_token_id(self, token_address: str) -> Optional[str]:
        """Check if token is in our known mappings"""
        return KNOWN_TOKENS.get(token_address.lower())

    async def _lookup_token_id(
        self, 
        token_address: str, 
        chain: str
    ) -> Optional[str]:
        """
        Look up CoinGecko ID for a token address on a specific chain.
        Uses CoinGecko's contract lookup API.
        """
        cache_key = (token_address.lower(), chain.lower())
        if cache_key in self._token_id_cache:
            return self._token_id_cache[cache_key]

        # First check known tokens
        known_id = self._get_known_token_id(token_address)
        if known_id:
            self._token_id_cache[cache_key] = known_id
            return known_id

        # Get platform name for chain
        platform = CHAIN_TO_PLATFORM.get(chain.lower())
        if not platform:
            logger.warning(f"Unknown chain for CoinGecko lookup: {chain}")
            self._token_id_cache[cache_key] = None
            return None

        try:
            await self._rate_limit()
            response = await self.client.get(
                f"/coins/{platform}/contract/{token_address.lower()}"
            )
            
            if response.status_code == 404:
                logger.debug(f"Token not found on CoinGecko: {token_address} on {chain}")
                self._token_id_cache[cache_key] = None
                return None
                
            response.raise_for_status()
            data = response.json()
            
            coingecko_id = data.get("id")
            self._token_id_cache[cache_key] = coingecko_id
            logger.info(f"Found CoinGecko ID for {token_address}: {coingecko_id}")
            return coingecko_id
            
        except Exception as e:
            logger.error(f"Error looking up token {token_address} on {chain}: {e}")
            self._token_id_cache[cache_key] = None
            return None

    async def get_historical_price(
        self,
        token_address: str,
        chain: str,
        timestamp: int
    ) -> Optional[float]:
        """
        Get historical USD price for a token at a specific timestamp.
        
        Args:
            token_address: Token contract address
            chain: Chain identifier (eth, arb, op, base, etc.)
            timestamp: Unix timestamp
            
        Returns:
            Price in USD or None if not found
        """
        # Get CoinGecko ID
        coingecko_id = await self._lookup_token_id(token_address, chain)
        if not coingecko_id:
            return None

        # Convert timestamp to date string (DD-MM-YYYY)
        dt = datetime.utcfromtimestamp(timestamp)
        date_str = dt.strftime("%d-%m-%Y")
        
        # Check cache
        cache_key = (coingecko_id, date_str)
        if cache_key in self._price_cache:
            return self._price_cache[cache_key]

        try:
            await self._rate_limit()
            response = await self.client.get(
                f"/coins/{coingecko_id}/history",
                params={"date": date_str, "localization": "false"}
            )
            response.raise_for_status()
            data = response.json()
            
            price = data.get("market_data", {}).get("current_price", {}).get("usd")
            if price is not None:
                self._price_cache[cache_key] = price
                logger.debug(f"Historical price for {coingecko_id} on {date_str}: ${price:.4f}")
            return price
            
        except Exception as e:
            logger.error(f"Error fetching historical price for {coingecko_id} on {date_str}: {e}")
            return None

    async def get_current_price(
        self,
        token_address: str,
        chain: str
    ) -> Optional[float]:
        """
        Get current USD price for a token.
        Uses simpler /simple/price endpoint which is faster.
        """
        coingecko_id = await self._lookup_token_id(token_address, chain)
        if not coingecko_id:
            return None

        try:
            await self._rate_limit()
            response = await self.client.get(
                "/simple/price",
                params={"ids": coingecko_id, "vs_currencies": "usd"}
            )
            response.raise_for_status()
            data = response.json()
            
            return data.get(coingecko_id, {}).get("usd")
            
        except Exception as e:
            logger.error(f"Error fetching current price for {coingecko_id}: {e}")
            return None

    async def enrich_transaction_prices(
        self,
        transaction: dict
    ) -> dict:
        """
        Enrich a DeBank transaction with USD prices for all tokens.
        
        Adds 'price_usd' and 'value_usd' to each token in sends/receives.
        
        Args:
            transaction: DeBank transaction dict
            
        Returns:
            Transaction with prices added
        """
        chain = transaction.get("chain", "eth")
        timestamp = transaction.get("time_at", 0)
        
        # Process sends
        sends = transaction.get("sends", []) or []
        for token in sends:
            token_addr = token.get("token_id", "")
            amount = float(token.get("amount", 0))
            
            if token_addr and amount > 0:
                price = await self.get_historical_price(token_addr, chain, timestamp)
                if price is not None:
                    token["price_usd"] = price
                    token["value_usd"] = price * amount
        
        # Process receives
        receives = transaction.get("receives", []) or []
        for token in receives:
            token_addr = token.get("token_id", "")
            amount = float(token.get("amount", 0))
            
            if token_addr and amount > 0:
                price = await self.get_historical_price(token_addr, chain, timestamp)
                if price is not None:
                    token["price_usd"] = price
                    token["value_usd"] = price * amount
        
        return transaction

    async def get_current_prices_batch(
        self,
        coingecko_ids: List[str]
    ) -> Dict[str, float]:
        """
        Get current USD prices for multiple tokens in one API call.
        
        Args:
            coingecko_ids: List of CoinGecko token IDs
            
        Returns:
            Dict mapping coingecko_id -> price
        """
        if not coingecko_ids:
            return {}
            
        try:
            await self._rate_limit()
            response = await self.client.get(
                "/simple/price",
                params={"ids": ",".join(coingecko_ids), "vs_currencies": "usd"}
            )
            response.raise_for_status()
            data = response.json()
            
            return {cg_id: info.get("usd", 0) for cg_id, info in data.items()}
            
        except Exception as e:
            logger.error(f"Error fetching batch prices: {e}")
            return {}

    async def enrich_token_dict(
        self,
        token_dict: Dict[str, Any],
        token_addresses: List[str]
    ) -> Dict[str, Any]:
        """
        Enrich a token_dict with current prices for known tokens.
        
        For any token address that:
        1. Is not in token_dict, OR
        2. Is in token_dict but has no price
        
        This will add/update the entry with current price data.
        
        Args:
            token_dict: Existing token dictionary from DeBank
            token_addresses: List of token addresses to ensure have prices
            
        Returns:
            Enriched token_dict
        """
        # Find which tokens need prices
        tokens_needing_prices = {}  # address -> coingecko_id
        
        for addr in token_addresses:
            addr_lower = addr.lower()
            existing = token_dict.get(addr_lower) or token_dict.get(addr)
            
            # Check if we need to add/update this token
            needs_price = False
            if not existing:
                needs_price = True
            elif existing.get("price") is None or existing.get("price") == 0:
                needs_price = True
                
            if needs_price:
                # Check if it's a known token
                cg_id = self._get_known_token_id(addr)
                if cg_id:
                    tokens_needing_prices[addr_lower] = cg_id
        
        if not tokens_needing_prices:
            return token_dict
            
        # Get unique CoinGecko IDs
        unique_cg_ids = list(set(tokens_needing_prices.values()))
        
        # Fetch prices in batch
        prices = await self.get_current_prices_batch(unique_cg_ids)
        
        # Update token_dict
        for addr, cg_id in tokens_needing_prices.items():
            price = prices.get(cg_id, 0)
            if price:
                # Add or update entry
                if addr not in token_dict:
                    # Create minimal entry
                    token_dict[addr] = {
                        "id": addr,
                        "symbol": cg_id.upper().replace("-", " "),
                        "price": price,
                        "is_verified": True,
                    }
                else:
                    token_dict[addr]["price"] = price
                    
                logger.debug(f"Enriched token {addr} with price ${price:.4f}")
        
        return token_dict


# Global service instance
_price_service: Optional[CoinGeckoPriceService] = None


def get_price_service(api_key: str = "") -> CoinGeckoPriceService:
    """Get or create the global price service instance"""
    global _price_service
    if _price_service is None:
        _price_service = CoinGeckoPriceService(api_key)
    return _price_service


async def close_price_service():
    """Close the global price service"""
    global _price_service
    if _price_service:
        await _price_service.close()
        _price_service = None
