"""
The Graph service for Uniswap V3 pool data
"""
import httpx
from typing import Optional
import os

class TheGraphService:
    """Service to fetch Uniswap V3 data from The Graph"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        # Uniswap V3 Ethereum subgraph
        self.subgraph_url = f"https://gateway.thegraph.com/api/{api_key}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV"
    
    async def get_pool_fee_tier(self, pool_address: str) -> Optional[float]:
        """
        Get the fee tier for a Uniswap V3 pool
        
        Returns:
            Fee tier as percentage (e.g., 0.05 for 0.05% pool)
            None if pool not found
        """
        query = """
        {
          pool(id: "%s") {
            feeTier
          }
        }
        """ % pool_address.lower()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.subgraph_url,
                json={"query": query},
                timeout=30.0
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            pool = data.get("data", {}).get("pool")
            
            if not pool:
                return None
            
            fee_tier = int(pool.get("feeTier", 0))
            # Convert from basis points (500 = 0.05%)
            return fee_tier / 10000
    
    async def get_position_mint_timestamp(self, position_id: str) -> Optional[int]:
        """
        Get the mint timestamp for a specific position
        
        Returns:
            Unix timestamp of when position was minted
            None if position not found
        """
        query = """
        {
          position(id: "%s") {
            id
            transaction {
              timestamp
            }
          }
        }
        """ % position_id
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.subgraph_url,
                json={"query": query},
                timeout=30.0
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            position = data.get("data", {}).get("position")
            
            if not position:
                return None
            
            tx = position.get("transaction", {})
            return int(tx.get("timestamp", 0))
