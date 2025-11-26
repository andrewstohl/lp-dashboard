"""
Protocol adapter registry for managing and accessing adapters.
"""

from datetime import datetime
from typing import Dict, List, Optional

from .base import ProtocolAdapter, Transaction


class ProtocolRegistry:
    """Registry for protocol adapters"""
    
    _adapters: Dict[str, ProtocolAdapter] = {}
    
    @classmethod
    def register(cls, adapter: ProtocolAdapter) -> None:
        """Register an adapter"""
        cls._adapters[adapter.protocol_name] = adapter
    
    @classmethod
    def get_adapter(cls, protocol: str) -> Optional[ProtocolAdapter]:
        """Get adapter by protocol name"""
        return cls._adapters.get(protocol)
    
    @classmethod
    def list_protocols(cls) -> List[str]:
        """List all registered protocol names"""
        return list(cls._adapters.keys())
    
    @classmethod
    async def fetch_all_transactions(
        cls,
        wallet_address: str,
        since: datetime,
        until: datetime,
        protocols: Optional[List[str]] = None
    ) -> List[Transaction]:
        """
        Fetch transactions from all (or specified) protocols.
        Returns sorted by timestamp descending (newest first).
        """
        results: List[Transaction] = []
        
        for name, adapter in cls._adapters.items():
            if protocols is None or name in protocols:
                try:
                    txns = await adapter.fetch_transactions(
                        wallet_address, since, until
                    )
                    results.extend(txns)
                except Exception as e:
                    # Log error but continue with other adapters
                    print(f"Error fetching from {name}: {e}")
        
        # Sort by timestamp descending
        return sorted(results, key=lambda t: t.timestamp, reverse=True)


# Re-export base classes
from .base import ProtocolAdapter, Transaction, TokenAmount

# Import and register adapters
from .uniswap_v3 import UniswapV3Adapter
from .gmx_v2 import GmxV2Adapter
from .euler import EulerAdapter

# Register available adapters
ProtocolRegistry.register(UniswapV3Adapter())
ProtocolRegistry.register(GmxV2Adapter())
ProtocolRegistry.register(EulerAdapter())

__all__ = [
    'ProtocolRegistry',
    'ProtocolAdapter', 
    'Transaction',
    'TokenAmount',
    'UniswapV3Adapter',
    'GmxV2Adapter',
    'EulerAdapter'
]
