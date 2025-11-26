"""
Base adapter class for protocol-specific transaction fetching.
All protocol adapters (Uniswap, GMX, AAVE, etc.) implement this interface.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


@dataclass
class TokenAmount:
    """Token details within a transaction"""
    symbol: str
    amount: float
    usd_value: float
    direction: str  # 'in' or 'out'


@dataclass
class Transaction:
    """Standardized transaction format returned by all adapters"""
    # Identity
    id: str                          # Internal UUID (generated)
    tx_hash: str                     # On-chain transaction hash
    log_index: int                   # For uniqueness within tx
    timestamp: int                   # Unix timestamp
    block_number: int                # For historical price lookups
    
    # Classification
    protocol: str                    # 'uniswap_v3', 'gmx_v2', 'aave'
    type: str                        # 'lp_mint', 'perp_open', etc.
    
    # Position linkage
    position_key: str                # LP token ID, perp position key, etc.
    
    # Token details
    tokens: List[TokenAmount] = field(default_factory=list)
    
    # Value
    usd_value: float = 0.0           # Net USD value
    realized_pnl: Optional[float] = None
    fees: Optional[float] = None
    
    # Reconciliation status (set by frontend, not adapter)
    status: str = 'unreconciled'
    position_id: Optional[str] = None


class ProtocolAdapter(ABC):
    """Abstract base class for protocol-specific adapters"""
    
    @property
    @abstractmethod
    def protocol_name(self) -> str:
        """Return protocol identifier (e.g., 'uniswap_v3')"""
        pass
    
    @property
    @abstractmethod
    def supported_transaction_types(self) -> List[str]:
        """Return list of transaction types this adapter handles"""
        pass
    
    @abstractmethod
    async def fetch_transactions(
        self,
        wallet_address: str,
        since: datetime,
        until: datetime
    ) -> List[Transaction]:
        """Fetch all transactions for wallet in date range"""
        pass
    
    @abstractmethod
    def extract_position_key(self, raw_tx: dict) -> str:
        """Extract unique position identifier from raw transaction data"""
        pass
