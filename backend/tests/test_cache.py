import pytest
from backend.core.cache import CacheService, cache_key_for_wallet

@pytest.mark.asyncio
async def test_cache_set_get(cache_service):
    """Test basic cache operations"""
    test_data = {"positions": [], "wallet": "0x123"}
    await cache_service.set("test_key", test_data, ttl=60)

    result = await cache_service.get("test_key")
    assert result == test_data

@pytest.mark.asyncio
async def test_cache_miss(cache_service):
    """Test cache miss returns None"""
    result = await cache_service.get("nonexistent_key")
    assert result is None

@pytest.mark.asyncio
async def test_stale_cache(cache_service):
    """Test stale-while-revalidate pattern"""
    test_data = {"positions": [], "wallet": "0x123"}
    await cache_service.set_with_stale("test_key", test_data, ttl=1, stale_ttl=60)

    # Immediate get should return fresh data
    result, is_stale = await cache_service.get_with_stale("test_key")
    assert result == test_data
    assert is_stale is False

def test_cache_key_generation():
    """Test cache key bucketing"""
    address = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
    key = cache_key_for_wallet(address)

    assert key.startswith("debank:wallet:0x742d35cc6634c0532925a3b844bc9e7595f0beb:")
    assert len(key) > 50  # Should have timestamp
