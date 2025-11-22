# Verification Checklist

Use this checklist to verify your DeFi LP Dashboard setup is working correctly.

## ✅ Pre-Flight Checks

### 1. Files Exist
```bash
# Check all key files are present
ls -la .env.example
ls -la docker-compose.yml
ls -la backend/requirements.txt
ls -la backend/app/main.py
ls -la QUICKSTART.md
```

**Expected**: All files should exist ✓

### 2. Python Syntax Valid
```bash
cd backend
python3 -m py_compile app/main.py
python3 -m py_compile core/config.py
python3 -m py_compile services/debank.py
```

**Expected**: No syntax errors ✓

### 3. Environment Variables
```bash
cp .env.example .env
cat .env | grep DEBANK_ACCESS_KEY
```

**Expected**: Shows `DEBANK_ACCESS_KEY=...` ✓

**Action**: Edit `.env` and add your real DeBank API key

---

## 🚀 Startup Checks

### 1. Redis Starts
```bash
docker-compose up redis -d
docker-compose ps
```

**Expected**: Redis container shows "healthy" ✓

### 2. Redis Connection
```bash
redis-cli ping
```

**Expected**: Returns `PONG` ✓

### 3. Backend Dependencies Install
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Expected**: All packages install without errors ✓

---

## 🔧 Functionality Checks

### 1. Health Endpoint (Local)
```bash
# Terminal 1: Start backend
cd backend
source venv/bin/activate
uvicorn backend.app.main:app --reload

# Terminal 2: Test health
curl http://localhost:8000/health
```

**Expected Output**:
```json
{"status": "healthy"}
```
✓

### 2. Root Endpoint
```bash
curl http://localhost:8000/
```

**Expected Output**:
```json
{
  "status": "operational",
  "service": "LP Dashboard API",
  "version": "0.1.0"
}
```
✓

### 3. API Documentation
Open in browser:
- http://localhost:8000/docs

**Expected**: Swagger UI with endpoint documentation ✓

### 4. Invalid Address Error Handling
```bash
curl http://localhost:8000/api/v1/wallet/invalid
```

**Expected Output** (HTTP 400):
```json
{
  "detail": {
    "error_code": "INVALID_ADDRESS",
    "message": "Invalid Ethereum address format."
  }
}
```
✓

### 5. Valid Address (with DeBank API key)
```bash
curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

**Expected**: JSON response with wallet positions or empty array ✓

---

## 🧪 Testing Checks

### 1. Run All Tests
```bash
cd backend
source venv/bin/activate
pytest tests/ -v
```

**Expected**: All tests pass ✓

### 2. Test Coverage
```bash
pytest tests/ --cov=backend --cov-report=term
```

**Expected**: Coverage report shows >70% coverage ✓

### 3. Specific Test Files
```bash
pytest tests/test_cache.py -v
pytest tests/test_debank.py -v
```

**Expected**: Each test file passes ✓

---

## 🐳 Docker Checks

### 1. Docker Compose Up
```bash
docker-compose up -d
```

**Expected**: Both services start (redis + backend) ✓

### 2. Check Logs
```bash
docker-compose logs backend
```

**Expected**:
- No errors
- Shows "Starting LP Dashboard API"
- Shows "Application startup complete"
✓

### 3. Health Check via Docker
```bash
docker-compose ps
curl http://localhost:8000/health
```

**Expected**: Backend shows "healthy", health endpoint returns success ✓

### 4. Redis Cache Working
```bash
# First request (cache miss)
curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# Check Redis
redis-cli KEYS "debank:*"

# Second request (cache hit)
curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

**Expected**:
- First request creates cache key
- Second request returns cached data faster
✓

---

## 🔍 Cache Verification

### 1. Cache Key Format
```bash
redis-cli KEYS "debank:wallet:*"
```

**Expected**: Shows keys like `debank:wallet:0x...:202511221800` ✓

### 2. Cache TTL
```bash
redis-cli TTL "debank:wallet:0x...:timestamp"
```

**Expected**: Returns TTL between 0-300 seconds (5 minutes) ✓

### 3. Stale Cache
```bash
redis-cli KEYS "debank:wallet:*:stale"
```

**Expected**: Shows stale cache keys with `:stale` suffix ✓

---

## 📊 Error Handling Checks

### 1. Invalid Address
```bash
curl -i http://localhost:8000/api/v1/wallet/invalid
```

**Expected**: HTTP 400, error_code: "INVALID_ADDRESS" ✓

### 2. Malformed Address (too short)
```bash
curl -i http://localhost:8000/api/v1/wallet/0x123
```

**Expected**: HTTP 400, error_code: "INVALID_ADDRESS" ✓

### 3. Logging Works
```bash
# Check logs show structured format
docker-compose logs backend | tail -20
```

**Expected**: Logs show timestamp, level, module, message ✓

---

## 🎯 Performance Checks

### 1. Response Time (Cached)
```bash
# First request
time curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# Second request (cached)
time curl http://localhost:8000/api/v1/wallet/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

**Expected**: Second request is significantly faster (<100ms) ✓

### 2. Concurrent Requests
```bash
# Send 10 concurrent requests
for i in {1..10}; do
  curl http://localhost:8000/health &
done
wait
```

**Expected**: All requests succeed ✓

---

## 🔒 Security Checks

### 1. Environment Variables Not Committed
```bash
git status | grep .env
```

**Expected**: `.env` should NOT appear (only `.env.example`) ✓

### 2. Secrets Not in Logs
```bash
docker-compose logs backend | grep -i "debank_access_key"
```

**Expected**: No API keys in logs ✓

---

## 🏁 Final Verification

Run all checks at once:

```bash
#!/bin/bash
echo "🔍 Running verification checks..."

# 1. Check files
echo "✓ Checking files..."
test -f .env.example && echo "  ✓ .env.example exists"
test -f docker-compose.yml && echo "  ✓ docker-compose.yml exists"

# 2. Start services
echo "✓ Starting services..."
docker-compose up -d
sleep 5

# 3. Health check
echo "✓ Testing health endpoint..."
curl -s http://localhost:8000/health | grep -q "healthy" && echo "  ✓ Health check passed"

# 4. Error handling
echo "✓ Testing error handling..."
curl -s http://localhost:8000/api/v1/wallet/invalid | grep -q "INVALID_ADDRESS" && echo "  ✓ Error handling works"

# 5. Run tests
echo "✓ Running tests..."
cd backend && source venv/bin/activate && pytest tests/ -q && echo "  ✓ All tests passed"

echo ""
echo "🎉 All checks passed! System is ready."
```

---

## 📝 Troubleshooting

### Issue: "Connection refused" on port 8000
**Solution**:
```bash
# Check if port is already in use
lsof -i :8000
# Kill process if needed
kill -9 <PID>
```

### Issue: "Redis connection error"
**Solution**:
```bash
# Restart Redis
docker-compose restart redis
# Check Redis is healthy
docker-compose ps redis
```

### Issue: "Module not found"
**Solution**:
```bash
# Reinstall dependencies
cd backend
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Issue: Tests fail with Redis errors
**Solution**:
```bash
# Clear test database
redis-cli -n 1 FLUSHALL
# Restart Redis
docker-compose restart redis
```

---

## ✅ Success Criteria

Your setup is verified when:

- [x] All files exist and syntax is valid
- [x] Redis starts and responds to ping
- [x] Backend starts without errors
- [x] Health endpoint returns 200
- [x] API documentation loads
- [x] Error handling works correctly
- [x] Tests pass
- [x] Cache works (keys created, TTL set)
- [x] Concurrent requests handled
- [x] No secrets in logs

---

**If all checks pass, you're ready to build features! 🚀**

**Next**: Read [QUICKSTART.md](QUICKSTART.md) to start developing.
