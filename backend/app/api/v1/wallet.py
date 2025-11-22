from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
import logging
from backend.services.debank import get_debank_service, DeBankService
from backend.core.errors import (
    DeBankError, RateLimitError, InvalidAddressError, ServiceUnavailableError, ErrorResponse
)

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/wallet/{address}")
async def get_wallet_positions(
    address: str,
    service: DeBankService = Depends(get_debank_service)
) -> Dict[str, Any]:
    """
    Get all Uniswap v3 positions for a wallet
    """
    try:
        result = await service.get_wallet_positions(address)
        return {
            "status": "success",
            "data": result
        }

    except RateLimitError as e:
        logger.warning(f"Rate limit hit for {address}")
        raise HTTPException(
            status_code=429,
            detail={
                "error_code": e.code,
                "message": e.user_msg,
                "retry_after": e.retry_after
            }
        )

    except InvalidAddressError as e:
        logger.info(f"Invalid address: {address}")
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": e.code,
                "message": e.user_msg
            }
        )

    except ServiceUnavailableError as e:
        logger.error(f"Service unavailable for {address}: {e.details}")
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": e.code,
                "message": e.user_msg
            }
        )

    except Exception as e:
        logger.exception(f"Unexpected error for {address}")
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "UNKNOWN",
                "message": "An unexpected error occurred. Please try again."
            }
        )

@router.get("/wallet/{address}/raw")
async def get_wallet_positions_raw(
    address: str,
    service: DeBankService = Depends(get_debank_service)
) -> Dict[str, Any]:
    """Get raw positions without AI analysis (for debugging)"""
    try:
        result = await service.get_wallet_positions(address)
        return result
    except DeBankError as e:
        raise HTTPException(
            status_code=500 if e.code == "UNKNOWN" else 400,
            detail={"error_code": e.code, "message": e.user_msg}
        )
