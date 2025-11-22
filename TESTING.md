# Testing Guide

Comprehensive guide for testing the DeFi LP Dashboard backend.

## Test Structure

```
backend/tests/
├── conftest.py         # Shared fixtures
├── test_cache.py       # Cache service tests
└── test_debank.py      # DeBank service tests
```

## Running Tests

### Run all tests
```bash
cd backend
pytest tests/ -v
```

### Run with coverage
```bash
pytest tests/ --cov=backend --cov-report=html --cov-report=term
```

### Run specific test file
```bash
pytest tests/test_cache.py -v
```

### Run specific test
```bash
pytest tests/test_cache.py::test_cache_set_get -v
```

### Run tests matching pattern
```bash
pytest tests/ -k "cache" -v
```

## Test Categories

### Unit Tests
Test individual components in isolation.

```bash
pytest tests/ -m unit -v
```

### Integration Tests
Test components working together (requires Redis).

```bash
pytest tests/ -m integration -v
```

## Writing Tests

### Basic Test Structure
```python
import pytest
from backend.core.cache import CacheService

@pytest.mark.asyncio
async def test_cache_set_get(cache_service):
    """Test basic cache operations"""
    test_data = {"key": "value"}
    await cache_service.set("test_key", test_data, ttl=60)

    result = await cache_service.get("test_key")
    assert result == test_data
```

### Using Fixtures
```python
@pytest.mark.asyncio
async def test_with_fixture(cache_service):
    """cache_service fixture is automatically provided"""
    # Use cache_service here
    pass
```

### Async Tests
All async tests must use `@pytest.mark.asyncio`:

```python
@pytest.mark.asyncio
async def test_async_function():
    result = await some_async_function()
    assert result is not None
```

## Current Test Coverage

### Cache Service Tests (`test_cache.py`)

✅ **test_cache_set_get**
- Tests basic cache set and get operations
- Verifies data is stored and retrieved correctly

✅ **test_cache_miss**
- Tests cache miss returns None
- Ensures proper handling of non-existent keys

✅ **test_stale_cache**
- Tests stale-while-revalidate pattern
- Verifies fresh data returns is_stale=False

✅ **test_cache_key_generation**
- Tests cache key generation for wallet addresses
- Verifies proper formatting and timestamps

### DeBank Service Tests (`test_debank.py`)

✅ **test_invalid_address**
- Tests invalid address raises InvalidAddressError
- Verifies proper error handling

✅ **test_invalid_address_too_short**
- Tests short addresses are rejected
- Ensures address validation works

## Fixtures

### `cache_service`
Provides a Redis cache service connected to test database (DB 1).

```python
@pytest_asyncio.fixture
async def cache_service():
    cache = CacheService("redis://localhost:6379/1")
    yield cache
    await cache.redis.flushdb()  # Cleanup
    await cache.close()
```

## Test Database

Tests use **Redis DB 1** to avoid conflicts with development data (DB 0).

### Clear test database
```bash
redis-cli -n 1 FLUSHALL
```

## Mocking External Services

### Mock DeBank API
```python
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_debank_client():
    client = AsyncMock()
    client.get = AsyncMock(return_value=MagicMock(
        status_code=200,
        json=lambda: {"data": "test"}
    ))
    return client
```

## Coverage Goals

- **Overall**: 90%+
- **Core modules**: 95%+
- **Services**: 85%+
- **API endpoints**: 80%+

### View coverage report
```bash
pytest tests/ --cov=backend --cov-report=html
open htmlcov/index.html
```

## Common Testing Patterns

### Test Error Handling
```python
@pytest.mark.asyncio
async def test_error_handling():
    service = DeBankService(cache=None)

    with pytest.raises(InvalidAddressError):
        await service.get_wallet_positions("invalid")

    await service.close()
```

### Test with Timeout
```python
@pytest.mark.asyncio
async def test_with_timeout():
    import asyncio

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(slow_function(), timeout=1.0)
```

### Test Caching Behavior
```python
@pytest.mark.asyncio
async def test_cache_behavior(cache_service):
    # First call - cache miss
    result1 = await function_with_cache()
    assert result1["cached"] is False

    # Second call - cache hit
    result2 = await function_with_cache()
    assert result2["cached"] is True
```

## CI/CD Testing

Tests run automatically on:
- Every push to `main`, `develop`, or `claude/*` branches
- Every pull request

See `.github/workflows/backend-tests.yml` for configuration.

## Troubleshooting Tests

### Tests hang or timeout
- Check Redis is running: `redis-cli ping`
- Increase timeout in `pytest.ini`
- Add `--timeout=30` to pytest command

### Fixture errors
- Make sure you're using `pytest_asyncio.fixture` for async fixtures
- Check fixture scope (function, module, session)

### Import errors
- Run tests from `backend/` directory
- Make sure `__init__.py` files exist in all packages
- Check PYTHONPATH includes project root

### Redis connection errors
- Verify Redis is running
- Check Redis URL in test configuration
- Try: `redis-cli -n 1 ping`

## Test Data

### Valid Test Addresses
```python
VALID_ADDRESSES = [
    "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "0x0000000000000000000000000000000000000000",
]
```

### Invalid Test Addresses
```python
INVALID_ADDRESSES = [
    "invalid",
    "0x123",
    "742d35Cc6634C0532925a3b844Bc9e7595f0bEb",  # Missing 0x
    "",
]
```

## Future Test Plans

- [ ] Add integration tests for full API endpoints
- [ ] Add performance tests (load testing)
- [ ] Add tests for circuit breaker behavior
- [ ] Add tests for retry logic
- [ ] Add tests for logging
- [ ] Mock DeBank API responses
- [ ] Add property-based testing (hypothesis)

## Best Practices

1. **One assertion per test** (when possible)
2. **Descriptive test names** that explain what's being tested
3. **Clean up resources** in fixtures (use yield)
4. **Mock external services** to avoid API rate limits
5. **Test edge cases** and error conditions
6. **Use fixtures** for common setup
7. **Async tests** must use `@pytest.mark.asyncio`
8. **Test database** isolation (use Redis DB 1)

---

**Need to add more tests?** Copy the patterns above and contribute to the test suite!
