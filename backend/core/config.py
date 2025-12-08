from pydantic_settings import BaseSettings
from pydantic import Field, validator

class Settings(BaseSettings):
    # API Keys
    kimi_api_key: str = Field(default="", description="Kimi K2 API key")
    debank_access_key: str = Field(default="", description="DeBank API access key")
    coingecko_api_key: str = Field(default="", description="CoinGecko API key")
    thegraph_api_key: str = Field(default="", description="The Graph API key")

    # URLs
    uniswap_subgraph_url: str = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3"

    # Backend
    backend_host: str = "0.0.0.0"
    backend_port: int = 8004
    environment: str = Field(default="development", description="dev/staging/production")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379", description="Redis connection URL")

    # Logging
    log_level: str = Field(default="INFO", description="Logging level")

    @validator("debank_access_key")
    def validate_debank_key(cls, v):
        # Allow empty key for development - will be required when fetching transactions
        return v or ""

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
