import pytest
import pytest_asyncio
from backend.core.cache import CacheService

@pytest_asyncio.fixture
async def cache_service():
    """Fixture for cache service with test Redis"""
    cache = CacheService("redis://localhost:6379/1")  # Use DB 1 for tests
    yield cache
    # Cleanup
    await cache.redis.flushdb()
    await cache.close()
