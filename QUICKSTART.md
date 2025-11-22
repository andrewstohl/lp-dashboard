# Quick Start Guide

This guide will help you get the DeFi LP Dashboard running locally in under 5 minutes.

## Prerequisites

- Python 3.11+ installed
- Redis installed locally OR Docker (for Redis)
- DeBank API key

## Option 1: Docker Compose (Recommended)

### 1. Set up environment
```bash
cp .env.example .env
# Edit .env and add your DEBANK_ACCESS_KEY
```

### 2. Start all services
```bash
docker-compose up
```

### 3. Access the API
- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

### 4. Test an endpoint
```bash
# Test with a valid Ethereum address
curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# Test health endpoint
curl http://localhost:8000/health
```

---

## Option 2: Local Development (No Docker)

### 1. Install Redis
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Check Redis is running
redis-cli ping  # Should return PONG
```

### 2. Set up Python environment
```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure environment
```bash
cd ..
cp .env.example .env
# Edit .env and add your DEBANK_ACCESS_KEY
```

### 4. Run the backend
```bash
cd backend
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Test the API
```bash
# In another terminal
curl http://localhost:8000/health
```

---

## Running Tests

### With Docker
```bash
docker-compose run backend pytest tests/ -v
```

### Locally
```bash
cd backend
source venv/bin/activate
pytest tests/ --cov=backend --cov-report=html --cov-report=term
```

View coverage report:
```bash
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
```

---

## Example API Requests

### Get wallet positions
```bash
# Replace with a real Ethereum address
curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

### Get raw positions (debugging)
```bash
curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/raw
```

### Test invalid address (should return 400)
```bash
curl http://localhost:8000/api/v1/wallet/invalid_address
```

### Test caching
```bash
# First request - cache miss, fetches from DeBank
time curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# Second request (within 5 minutes) - cache hit, instant response
time curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

---

## Monitoring Redis Cache

### Check cache keys
```bash
redis-cli

# List all keys
KEYS *

# Get a specific key
GET debank:wallet:0x742d35cc6634c0532925a3b844bc9e7595f0beb:*

# Check TTL
TTL debank:wallet:0x742d35cc6634c0532925a3b844bc9e7595f0beb:*

# Clear all cache
FLUSHALL
```

---

## Troubleshooting

### Error: "DeBank API key must be set"
- Make sure you've copied `.env.example` to `.env`
- Add your real DeBank API key to `DEBANK_ACCESS_KEY`
- Restart the backend service

### Error: "Connection refused" (Redis)
- Make sure Redis is running: `redis-cli ping`
- Check REDIS_URL in `.env` matches your Redis instance
- Default: `redis://localhost:6379`

### Error: "Module not found"
- Make sure you're in the correct directory
- Activate virtual environment: `source venv/bin/activate`
- Reinstall dependencies: `pip install -r requirements.txt`

### Tests failing
- Make sure Redis is running
- Use test database: Tests automatically use Redis DB 1
- Clear test database: `redis-cli -n 1 FLUSHALL`

---

## Understanding the Response

### Successful Response
```json
{
  "status": "success",
  "data": {
    "positions": [...],
    "wallet": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "cached": false,        // true if from cache
    "is_stale": false,      // true if stale cache used
    "fetched_at": "2025-11-22T18:00:00.000Z"
  }
}
```

### Error Response
```json
{
  "detail": {
    "error_code": "INVALID_ADDRESS",
    "message": "Invalid Ethereum address format.",
    "retry_after": 300  // Only present for rate limit errors
  }
}
```

---

## Next Steps

1. **Get a real DeBank API key**: https://debank.com/api
2. **Test with real wallet addresses**: Find Uniswap v3 LPs on DeBank
3. **Monitor cache hit rates**: Check Redis to see caching in action
4. **Run tests**: Ensure everything works correctly
5. **Build frontend**: Start Phase 1 (Frontend) from the roadmap

---

## Useful Commands

```bash
# View logs (Docker)
docker-compose logs -f backend

# Restart services (Docker)
docker-compose restart

# Stop services (Docker)
docker-compose down

# Stop and remove volumes (Docker)
docker-compose down -v

# Run specific test file
pytest tests/test_cache.py -v

# Run tests with coverage
pytest tests/ --cov=backend --cov-report=term-missing

# Check code style (if you add linting)
black backend/
flake8 backend/
mypy backend/
```

---

## API Documentation

Once the backend is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

These provide interactive API documentation where you can test endpoints directly in your browser.

---

**Need help?** Check the main [README.md](README.md) or open an issue on GitHub.
