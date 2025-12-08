from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from backend.core.config import settings
from backend.core.logging_config import setup_logging
from backend.services.debank import close_debank_service
from backend.services.coingecko import close_coingecko_service
from backend.app.api.v1 import wallet
from backend.app.api.v1 import transactions
from backend.app.api.v1 import build
from backend.app.api.v1 import test

# Setup logging
setup_logging(settings.log_level)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    logger.info("Starting LP Dashboard API")
    yield
    logger.info("Shutting down LP Dashboard API")
    await close_debank_service()
    await close_coingecko_service()

app = FastAPI(
    title="LP Dashboard API",
    description="DeFi Liquidity Position Analytics",
    version="0.2.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(wallet.router, prefix="/api/v1", tags=["wallet"])
app.include_router(transactions.router, prefix="/api/v1", tags=["transactions"])
app.include_router(build.router, prefix="/api/v1/build", tags=["build"])
app.include_router(test.router, prefix="/api/v1", tags=["test"])

@app.get("/")
async def root():
    return {
        "status": "operational",
        "service": "LP Dashboard API",
        "version": "0.2.0"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}
