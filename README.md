# DeFi LP Intelligence Dashboard

AI-powered analytics platform for Uniswap v3 liquidity providers.

## Features

- **Real-time Position Tracking**: Monitor LP positions across Uniswap v3
- **Intelligent Caching**: Redis-backed caching with stale-while-revalidate pattern (5-minute TTL)
- **Production-Ready Error Handling**: Structured errors with user-friendly messages
- **Circuit Breaker**: Automatic failover when external services are down
- **Comprehensive Testing**: Pytest with async support and coverage reporting
- **Type Safety**: Full Python type hints with Pydantic validation

## Tech Stack

- **Backend**: FastAPI, Python 3.11+, Redis
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS (coming soon)
- **AI**: Kimi K2 (upcoming)
- **Data**: DeBank API, The Graph (Uniswap subgraph)

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.11+
- DeBank API key ([Get one here](https://debank.com/api))

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/lp-dashboard.git
cd lp-dashboard
```

2. Copy environment variables:
```bash
cp .env.example .env
# Edit .env and add your API keys
```

3. Start services with Docker Compose:
```bash
docker-compose up
```

4. Access the application:
- **Frontend Dashboard**: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

### Running Tests

Backend tests:
```bash
cd backend
pip install -r requirements.txt
pytest tests/ --cov=backend
```

## Architecture

```
┌─────────────────────────────────┐
│   FastAPI Backend               │
│  ┌─────────────────────────┐   │
│  │  Error Handling Layer   │   │
│  │  - User-friendly errors │   │
│  │  - Structured responses │   │
│  └────────┬────────────────┘   │
│  ┌────────▼────────────────┐   │
│  │  Circuit Breaker        │   │
│  │  - 3 failures = open    │   │
│  │  - 60s timeout          │   │
│  └────────┬────────────────┘   │
│  ┌────────▼────────────────┐   │
│  │  Redis Cache            │   │
│  │  - 5min TTL (fresh)     │   │
│  │  - 1hr TTL (stale)      │   │
│  └────────┬────────────────┘   │
│  ┌────────▼────────────────┐   │
│  │  DeBank Service         │   │
│  │  - Async HTTP client    │   │
│  │  - Retry on 5xx         │   │
│  │  - Rate limit handling  │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

## API Endpoints

### `GET /api/v1/wallet/{address}`
Get all Uniswap v3 positions for an Ethereum address.

**Example Request:**
```bash
curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "positions": [
      {
        "pool_name": "USDC/WETH",
        "pool_address": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
        "token0": {
          "symbol": "USDC",
          "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          "amount": 1000.0,
          "value_usd": 1000.0
        },
        "token1": {
          "symbol": "WETH",
          "address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          "amount": 0.5,
          "value_usd": 1250.0
        },
        "total_value_usd": 2250.0,
        "daily_fee_24h": 12.5
      }
    ],
    "wallet": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "cached": false,
    "is_stale": false,
    "fetched_at": "2025-11-22T18:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "detail": {
    "error_code": "INVALID_ADDRESS",
    "message": "Invalid Ethereum address format."
  }
}
```

**Error Response (429):**
```json
{
  "detail": {
    "error_code": "RATE_LIMITED",
    "message": "API rate limit reached. Please try again later.",
    "retry_after": 300
  }
}
```

**Error Response (503):**
```json
{
  "detail": {
    "error_code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable. Please try again."
  }
}
```

### `GET /api/v1/wallet/{address}/raw`
Get raw positions without AI analysis (for debugging).

### `GET /health`
Health check endpoint.

## Error Handling

All errors return structured JSON with:
- `error_code`: Machine-readable error code
- `message`: User-friendly error message
- `retry_after`: (Optional) Seconds to wait before retry
- `details`: (Optional) Technical details (dev mode only)

### Error Codes

- `RATE_LIMITED`: DeBank API quota exceeded (100 calls/day limit)
- `INVALID_ADDRESS`: Malformed Ethereum address
- `SERVICE_UNAVAILABLE`: External service down or circuit breaker open
- `UNKNOWN`: Unexpected error

## Caching Strategy

The application uses a **stale-while-revalidate** caching pattern:

1. **Fresh Cache (5 minutes)**: Returns immediately, no API call
2. **Stale Cache (1 hour)**: Returns stale data when API fails
3. **Cache Miss**: Fetches from DeBank API, stores in both caches

This maximizes cache hit rate while staying within DeBank's 100 calls/day limit.

**Cache Key Format:**
```
debank:wallet:{address}:{5min_bucket_timestamp}
```

Example: `debank:wallet:0x742d35cc...:202511221800`

## Development

### Project Structure

```
lp-dashboard/
├── backend/
│   ├── app/
│   │   ├── api/v1/         # API endpoints
│   │   └── main.py         # FastAPI app
│   ├── core/
│   │   ├── config.py       # Configuration
│   │   ├── errors.py       # Error handling
│   │   ├── cache.py        # Redis caching
│   │   ├── retry.py        # Circuit breaker & retry
│   │   └── logging_config.py
│   ├── services/
│   │   └── debank.py       # DeBank API client
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_cache.py
│   │   └── test_debank.py
│   ├── Dockerfile
│   └── requirements.txt
├── .github/
│   └── workflows/
│       └── backend-tests.yml
├── docker-compose.yml
├── .env.example
└── README.md
```

### Environment Variables

See `.env.example` for all configuration options.

Required:
- `DEBANK_ACCESS_KEY`: DeBank API key

Optional:
- `REDIS_URL`: Redis connection URL (default: `redis://localhost:6379`)
- `LOG_LEVEL`: Logging level (default: `INFO`)
- `ENVIRONMENT`: Environment name (default: `development`)

## CI/CD

GitHub Actions automatically runs tests on every push:

- **Backend Tests**: Pytest with coverage reporting
- **Redis Service**: Spins up Redis for integration tests
- **Coverage Report**: Uploaded as artifact

## Roadmap

- [x] **Phase 1**: Foundation & Data Display
  - [x] Backend infrastructure with error handling
  - [x] Redis caching with stale-while-revalidate
  - [x] Circuit breaker & retry logic
  - [x] Comprehensive testing
  - [x] Docker Compose setup
  - [x] GitHub Actions CI/CD
  - [x] Frontend (Next.js)

- [ ] **Phase 2**: AI Agent Infrastructure
  - [ ] Kimi K2 integration
  - [ ] AI agent for LP analysis
  - [ ] Recommendation engine

- [ ] **Phase 3**: Intelligence & Recommendations
  - [ ] Risk scoring
  - [ ] Impermanent loss tracking
  - [ ] Optimization suggestions

- [ ] **Phase 4**: Polish & Scale
  - [ ] Performance optimizations
  - [ ] Advanced analytics
  - [ ] User authentication

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`pytest backend/tests/`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT

## Support

For issues or questions:
- Open an issue on GitHub
- Check the [API documentation](http://localhost:8000/docs)

---

**Built with ❤️ for DeFi liquidity providers**
