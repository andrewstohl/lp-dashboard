from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    retry_if_not_exception_type
)
import httpx
from datetime import datetime, timedelta
from backend.core.errors import ServiceUnavailableError

class CircuitBreaker:
    """Simple circuit breaker to prevent cascade failures"""
    def __init__(self, failure_threshold: int = 3, timeout_seconds: int = 60):
        self.failure_threshold = failure_threshold
        self.timeout = timedelta(seconds=timeout_seconds)
        self.failures = 0
        self.last_failure_time = None
        self.state = "closed"  # closed, open, half_open

    def record_success(self):
        """Reset on success"""
        self.failures = 0
        self.state = "closed"
        self.last_failure_time = None

    def record_failure(self):
        """Increment failure count"""
        self.failures += 1
        self.last_failure_time = datetime.utcnow()
        if self.failures >= self.failure_threshold:
            self.state = "open"

    def can_attempt(self) -> bool:
        """Check if we can make a request"""
        if self.state == "closed":
            return True

        if self.state == "open":
            # Check if timeout has passed
            if datetime.utcnow() - self.last_failure_time > self.timeout:
                self.state = "half_open"
                return True
            return False

        # half_open state - allow one request to test
        return True

    def __call__(self, func):
        """Decorator to wrap functions with circuit breaker"""
        def wrapper(*args, **kwargs):
            if not self.can_attempt():
                raise ServiceUnavailableError("Circuit breaker is open")

            try:
                result = func(*args, **kwargs)
                self.record_success()
                return result
            except Exception as e:
                self.record_failure()
                raise
        return wrapper

# Retry decorator for API calls (don't retry on 4xx errors)
def retry_on_5xx():
    return retry(
        retry=retry_if_not_exception_type((httpx.HTTPStatusError,)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        reraise=True
    )
