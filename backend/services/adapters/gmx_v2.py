"""
GMX V2 adapter for fetching perpetual position transactions.
Fetches position increases and decreases for a wallet address.
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict

from .base import ProtocolAdapter, Transaction, TokenAmount
from ..gmx_subgraph import GMXSubgraphService


class GmxV2Adapter(ProtocolAdapter):
    """Adapter for GMX V2 perpetual position transactions"""
    
    def __init__(self):
        self.gmx_service = GMXSubgraphService()
    
    @property
    def protocol_name(self) -> str:
        return "gmx_v2"
    
    @property
    def supported_transaction_types(self) -> List[str]:
        return ["perp_open", "perp_increase", "perp_decrease", "perp_close"]
    
    def extract_position_key(self, raw_tx: dict) -> str:
        """Position key from GMX"""
        return str(raw_tx.get("positionKey", ""))
    
    async def fetch_transactions(
        self,
        wallet_address: str,
        since: datetime,
        until: datetime
    ) -> List[Transaction]:
        """Fetch all perp transactions for wallet in date range"""
        wallet = wallet_address.lower()
        since_ts = int(since.timestamp())
        until_ts = int(until.timestamp())
        
        transactions: List[Transaction] = []
        
        # Fetch increases and decreases
        increases = await self._fetch_increases(wallet, since_ts, until_ts)
        decreases = await self._fetch_decreases(wallet, since_ts, until_ts)
        
        transactions.extend(increases)
        transactions.extend(decreases)
        
        return sorted(transactions, key=lambda t: t.timestamp, reverse=True)

    async def _fetch_increases(
        self,
        wallet: str,
        since_ts: int,
        until_ts: int
    ) -> List[Transaction]:
        """Fetch position increase transactions"""
        query = """
        {
          positionIncreases(
            where: {
              account: "%s"
              transaction_: {timestamp_gte: %d, timestamp_lte: %d}
            }
            orderBy: transaction__timestamp
            orderDirection: desc
            first: 1000
          ) {
            id
            positionKey
            marketAddress
            collateralTokenAddress
            sizeInUsd
            sizeInTokens
            collateralAmount
            sizeDeltaUsd
            sizeDeltaInTokens
            collateralDeltaAmount
            isLong
            basePnlUsd
            transaction {
              timestamp
              hash
              blockNumber
            }
          }
        }
        """ % (wallet, since_ts, until_ts)
        
        data = await self.gmx_service._query(query)
        if not data:
            return []
        
        increases = data.get("data", {}).get("positionIncreases", [])
        transactions: List[Transaction] = []
        
        for inc in increases:
            tx = self._parse_increase(inc)
            if tx:
                transactions.append(tx)
        
        return transactions
    
    def _parse_increase(self, inc: dict) -> Optional[Transaction]:
        """Parse a position increase into a Transaction"""
        position_key = inc.get("positionKey", "")
        tx_hash = inc.get("transaction", {}).get("hash", "")
        timestamp = int(inc.get("transaction", {}).get("timestamp", 0))
        block_number = int(inc.get("transaction", {}).get("blockNumber", 0))
        
        # Size values (30 decimals for USD)
        size_delta_usd = int(inc.get("sizeDeltaUsd", 0)) / 1e30
        size_usd = int(inc.get("sizeInUsd", 0)) / 1e30
        
        # Collateral (6 decimals for USDC typically)
        collateral_delta = int(inc.get("collateralDeltaAmount", 0)) / 1e6
        
        is_long = inc.get("isLong", False)
        market = self._get_market_symbol(inc.get("marketAddress", ""))
        collateral_token = self._get_token_symbol(inc.get("collateralTokenAddress", ""))
        
        # Determine if this is an open or increase
        # If previous size was 0, it's an open
        prev_size = size_usd - size_delta_usd
        tx_type = "perp_open" if prev_size < 0.01 else "perp_increase"
        
        tokens = []
        if collateral_delta > 0:
            tokens.append(TokenAmount(
                symbol=collateral_token,
                amount=collateral_delta,
                usd_value=collateral_delta,  # USDC is ~$1
                direction='in'  # Collateral going into position
            ))
        
        return Transaction(
            id=str(uuid.uuid4()),
            tx_hash=tx_hash,
            log_index=0,
            timestamp=timestamp,
            block_number=block_number,
            protocol="gmx_v2",
            type=tx_type,
            position_key=position_key,
            tokens=tokens,
            usd_value=size_delta_usd,
        )

    async def _fetch_decreases(
        self,
        wallet: str,
        since_ts: int,
        until_ts: int
    ) -> List[Transaction]:
        """Fetch position decrease transactions"""
        query = """
        {
          positionDecreases(
            where: {
              account: "%s"
              transaction_: {timestamp_gte: %d, timestamp_lte: %d}
            }
            orderBy: transaction__timestamp
            orderDirection: desc
            first: 1000
          ) {
            id
            positionKey
            marketAddress
            collateralTokenAddress
            sizeInUsd
            sizeInTokens
            collateralAmount
            sizeDeltaUsd
            sizeDeltaInTokens
            collateralDeltaAmount
            isLong
            basePnlUsd
            transaction {
              timestamp
              hash
              blockNumber
            }
          }
        }
        """ % (wallet, since_ts, until_ts)
        
        data = await self.gmx_service._query(query)
        if not data:
            return []
        
        decreases = data.get("data", {}).get("positionDecreases", [])
        transactions: List[Transaction] = []
        
        for dec in decreases:
            tx = self._parse_decrease(dec)
            if tx:
                transactions.append(tx)
        
        return transactions
    
    def _parse_decrease(self, dec: dict) -> Optional[Transaction]:
        """Parse a position decrease into a Transaction"""
        position_key = dec.get("positionKey", "")
        tx_hash = dec.get("transaction", {}).get("hash", "")
        timestamp = int(dec.get("transaction", {}).get("timestamp", 0))
        block_number = int(dec.get("transaction", {}).get("blockNumber", 0))
        
        # Size values (30 decimals for USD)
        size_delta_usd = int(dec.get("sizeDeltaUsd", 0)) / 1e30
        size_usd = int(dec.get("sizeInUsd", 0)) / 1e30
        
        # Collateral returned
        collateral_delta = int(dec.get("collateralDeltaAmount", 0)) / 1e6
        
        # Realized PnL
        realized_pnl = int(dec.get("basePnlUsd", 0)) / 1e30
        
        is_long = dec.get("isLong", False)
        market = self._get_market_symbol(dec.get("marketAddress", ""))
        collateral_token = self._get_token_symbol(dec.get("collateralTokenAddress", ""))
        
        # If final size is 0, it's a close
        tx_type = "perp_close" if size_usd < 0.01 else "perp_decrease"
        
        tokens = []
        if collateral_delta > 0:
            tokens.append(TokenAmount(
                symbol=collateral_token,
                amount=collateral_delta,
                usd_value=collateral_delta,
                direction='out'  # Collateral returned from position
            ))
        
        return Transaction(
            id=str(uuid.uuid4()),
            tx_hash=tx_hash,
            log_index=0,
            timestamp=timestamp,
            block_number=block_number,
            protocol="gmx_v2",
            type=tx_type,
            position_key=position_key,
            tokens=tokens,
            usd_value=-size_delta_usd,  # Negative: position size decreasing
            realized_pnl=realized_pnl
        )

    def _get_token_symbol(self, address: str) -> str:
        """Get token symbol from address"""
        tokens = {
            "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH",
            "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": "LINK",
            "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
            "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "WBTC",
            "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a": "GMX",
        }
        return tokens.get(address.lower(), address[:8] + "...")
    
    def _get_market_symbol(self, address: str) -> str:
        """Get market name from address"""
        markets = {
            "0x70d95587d40a2caf56bd97485ab3eec10bee6336": "ETH/USD",
            "0x7f1fa204bb700853d36994da19f830b6ad18455c": "LINK/USD",
            "0x47c031236e19d024b42f8ae6780e44a573170703": "BTC/USD",
        }
        return markets.get(address.lower(), "Unknown")
