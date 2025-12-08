"""
Service to fetch Uniswap V3 pool information.
Uses on-chain RPC calls as fallback when subgraph isn't available.
"""

import httpx
import logging
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Cache for pool info
_pool_cache: Dict[str, Tuple[str, str, str]] = {}

# Public RPC endpoints that work from Docker
RPC_URLS = {
    "eth": "https://ethereum.publicnode.com",
    "arb": "https://arbitrum-one.publicnode.com",
    "base": "https://base.publicnode.com",
    "op": "https://optimism.publicnode.com",
}

# Uniswap V3 Pool ABI (just the functions we need)
POOL_ABI_CALLS = {
    "token0": "0x0dfe1681",  # function selector for token0()
    "token1": "0xd21220a7",  # function selector for token1()
    "fee": "0xddca3f43",      # function selector for fee()
}


async def get_pool_tokens_onchain(pool_address: str, chain: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Fetch token0, token1, and fee directly from the pool contract via RPC.
    """
    rpc_url = RPC_URLS.get(chain)
    if not rpc_url:
        return None, None, None
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Call token0()
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_call",
                    "params": [{
                        "to": pool_address,
                        "data": POOL_ABI_CALLS["token0"]
                    }, "latest"]
                }
            )
            token0_result = response.json().get("result")
            
            # Call token1()
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "eth_call",
                    "params": [{
                        "to": pool_address,
                        "data": POOL_ABI_CALLS["token1"]
                    }, "latest"]
                }
            )
            token1_result = response.json().get("result")
            
            # Call fee()
            response = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "eth_call",
                    "params": [{
                        "to": pool_address,
                        "data": POOL_ABI_CALLS["fee"]
                    }, "latest"]
                }
            )
            fee_result = response.json().get("result")
            
            if token0_result and token1_result and fee_result:
                # Parse results (they're hex encoded addresses/numbers)
                token0 = "0x" + token0_result[-40:]  # Last 40 chars = address
                token1 = "0x" + token1_result[-40:]
                fee_int = int(fee_result, 16)
                fee_percent = f"{fee_int / 10000}%"
                
                return (token0, token1, fee_percent)
    
    except Exception as e:
        logger.error(f"Error fetching pool tokens from RPC: {e}")
    
    return None, None, None


async def get_pool_tokens(pool_address: str, chain: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Fetch token0, token1, and feeTier for a Uniswap V3 pool.
    
    Returns: (token0_address, token1_address, fee_tier) or (None, None, None)
    """
    cache_key = f"{chain}_{pool_address.lower()}"
    
    # Check cache
    if cache_key in _pool_cache:
        return _pool_cache[cache_key]
    
    # Fetch from on-chain
    result = await get_pool_tokens_onchain(pool_address, chain)
    
    if result and result[0]:
        _pool_cache[cache_key] = result
        logger.info(f"Fetched pool info for {pool_address[:10]}... on {chain}")
        return result
    
    return None, None, None
