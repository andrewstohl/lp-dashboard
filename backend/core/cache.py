import redis.asyncio as redis
import json
from typing import Optional, Any
from datetime import datetime, timedelta
from functools import wraps
import hashlib

class CacheService:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url, decode_responses=True)
        self.default_ttl = 300  # 5 minutes

    async def get(self, key: str) -> Optional[dict]:
        """Get cached value"""
        try:
            value = await self.redis.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            # Fail gracefully - cache miss is better than crash
            print(f"Cache get error: {e}")
            return None

    async def set(self, key: str, value: dict, ttl: int = None) -> bool:
        """Set cached value with TTL"""
        try:
            ttl = ttl or self.default_ttl
            await self.redis.setex(key, ttl, json.dumps(value))
            return True
        except Exception as e:
            print(f"Cache set error: {e}")
            return False

    async def get_with_stale(self, key: str, stale_ttl: int = 3600) -> tuple[Optional[dict], bool]:
        """Get value, returning stale data if main cache miss but stale exists"""
        # Try main cache
        value = await self.get(key)
        if value:
            return value, False

        # Try stale cache
        stale_key = f"{key}:stale"
        stale_value = await self.get(stale_key)
        if stale_value:
            return stale_value, True

        return None, False

    async def set_with_stale(self, key: str, value: dict, ttl: int = None, stale_ttl: int = 3600):
        """Set value in both main and stale cache"""
        ttl = ttl or self.default_ttl
        await self.set(key, value, ttl)
        # Keep stale copy for longer (used when API fails)
        stale_key = f"{key}:stale"
        await self.set(stale_key, value, stale_ttl)

    async def close(self):
        """Close Redis connection"""
        await self.redis.close()

def cache_key_for_wallet(address: str) -> str:
    """Generate cache key for wallet positions"""
    # Bucket by 5-minute intervals to increase cache hit rate
    now = datetime.utcnow()
    bucket = now.replace(second=0, microsecond=0)
    bucket_minutes = (bucket.minute // 5) * 5
    bucket = bucket.replace(minute=bucket_minutes)
    timestamp = bucket.strftime("%Y%m%d%H%M")
    return f"debank:wallet:{address.lower()}:{timestamp}"
