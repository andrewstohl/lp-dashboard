import httpx
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime
from backend.core.config import settings
from backend.core.errors import (
    DeBankError, RateLimitError, ServiceUnavailableError, InvalidAddressError, ErrorCode
)
from backend.core.cache import CacheService, cache_key_for_wallet
from backend.core.retry import CircuitBreaker, retry_on_5xx

logger = logging.getLogger(__name__)

DEBANK_BASE_URL = "https://pro-openapi.debank.com/v1"

class DeBankService:
    def __init__(self, cache: Optional[CacheService] = None):
        self.client = httpx.AsyncClient(  # ASYNC CLIENT
            base_url=DEBANK_BASE_URL,
            headers={"AccessKey": settings.debank_access_key},
            timeout=30.0,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5)
        )
        self.cache = cache
        self.circuit_breaker = CircuitBreaker(failure_threshold=3, timeout_seconds=60)

    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

    async def get_wallet_positions(self, address: str) -> Dict[str, Any]:
        """
        Fetch all DeFi positions for a wallet with caching
        Returns: Dict with positions and metadata
        """
        # Validate address format
        if not address.startswith("0x") or len(address) != 42:
            raise InvalidAddressError(address)

        # Try cache first
        if self.cache:
            cache_key = cache_key_for_wallet(address)
            cached_data, is_stale = await self.cache.get_with_stale(cache_key)

            if cached_data:
                logger.info(f"Cache {'HIT (stale)' if is_stale else 'HIT'} for {address}")
                return {
                    **cached_data,
                    "cached": True,
                    "is_stale": is_stale
                }

        # Cache miss - fetch from API
        logger.info(f"Cache MISS for {address} - fetching from DeBank API")

        try:
            # Check circuit breaker
            if not self.circuit_breaker.can_attempt():
                raise ServiceUnavailableError("DeBank API")

            positions = await self._fetch_from_api(address)

            # Update cache on success
            if self.cache:
                cache_key = cache_key_for_wallet(address)
                await self.cache.set_with_stale(cache_key, {
                    "positions": positions,
                    "wallet": address,
                    "fetched_at": datetime.utcnow().isoformat()
                })

            self.circuit_breaker.record_success()

            return {
                "positions": positions,
                "wallet": address,
                "cached": False,
                "is_stale": False
            }

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                # Rate limited
                self.circuit_breaker.record_failure()
                retry_after = int(e.response.headers.get("Retry-After", 300))
                raise RateLimitError(retry_after)
            elif 500 <= e.response.status_code < 600:
                # Server error - maybe retryable
                self.circuit_breaker.record_failure()
                raise ServiceUnavailableError("DeBank API")
            else:
                # Client error (4xx) - don't retry
                raise DeBankError(
                    ErrorCode.UNKNOWN,
                    "Failed to fetch wallet data",
                    f"HTTP {e.response.status_code}"
                )

        except Exception as e:
            self.circuit_breaker.record_failure()
            logger.error(f"Unexpected error fetching wallet {address}: {e}")
            raise ServiceUnavailableError("DeBank API")

    @retry_on_5xx()
    async def _fetch_from_api(self, address: str) -> List[Dict[str, Any]]:
        """Internal method to fetch from API with retries"""
        response = await self.client.get(
            "/user/all_complex_protocol_list",
            params={"id": address.lower()}
        )
        response.raise_for_status()

        data = response.json()
        
        # DEBUG: Log what protocols DeBank returned
        logger.info(f"=" * 80)
        logger.info(f"DeBank API Response for wallet: {address}")
        logger.info(f"Response type: {type(data)}")
        logger.info(f"Number of protocols returned: {len(data) if isinstance(data, list) else 'Not a list'}")
        
        if isinstance(data, list):
            protocol_ids = [p.get("id") for p in data if isinstance(p, dict)]
            logger.info(f"Protocol IDs found: {protocol_ids}")
            
            # Log detailed info for each protocol
            for protocol in data:
                if isinstance(protocol, dict):
                    protocol_id = protocol.get("id", "UNKNOWN")
                    portfolio_items = protocol.get("portfolio_item_list", [])
                    logger.info(f"  Protocol: {protocol_id}")
                    logger.info(f"    - Chain: {protocol.get('chain', 'UNKNOWN')}")
                    logger.info(f"    - Name: {protocol.get('name', 'UNKNOWN')}")
                    logger.info(f"    - Portfolio items: {len(portfolio_items)}")
                    
                    # Log structure of first portfolio item if available
                    if portfolio_items and len(portfolio_items) > 0:
                        first_item = portfolio_items[0]
                        logger.info(f"    - First item keys: {list(first_item.keys())}")
                        logger.info(f"    - First item has supply_token_list: {'supply_token_list' in first_item}")
        else:
            logger.warning(f"Unexpected response type from DeBank: {type(data)}")
            logger.warning(f"Response content: {data}")
        
        logger.info(f"=" * 80)
        
        uniswap_positions = []

        # Filter for Uniswap v3 positions
        if isinstance(data, list):
            for protocol in data:
                if not isinstance(protocol, dict):
                    continue
                    
                protocol_id = protocol.get("id", "")
                logger.info(f"Checking protocol: {protocol_id}")
                
                if protocol_id == "uniswap3":
                    logger.info("Found Uniswap v3 protocol!")
                    portfolio_items = protocol.get("portfolio_item_list", [])
                    logger.info(f"Number of portfolio items: {len(portfolio_items)}")
                    
                    for idx, portfolio_item in enumerate(portfolio_items):
                        logger.info(f"Processing portfolio item {idx + 1}/{len(portfolio_items)}")
                        
                        # Check if supply_token_list exists in detail
                        detail = portfolio_item.get("detail", {})
                        if "supply_token_list" in detail:
                            position = self._parse_position(portfolio_item, address)
                            if position:
                                logger.info(f"Successfully parsed position: {position.get('pool_name')}")
                                uniswap_positions.append(position)
                            else:
                                logger.warning(f"Failed to parse portfolio item {idx + 1}")
                        else:
                            logger.warning(f"Portfolio item {idx + 1} missing 'supply_token_list' in detail")

        logger.info(f"Total Uniswap v3 positions found: {len(uniswap_positions)}")
        return uniswap_positions

    def _parse_position(self, portfolio_item: Dict[str, Any], wallet: str) -> Optional[Dict[str, Any]]:
        """Parse a DeBank portfolio item into our standard format"""
        try:
            # Get supply tokens from detail object
            detail = portfolio_item.get("detail", {})
            supply_tokens = detail.get("supply_token_list", [])
            
            if len(supply_tokens) < 2:
                logger.warning(f"Position has fewer than 2 tokens: {len(supply_tokens)}")
                return None

            token0 = supply_tokens[0]
            token1 = supply_tokens[1]
            
            # Get pool information
            pool = portfolio_item.get("pool", {})
            pool_id = pool.get("id", "")
            position_index = portfolio_item.get("position_index", "")
            
            # Get stats
            stats = portfolio_item.get("stats", {})
            total_value = float(stats.get("asset_usd_value", 0))
            
            # Get reward tokens if available
            reward_tokens = detail.get("reward_token_list", [])
            total_rewards_usd = sum(
                float(token.get("price", 0)) * float(token.get("amount", 0))
                for token in reward_tokens
            )

            position = {
                "pool_name": f"{token0.get('symbol', 'UNK')}/{token1.get('symbol', 'UNK')}",
                "pool_address": pool_id,
                "position_index": position_index,
                "chain": portfolio_item.get("chain", pool.get("chain", "eth")),
                "token0": {
                    "symbol": token0.get("symbol", ""),
                    "address": token0.get("id", ""),
                    "amount": float(token0.get("amount", 0)),
                    "price": float(token0.get("price", 0)),
                    "value_usd": float(token0.get("price", 0)) * float(token0.get("amount", 0))
                },
                "token1": {
                    "symbol": token1.get("symbol", ""),
                    "address": token1.get("id", ""),
                    "amount": float(token1.get("amount", 0)),
                    "price": float(token1.get("price", 0)),
                    "value_usd": float(token1.get("price", 0)) * float(token1.get("amount", 0))
                },
                "total_value_usd": total_value,
                "unclaimed_fees_usd": total_rewards_usd,
                "reward_tokens": [
                    {
                        "symbol": token.get("symbol", ""),
                        "address": token.get("id", ""),
                        "amount": float(token.get("amount", 0)),
                        "value_usd": float(token.get("price", 0)) * float(token.get("amount", 0))
                    }
                    for token in reward_tokens
                ] if reward_tokens else []
            }
            
            return position
            
        except Exception as e:
            logger.warning(f"Error parsing position: {e}")
            import traceback
            logger.warning(traceback.format_exc())
            return None

# Global service instance with lifecycle management
_debank_service: Optional[DeBankService] = None

async def get_debank_service() -> DeBankService:
    """Dependency injection for DeBankService"""
    global _debank_service
    if _debank_service is None:
        from backend.core.cache import CacheService
        cache = CacheService(settings.redis_url)
        _debank_service = DeBankService(cache=cache)
    return _debank_service

async def close_debank_service():
    """Cleanup on shutdown"""
    global _debank_service
    if _debank_service:
        await _debank_service.close()
        if _debank_service.cache:
            await _debank_service.cache.close()
