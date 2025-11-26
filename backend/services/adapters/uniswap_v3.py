"""
Uniswap V3 adapter for fetching LP transactions.
Uses PositionSnapshots to derive transaction history.
"""

import uuid
from datetime import datetime
from typing import List, Optional, Dict
import os

from .base import ProtocolAdapter, Transaction, TokenAmount
from ..thegraph import TheGraphService


class UniswapV3Adapter(ProtocolAdapter):
    """Adapter for Uniswap V3 LP transactions"""
    
    def __init__(self):
        api_key = os.getenv("THEGRAPH_API_KEY", "")
        self.graph_service = TheGraphService(api_key)
    
    @property
    def protocol_name(self) -> str:
        return "uniswap_v3"
    
    @property
    def supported_transaction_types(self) -> List[str]:
        return ["lp_mint", "lp_burn", "lp_collect"]
    
    def extract_position_key(self, raw_tx: dict) -> str:
        """Position key is the NFT token ID"""
        return str(raw_tx.get("position_id", ""))
    
    async def fetch_transactions(
        self,
        wallet_address: str,
        since: datetime,
        until: datetime
    ) -> List[Transaction]:
        """Fetch all LP transactions for wallet in date range"""
        wallet = wallet_address.lower()
        since_ts = int(since.timestamp())
        until_ts = int(until.timestamp())
        
        # Step 1: Get all positions for this wallet
        positions = await self._fetch_positions(wallet)
        
        transactions: List[Transaction] = []
        
        # Step 2: For each position, get snapshots and derive transactions
        for position in positions:
            pos_id = position.get("id", "")
            pos_txns = await self._derive_transactions_from_snapshots(
                pos_id, position, since_ts, until_ts
            )
            transactions.extend(pos_txns)
        
        return sorted(transactions, key=lambda t: t.timestamp, reverse=True)
    
    async def _fetch_positions(self, wallet: str) -> List[Dict]:
        """Fetch all positions owned by wallet"""
        query = """
        {
          positions(where: {owner: "%s"}, first: 100) {
            id
            owner
            liquidity
            pool { id feeTier }
            token0 { symbol decimals derivedETH }
            token1 { symbol decimals derivedETH }
            tickLower { tickIdx }
            tickUpper { tickIdx }
          }
        }
        """ % wallet
        
        data = await self.graph_service._query(query)
        if not data:
            return []
        return data.get("data", {}).get("positions", [])

    async def _derive_transactions_from_snapshots(
        self,
        position_id: str,
        position: Dict,
        since_ts: int,
        until_ts: int
    ) -> List[Transaction]:
        """Get snapshots and derive transactions from deltas"""
        
        # Query snapshots for this position
        query = """
        {
          positionSnapshots(
            where: {
              position: "%s"
              timestamp_gte: %d
              timestamp_lte: %d
            }
            orderBy: timestamp
            orderDirection: asc
            first: 1000
          ) {
            id
            timestamp
            blockNumber
            liquidity
            depositedToken0
            depositedToken1
            withdrawnToken0
            withdrawnToken1
            collectedFeesToken0
            collectedFeesToken1
            transaction { id }
          }
        }
        """ % (position_id, since_ts, until_ts)
        
        data = await self.graph_service._query(query)
        if not data:
            return []
        
        snapshots = data.get("data", {}).get("positionSnapshots", [])
        if not snapshots:
            return []
        
        transactions: List[Transaction] = []
        token0_symbol = position.get("token0", {}).get("symbol", "TOKEN0")
        token1_symbol = position.get("token1", {}).get("symbol", "TOKEN1")
        
        # Also get the snapshot just before our range (for calculating first delta)
        prev_snapshot = await self._get_previous_snapshot(position_id, since_ts)
        
        prev_deposited0 = float(prev_snapshot.get("depositedToken0", 0)) if prev_snapshot else 0
        prev_deposited1 = float(prev_snapshot.get("depositedToken1", 0)) if prev_snapshot else 0
        prev_withdrawn0 = float(prev_snapshot.get("withdrawnToken0", 0)) if prev_snapshot else 0
        prev_withdrawn1 = float(prev_snapshot.get("withdrawnToken1", 0)) if prev_snapshot else 0
        prev_fees0 = float(prev_snapshot.get("collectedFeesToken0", 0)) if prev_snapshot else 0
        prev_fees1 = float(prev_snapshot.get("collectedFeesToken1", 0)) if prev_snapshot else 0
        
        for snap in snapshots:
            curr_deposited0 = float(snap.get("depositedToken0", 0))
            curr_deposited1 = float(snap.get("depositedToken1", 0))
            curr_withdrawn0 = float(snap.get("withdrawnToken0", 0))
            curr_withdrawn1 = float(snap.get("withdrawnToken1", 0))
            curr_fees0 = float(snap.get("collectedFeesToken0", 0))
            curr_fees1 = float(snap.get("collectedFeesToken1", 0))
            
            tx_hash = snap.get("transaction", {}).get("id", "")
            timestamp = int(snap.get("timestamp", 0))
            block_number = int(snap.get("blockNumber", 0))
            
            # Check for mint (deposit increase)
            delta_deposit0 = curr_deposited0 - prev_deposited0
            delta_deposit1 = curr_deposited1 - prev_deposited1
            if delta_deposit0 > 0.0001 or delta_deposit1 > 0.0001:
                tx = self._create_mint_transaction(
                    position_id, tx_hash, timestamp, block_number,
                    token0_symbol, token1_symbol,
                    delta_deposit0, delta_deposit1
                )
                transactions.append(tx)
            
            # Check for burn (withdrawal increase)
            delta_withdrawn0 = curr_withdrawn0 - prev_withdrawn0
            delta_withdrawn1 = curr_withdrawn1 - prev_withdrawn1
            if delta_withdrawn0 > 0.0001 or delta_withdrawn1 > 0.0001:
                tx = self._create_burn_transaction(
                    position_id, tx_hash, timestamp, block_number,
                    token0_symbol, token1_symbol,
                    delta_withdrawn0, delta_withdrawn1
                )
                transactions.append(tx)
            
            # Check for fee collection
            delta_fees0 = curr_fees0 - prev_fees0
            delta_fees1 = curr_fees1 - prev_fees1
            if delta_fees0 > 0.0001 or delta_fees1 > 0.0001:
                tx = self._create_collect_transaction(
                    position_id, tx_hash, timestamp, block_number,
                    token0_symbol, token1_symbol,
                    delta_fees0, delta_fees1
                )
                transactions.append(tx)
            
            # Update prev values
            prev_deposited0, prev_deposited1 = curr_deposited0, curr_deposited1
            prev_withdrawn0, prev_withdrawn1 = curr_withdrawn0, curr_withdrawn1
            prev_fees0, prev_fees1 = curr_fees0, curr_fees1
        
        return transactions

    async def _get_previous_snapshot(
        self,
        position_id: str,
        before_ts: int
    ) -> Optional[Dict]:
        """Get the most recent snapshot before a timestamp"""
        query = """
        {
          positionSnapshots(
            where: {
              position: "%s"
              timestamp_lt: %d
            }
            orderBy: timestamp
            orderDirection: desc
            first: 1
          ) {
            depositedToken0
            depositedToken1
            withdrawnToken0
            withdrawnToken1
            collectedFeesToken0
            collectedFeesToken1
          }
        }
        """ % (position_id, before_ts)
        
        data = await self.graph_service._query(query)
        if not data:
            return None
        
        snapshots = data.get("data", {}).get("positionSnapshots", [])
        return snapshots[0] if snapshots else None
    
    def _create_mint_transaction(
        self,
        position_id: str,
        tx_hash: str,
        timestamp: int,
        block_number: int,
        token0_symbol: str,
        token1_symbol: str,
        amount0: float,
        amount1: float
    ) -> Transaction:
        """Create a mint (add liquidity) transaction"""
        # Estimate USD value - we'll enhance this later with price lookups
        usd_value = 0.0  # TODO: Add price lookup
        
        tokens = []
        if amount0 > 0:
            tokens.append(TokenAmount(
                symbol=token0_symbol,
                amount=amount0,
                usd_value=0,  # TODO
                direction='in'
            ))
        if amount1 > 0:
            tokens.append(TokenAmount(
                symbol=token1_symbol,
                amount=amount1,
                usd_value=0,  # TODO
                direction='in'
            ))
        
        return Transaction(
            id=str(uuid.uuid4()),
            tx_hash=tx_hash,
            log_index=0,
            timestamp=timestamp,
            block_number=block_number,
            protocol="uniswap_v3",
            type="lp_mint",
            position_key=position_id,
            tokens=tokens,
            usd_value=usd_value
        )
    
    def _create_burn_transaction(
        self,
        position_id: str,
        tx_hash: str,
        timestamp: int,
        block_number: int,
        token0_symbol: str,
        token1_symbol: str,
        amount0: float,
        amount1: float
    ) -> Transaction:
        """Create a burn (remove liquidity) transaction"""
        tokens = []
        if amount0 > 0:
            tokens.append(TokenAmount(
                symbol=token0_symbol,
                amount=amount0,
                usd_value=0,
                direction='out'
            ))
        if amount1 > 0:
            tokens.append(TokenAmount(
                symbol=token1_symbol,
                amount=amount1,
                usd_value=0,
                direction='out'
            ))
        
        return Transaction(
            id=str(uuid.uuid4()),
            tx_hash=tx_hash,
            log_index=0,
            timestamp=timestamp,
            block_number=block_number,
            protocol="uniswap_v3",
            type="lp_burn",
            position_key=position_id,
            tokens=tokens,
            usd_value=0
        )
    
    def _create_collect_transaction(
        self,
        position_id: str,
        tx_hash: str,
        timestamp: int,
        block_number: int,
        token0_symbol: str,
        token1_symbol: str,
        amount0: float,
        amount1: float
    ) -> Transaction:
        """Create a collect (fee claim) transaction"""
        tokens = []
        if amount0 > 0:
            tokens.append(TokenAmount(
                symbol=token0_symbol,
                amount=amount0,
                usd_value=0,
                direction='in'
            ))
        if amount1 > 0:
            tokens.append(TokenAmount(
                symbol=token1_symbol,
                amount=amount1,
                usd_value=0,
                direction='in'
            ))
        
        return Transaction(
            id=str(uuid.uuid4()),
            tx_hash=tx_hash,
            log_index=0,
            timestamp=timestamp,
            block_number=block_number,
            protocol="uniswap_v3",
            type="lp_collect",
            position_key=position_id,
            tokens=tokens,
            usd_value=0,
            realized_pnl=0  # Fee claims are realized gains
        )
