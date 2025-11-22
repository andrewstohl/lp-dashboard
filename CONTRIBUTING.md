# Contributing Guide

Thank you for your interest in contributing to the DeFi LP Intelligence Dashboard! This guide will help you get started.

## Getting Started

### 1. Fork and Clone
```bash
git fork https://github.com/YOUR_USERNAME/lp-dashboard
git clone https://github.com/YOUR_USERNAME/lp-dashboard.git
cd lp-dashboard
```

### 2. Set up development environment
```bash
./dev.sh setup
```

### 3. Create a feature branch
```bash
git checkout -b feature/your-feature-name
```

## Development Workflow

### 1. Make changes
- Write code following the style guide below
- Add tests for new functionality
- Update documentation as needed

### 2. Test your changes
```bash
./dev.sh test
```

### 3. Format and lint
```bash
./dev.sh format
./dev.sh lint
```

### 4. Commit your changes
```bash
git add .
git commit -m "feat: add amazing feature"
```

### 5. Push and create PR
```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Code Style Guide

### Python Code Style

We follow **PEP 8** with some modifications:

- **Line length**: 100 characters (not 79)
- **Imports**: Use `isort` for organizing imports
- **Formatting**: Use `black` for code formatting
- **Type hints**: Always use type hints for function parameters and return values
- **Docstrings**: Use Google-style docstrings

Example:
```python
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


async def get_wallet_positions(
    address: str,
    cache: Optional[CacheService] = None
) -> Dict[str, Any]:
    """
    Fetch wallet positions with optional caching.

    Args:
        address: Ethereum wallet address (0x...)
        cache: Optional cache service instance

    Returns:
        Dictionary containing wallet positions and metadata

    Raises:
        InvalidAddressError: If address format is invalid
        ServiceUnavailableError: If external service is down
    """
    # Validate input
    if not address.startswith("0x"):
        raise InvalidAddressError(address)

    # Implementation here
    logger.info(f"Fetching positions for {address}")
    return {"positions": []}
```

### Import Organization

Use `isort` to organize imports:

1. Standard library imports
2. Third-party imports
3. Local application imports

```python
# Standard library
import logging
from typing import Dict, List

# Third-party
from fastapi import APIRouter
from pydantic import BaseModel

# Local
from backend.core.errors import DeBankError
from backend.services.debank import DeBankService
```

### Naming Conventions

- **Variables/Functions**: `snake_case`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Private methods**: `_leading_underscore`

```python
# Good
MAX_RETRIES = 3
user_wallet_address = "0x..."

class WalletService:
    def get_positions(self) -> List[Position]:
        return self._fetch_from_cache()

    def _fetch_from_cache(self) -> List[Position]:
        pass
```

## Testing Guidelines

### Write Tests for Everything

- Every new function should have tests
- Aim for 90%+ code coverage
- Test both success and error cases

### Test Structure

```python
import pytest
from backend.services.debank import DeBankService


@pytest.mark.asyncio
async def test_get_wallet_positions_success():
    """Test successful wallet position retrieval"""
    # Arrange
    service = DeBankService(cache=None)
    address = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"

    # Act
    result = await service.get_wallet_positions(address)

    # Assert
    assert "positions" in result
    assert result["wallet"] == address.lower()

    # Cleanup
    await service.close()


@pytest.mark.asyncio
async def test_get_wallet_positions_invalid_address():
    """Test error handling for invalid address"""
    service = DeBankService(cache=None)

    with pytest.raises(InvalidAddressError):
        await service.get_wallet_positions("invalid")

    await service.close()
```

### Test Categories

Use markers to categorize tests:

```python
@pytest.mark.unit
async def test_cache_key_generation():
    """Unit test - no external dependencies"""
    pass


@pytest.mark.integration
async def test_full_api_flow():
    """Integration test - tests multiple components"""
    pass
```

## Git Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks

### Examples

```bash
# Good commit messages
git commit -m "feat(cache): add stale-while-revalidate pattern"
git commit -m "fix(debank): handle rate limit errors correctly"
git commit -m "docs: update API documentation with examples"
git commit -m "test(cache): add tests for TTL expiration"

# Bad commit messages
git commit -m "fixed stuff"
git commit -m "wip"
git commit -m "updates"
```

## Pull Request Guidelines

### Before Creating a PR

1. ✅ Tests pass: `./dev.sh test`
2. ✅ Code is formatted: `./dev.sh format`
3. ✅ No linting errors: `./dev.sh lint`
4. ✅ Documentation updated
5. ✅ Commit messages follow guidelines

### PR Title

Follow commit message format:
```
feat(cache): add Redis persistence configuration
```

### PR Description

Include:
- **What**: What does this PR do?
- **Why**: Why is this change needed?
- **How**: How did you implement it?
- **Testing**: How did you test it?

Example:
```markdown
## What
Adds Redis persistence configuration to prevent data loss on restart.

## Why
Currently, Redis data is lost when the container restarts. This causes
unnecessary API calls to DeBank.

## How
- Added `redis.conf` with AOF persistence
- Updated docker-compose.yml to mount config
- Added tests for persistence behavior

## Testing
- Manual testing: restarted Redis, verified data persists
- Unit tests: added test_redis_persistence.py
- All existing tests pass
```

## Code Review Process

### As a Contributor

- Be responsive to feedback
- Make requested changes promptly
- Ask questions if feedback is unclear
- Be patient - reviews take time

### As a Reviewer

- Be constructive and kind
- Explain *why* changes are needed
- Approve when requirements are met
- Use GitHub's suggestion feature for small fixes

## Project Structure

### Where to Add New Code

```
backend/
├── app/
│   ├── api/v1/         # Add new API endpoints here
│   └── main.py         # Modify for app-level changes
├── core/
│   ├── errors.py       # Add new error types here
│   ├── cache.py        # Cache-related utilities
│   └── ...             # Other core utilities
├── services/
│   └── debank.py       # External service integrations
└── tests/
    └── test_*.py       # Add tests here (mirror source structure)
```

### Adding a New Feature

Example: Adding support for Uniswap v2

1. **Create service** (`backend/services/uniswapv2.py`):
```python
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class UniswapV2Service:
    """Service for interacting with Uniswap v2 positions"""

    async def get_positions(self, address: str) -> List[Dict[str, Any]]:
        """Fetch Uniswap v2 positions for address"""
        logger.info(f"Fetching Uniswap v2 positions for {address}")
        # Implementation
        return []
```

2. **Add tests** (`backend/tests/test_uniswapv2.py`):
```python
import pytest
from backend.services.uniswapv2 import UniswapV2Service


@pytest.mark.asyncio
async def test_get_positions():
    service = UniswapV2Service()
    result = await service.get_positions("0x742d35...")
    assert isinstance(result, list)
```

3. **Add API endpoint** (`backend/app/api/v1/uniswapv2.py`):
```python
from fastapi import APIRouter
from backend.services.uniswapv2 import UniswapV2Service

router = APIRouter()


@router.get("/v2/wallet/{address}")
async def get_v2_positions(address: str):
    service = UniswapV2Service()
    return await service.get_positions(address)
```

4. **Register router** (`backend/app/main.py`):
```python
from backend.app.api.v1 import wallet, uniswapv2

app.include_router(wallet.router, prefix="/api/v1", tags=["wallet"])
app.include_router(uniswapv2.router, prefix="/api/v1", tags=["uniswap-v2"])
```

5. **Update docs** (README.md, API docs)

## Questions?

- Check [QUICKSTART.md](QUICKSTART.md) for setup help
- Check [TESTING.md](TESTING.md) for testing help
- Open an issue for questions
- Join our Discord (coming soon)

---

**Thank you for contributing! 🚀**
