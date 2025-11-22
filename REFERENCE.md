# Quick Reference Card

Essential commands and information for DeFi LP Dashboard development.

## 🚀 Quick Commands

```bash
# Setup
./dev.sh setup              # Initial setup
cp .env.example .env        # Create environment file

# Development
./dev.sh start              # Start all services
./dev.sh stop               # Stop all services  
./dev.sh logs               # View logs
./dev.sh test               # Run tests

# Testing
pytest tests/ -v            # Run all tests
pytest tests/test_cache.py  # Run specific test
pytest tests/ --cov=backend # Run with coverage

# Redis
./dev.sh redis              # Open Redis CLI
redis-cli KEYS debank:*     # List cache keys
redis-cli FLUSHALL          # Clear all cache
```

## 🌐 API Endpoints

### Health & Status
```bash
GET  /                      # Service info
GET  /health                # Health check
GET  /docs                  # Swagger UI docs
GET  /redoc                 # ReDoc docs
```

### Wallet Endpoints
```bash
GET  /api/v1/wallet/{address}       # Get wallet positions
GET  /api/v1/wallet/{address}/raw   # Get raw positions (debug)
```

## 📡 Example Requests

### Get Wallet Positions
```bash
curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

### Test Invalid Address
```bash
curl http://localhost:8000/api/v1/wallet/invalid
```

### Health Check
```bash
curl http://localhost:8000/health
```

## 🔧 Environment Variables

```bash
# Required
DEBANK_ACCESS_KEY=your_key_here

# Optional
REDIS_URL=redis://localhost:6379
LOG_LEVEL=INFO
ENVIRONMENT=development
```

## 🐛 Troubleshooting

### Redis connection error
```bash
redis-cli ping              # Check Redis is running
docker-compose up redis     # Start Redis via Docker
```

### Module not found
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

### Tests failing
```bash
redis-cli -n 1 FLUSHALL     # Clear test database
pytest tests/ -v            # Run with verbose output
```

## 📊 HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Wallet positions retrieved |
| 400 | Bad Request | Invalid Ethereum address |
| 429 | Rate Limited | DeBank quota exceeded |
| 503 | Service Unavailable | DeBank API down / Circuit open |
| 500 | Server Error | Unexpected error |

## 🔑 Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `INVALID_ADDRESS` | Bad Ethereum address format | Fix address format |
| `RATE_LIMITED` | API quota exceeded | Wait `retry_after` seconds |
| `SERVICE_UNAVAILABLE` | External service down | Retry later |
| `UNKNOWN` | Unexpected error | Check logs |

## 🎯 Cache Keys

```
debank:wallet:{address}:{timestamp}
debank:wallet:{address}:{timestamp}:stale
```

Example:
```
debank:wallet:0x742d35cc...:202511221800
```

## 📈 Test Coverage

View coverage:
```bash
pytest tests/ --cov=backend --cov-report=html
open backend/htmlcov/index.html
```

Goals:
- Overall: 90%+
- Core: 95%+
- Services: 85%+

## 🔍 Useful Redis Commands

```bash
# Cache inspection
KEYS debank:*                          # List all DeBank keys
GET debank:wallet:0x...:timestamp      # Get cached data
TTL debank:wallet:0x...:timestamp      # Check TTL
FLUSHALL                               # Clear all cache

# Database selection
SELECT 0                               # Production DB
SELECT 1                               # Test DB
```

## 📂 Project Structure

```
backend/
├── app/main.py              # FastAPI app
├── app/api/v1/wallet.py     # Endpoints
├── core/                    # Infrastructure
│   ├── errors.py
│   ├── cache.py
│   ├── retry.py
│   └── config.py
├── services/debank.py       # External APIs
└── tests/                   # Test suite
```

## 🎨 Development Flow

1. **Create branch**: `git checkout -b feature/name`
2. **Write code**: Add feature with tests
3. **Test**: `./dev.sh test`
4. **Format**: `./dev.sh format`
5. **Commit**: `git commit -m "feat: description"`
6. **Push**: `git push origin feature/name`
7. **PR**: Create pull request on GitHub

## 📦 Dependencies

Key packages:
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `httpx` - Async HTTP client
- `redis` - Redis client
- `pydantic` - Validation
- `tenacity` - Retry logic
- `pytest` - Testing
- `pytest-asyncio` - Async tests

## 🔗 Links

- API Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health
- DeBank API: https://debank.com/api
- Uniswap v3: https://app.uniswap.org

---

**Keep this handy for quick reference! 📌**
