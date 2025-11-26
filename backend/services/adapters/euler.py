"""
Euler Finance adapter for fetching lending/borrowing transactions.
STUB: Returns empty list until full implementation.

Euler V2 Subgraph Documentation:
https://docs.euler.finance/developers/data-querying/subgraphs/

Key queries for future implementation:
- trackingActiveAccount: Get deposits and borrows for a wallet
- eulerVaults: Get vault information (rates, caps, collaterals)
- vaultStatuses: Historical vault state data

Goldsky endpoints (more reliable than The Graph hosted):
- Ethereum: https://api.goldsky.com/api/public/.../euler-v2-ethereum/gn
- Arbitrum: https://api.goldsky.com/api/public/.../euler-v2-arbitrum/gn

Transaction types to implement:
- euler_deposit: Supply assets to vault
- euler_withdraw: Remove assets from vault  
- euler_borrow: Borrow against collateral
- euler_repay: Repay borrowed assets
- euler_liquidation: Position liquidated
"""

import uuid
from datetime import datetime
from typing import List

from .base import ProtocolAdapter, Transaction


class EulerAdapter(ProtocolAdapter):
    """Adapter for Euler Finance lending/borrowing transactions (STUB)"""
    
    def __init__(self):
        # TODO: Initialize with Goldsky endpoint
        # self.subgraph_url = "https://api.goldsky.com/api/public/.../euler-v2-ethereum/gn"
        pass
    
    @property
    def protocol_name(self) -> str:
        return "euler"
    
    @property
    def supported_transaction_types(self) -> List[str]:
        return [
            "euler_deposit",
            "euler_withdraw", 
            "euler_borrow",
            "euler_repay",
            "euler_liquidation"
        ]
    
    def extract_position_key(self, raw_tx: dict) -> str:
        """Position key: combination of subaccount + vault address"""
        subaccount = raw_tx.get("subaccount", "")
        vault = raw_tx.get("vault", "")
        return f"{subaccount}:{vault}"
    
    async def fetch_transactions(
        self,
        wallet_address: str,
        since: datetime,
        until: datetime
    ) -> List[Transaction]:
        """
        STUB: Returns empty list.
        
        Future implementation will:
        1. Query trackingActiveAccount for wallet's positions
        2. Parse deposit/borrow entries to get vault addresses
        3. Query vault events for transaction history
        4. Convert to standardized Transaction format
        """
        # TODO: Implement Euler transaction fetching
        return []
