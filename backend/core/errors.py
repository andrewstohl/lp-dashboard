from enum import Enum
from pydantic import BaseModel
from typing import Optional

class ErrorCode(str, Enum):
    RATE_LIMITED = "RATE_LIMITED"
    INVALID_ADDRESS = "INVALID_ADDRESS"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    CACHE_MISS = "CACHE_MISS"
    NETWORK_ERROR = "NETWORK_ERROR"
    UNKNOWN = "UNKNOWN"

class ErrorResponse(BaseModel):
    error_code: ErrorCode
    message: str  # User-friendly message
    details: Optional[str] = None  # Technical details (only in dev mode)
    retry_after: Optional[int] = None  # Seconds to wait before retry
    cached_data: Optional[dict] = None  # Stale data if available

# Custom Exception Classes
class DeBankError(Exception):
    def __init__(self, code: ErrorCode, user_msg: str, details: str = None):
        self.code = code
        self.user_msg = user_msg
        self.details = details
        super().__init__(user_msg)

class RateLimitError(DeBankError):
    def __init__(self, retry_after: int = 300):
        super().__init__(
            ErrorCode.RATE_LIMITED,
            "API rate limit reached. Please try again later.",
            f"DeBank API rate limit: 100 calls/day exceeded"
        )
        self.retry_after = retry_after

class InvalidAddressError(DeBankError):
    def __init__(self, address: str):
        super().__init__(
            ErrorCode.INVALID_ADDRESS,
            "Invalid Ethereum address format.",
            f"Address {address} does not match 0x[40 hex chars]"
        )

class ServiceUnavailableError(DeBankError):
    def __init__(self, service: str):
        super().__init__(
            ErrorCode.SERVICE_UNAVAILABLE,
            "Service temporarily unavailable. Please try again.",
            f"{service} is unreachable or circuit breaker is open"
        )
