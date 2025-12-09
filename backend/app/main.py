from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import logging

from backend.core.config import settings
from backend.core.logging_config import setup_logging
from backend.services.debank import close_debank_service
from backend.services.coingecko import close_coingecko_service
from backend.app.api.v1 import wallet
from backend.app.api.v1 import transactions
from backend.app.api.v1 import build

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

# CORS - configured via CORS_ORIGINS env var, defaults to localhost in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Validation error handler for debugging
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = None
    try:
        body = await request.json()
    except Exception:
        pass
    logger.error(f"Validation error on {request.url.path}: {exc.errors()}")
    logger.error(f"Request body was: {body}")
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "body": body,
        },
    )


# Routes
app.include_router(wallet.router, prefix="/api/v1", tags=["wallet"])
app.include_router(transactions.router, prefix="/api/v1", tags=["transactions"])
app.include_router(build.router, prefix="/api/v1", tags=["build"])

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
