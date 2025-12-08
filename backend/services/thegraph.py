"""
The Graph service for Uniswap V3 pool data
Replaces DeBank for LP position details - real-time, accurate data
"""
import httpx
import math
from typing import Optional, Dict, Any, List
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)

# Uniswap V3 math constants
Q96 = 2 ** 96
Q192 = 2 ** 192


class TheGraphService:
    """Service to fetch Uniswap V3 data from The Graph"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        # Uniswap V3 Ethereum subgraph
        self.subgraph_url = f"https://gateway.thegraph.com/api/{api_key}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV"
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

    async def _query(self, query: str) -> Optional[Dict]:
        """Execute a GraphQL query"""
        try:
            response = await self.client.post(
                self.subgraph_url,
                json={"query": query}
            )
            if response.status_code != 200:
                logger.error(f"Subgraph query failed: {response.status_code}")
                return None
            return response.json()
        except Exception as e:
            logger.error(f"Subgraph query error: {e}")
            return None


    async def get_eth_price_usd(self) -> float:
        """Get current ETH price in USD from Uniswap pools"""
        query = """
        {
          bundle(id: "1") {
            ethPriceUSD
          }
        }
        """
        data = await self._query(query)
        if not data:
            return 0.0
        bundle = data.get("data", {}).get("bundle")
        if not bundle:
            return 0.0
        return float(bundle.get("ethPriceUSD", 0))

    async def get_positions_by_owner(self, owner_address: str, first: int = 1000) -> List[Dict]:
        """
        Get ALL Uniswap V3 positions owned by a wallet address.
        This is the primary method for comprehensive LP position discovery.

        Args:
            owner_address: The wallet address to query
            first: Maximum number of positions to return (default 1000)

        Returns:
            List of position dictionaries with pool and token info
        """
        query = """
        {
          positions(where: {owner: "%s"}, first: %d, orderBy: id, orderDirection: desc) {
            id
            owner
            liquidity
            tickLower { tickIdx }
            tickUpper { tickIdx }
            depositedToken0
            depositedToken1
            withdrawnToken0
            withdrawnToken1
            collectedFeesToken0
            collectedFeesToken1
            pool {
              id
              feeTier
              sqrtPrice
              tick
              token0 {
                id
                symbol
                decimals
              }
              token1 {
                id
                symbol
                decimals
              }
            }
            transaction {
              id
              timestamp
              blockNumber
            }
          }
        }
        """ % (owner_address.lower(), first)

        data = await self._query(query)
        if not data:
            logger.warning(f"No positions found for {owner_address}")
            return []

        positions = data.get("data", {}).get("positions", [])
        logger.info(f"Found {len(positions)} positions for {owner_address[:10]}...")
        return positions

    async def get_position_history(
        self,
        position_id: str,
        debank_txs: Optional[Dict[str, Dict]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get complete transaction history for a position with USD values.

        STANDARDIZED DATA PIPELINE:
        - Stage 1 (Structure): Subgraph provides position info, snapshots (timestamps, blocks, tx hashes)
        - Stage 2 (Amounts): DeBank provides ALL token amounts (deposits, withdraws, fees)
        - Stage 3 (Prices): Subgraph provides historical prices at block level
        - Stage 4 (Values): Computed as amount * price

        Args:
            position_id: The NFT position ID (e.g., "1128573")
            debank_txs: Dict mapping tx_hash -> DeBank tx data for token amounts.
                       Required for accurate amounts. Without it, falls back to subgraph
                       (which has bugs for fee data).

        Returns:
            Dict with position info, pool info, and transactions list
        """
        # STAGE 1: Get position structure from Subgraph
        query = """
        {
          position(id: "%s") {
            id
            owner
            liquidity
            pool {
              id
              feeTier
              token0 {
                id
                symbol
                decimals
              }
              token1 {
                id
                symbol
                decimals
              }
            }
            tickLower { tickIdx }
            tickUpper { tickIdx }
          }
          positionSnapshots(where: {position: "%s"}, orderBy: timestamp, orderDirection: asc, first: 1000) {
            id
            timestamp
            blockNumber
            transaction {
              id
            }
            liquidity
            depositedToken0
            depositedToken1
            withdrawnToken0
            withdrawnToken1
            collectedFeesToken0
            collectedFeesToken1
          }
        }
        """ % (position_id, position_id)

        data = await self._query(query)
        if not data or not data.get("data", {}).get("position"):
            logger.warning(f"Position {position_id} not found")
            return None

        position = data["data"]["position"]
        snapshots = data["data"].get("positionSnapshots", [])
        pool = position.get("pool", {})
        token0 = pool.get("token0", {})
        token1 = pool.get("token1", {})
        token0_addr = token0.get("id", "").lower()
        token1_addr = token1.get("id", "").lower()

        # Process snapshots into transactions
        transactions = []
        prev_snapshot = None

        for snap in snapshots:
            block_number = int(snap.get("blockNumber", 0))
            timestamp = int(snap.get("timestamp", 0))
            tx_hash = snap.get("transaction", {}).get("id", "") if snap.get("transaction") else ""
            liq = int(snap.get("liquidity", 0))

            # Determine action type from subgraph deltas (structure only)
            if prev_snapshot:
                prev_dep0 = float(prev_snapshot.get("depositedToken0", 0))
                prev_dep1 = float(prev_snapshot.get("depositedToken1", 0))
                prev_wit0 = float(prev_snapshot.get("withdrawnToken0", 0))
                prev_wit1 = float(prev_snapshot.get("withdrawnToken1", 0))
                prev_fee0 = float(prev_snapshot.get("collectedFeesToken0", 0))
                prev_liq = int(prev_snapshot.get("liquidity", 0))

                delta_dep0 = float(snap.get("depositedToken0", 0)) - prev_dep0
                delta_dep1 = float(snap.get("depositedToken1", 0)) - prev_dep1
                delta_wit0 = float(snap.get("withdrawnToken0", 0)) - prev_wit0
                delta_wit1 = float(snap.get("withdrawnToken1", 0)) - prev_wit1
                delta_fee0 = float(snap.get("collectedFeesToken0", 0)) - prev_fee0

                # Determine action type
                if delta_dep0 > 0.0001 or delta_dep1 > 0.0001:
                    action = "Deposit"
                elif delta_fee0 > 0.0001:
                    action = "Collect"
                elif delta_wit0 > 0.0001 or delta_wit1 > 0.0001:
                    action = "Withdraw"
                elif liq == 0 and prev_liq > 0:
                    action = "Burn"
                else:
                    action = "Unknown"
            else:
                # First snapshot is always a deposit (mint)
                action = "Deposit"

            # STAGE 2: Get amounts from DeBank (primary) or Subgraph (fallback)
            amount0 = 0.0
            amount1 = 0.0
            amount_source = "subgraph"  # Default fallback

            if debank_txs and tx_hash.lower() in debank_txs:
                # USE DEBANK FOR ALL AMOUNTS (standardized approach)
                debank_tx = debank_txs[tx_hash.lower()]
                sends = debank_tx.get("sends", [])
                receives = debank_tx.get("receives", [])
                amount_source = "debank"

                if action == "Deposit":
                    # Deposits: user SENDS tokens to pool
                    for send in sends:
                        send_token = send.get("token_id", "").lower()
                        if send_token == token0_addr:
                            amount0 = float(send.get("amount", 0))
                        elif send_token == token1_addr:
                            amount1 = float(send.get("amount", 0))
                elif action in ("Collect", "Withdraw", "Burn"):
                    # Collects/Withdraws: user RECEIVES tokens from pool
                    for recv in receives:
                        recv_token = recv.get("token_id", "").lower()
                        if recv_token == token0_addr:
                            amount0 = float(recv.get("amount", 0))
                        elif recv_token == token1_addr:
                            amount1 = float(recv.get("amount", 0))
            else:
                # FALLBACK: Use subgraph amounts (less reliable for fees)
                if prev_snapshot:
                    if action == "Deposit":
                        amount0 = delta_dep0
                        amount1 = delta_dep1
                    elif action == "Collect":
                        # Subgraph fee data is buggy - only token0 is reliable
                        amount0 = delta_fee0
                        amount1 = 0  # Unreliable
                    elif action in ("Withdraw", "Burn"):
                        amount0 = delta_wit0
                        amount1 = delta_wit1
                else:
                    # First snapshot
                    amount0 = float(snap.get("depositedToken0", 0))
                    amount1 = float(snap.get("depositedToken1", 0))

            # STAGE 3: Get historical prices from Subgraph
            prices = await self._get_token_prices_at_block(
                token0.get("id", ""),
                token1.get("id", ""),
                block_number
            )

            # STAGE 4: Compute USD values
            if prices:
                price0 = prices.get("token0_price", 0)
                price1 = prices.get("token1_price", 0)
                value0 = amount0 * price0
                value1 = amount1 * price1
                total_value = value0 + value1
            else:
                price0 = price1 = value0 = value1 = total_value = 0

            transactions.append({
                "timestamp": timestamp,
                "block_number": block_number,
                "tx_hash": tx_hash,
                "action": action,
                "token0_amount": amount0,
                "token1_amount": amount1,
                "token0_symbol": token0.get("symbol", ""),
                "token1_symbol": token1.get("symbol", ""),
                "token0_price_usd": price0,
                "token1_price_usd": price1,
                "token0_value_usd": value0,
                "token1_value_usd": value1,
                "total_value_usd": total_value,
                "amount_source": amount_source
            })

            prev_snapshot = snap

        # Calculate summary totals
        total_deposited_usd = sum(tx["total_value_usd"] for tx in transactions if tx["action"] == "Deposit")
        total_withdrawn_usd = sum(tx["total_value_usd"] for tx in transactions if tx["action"] in ("Withdraw", "Burn"))
        total_collected_usd = sum(tx["total_value_usd"] for tx in transactions if tx["action"] == "Collect")

        # Count data sources
        debank_count = sum(1 for tx in transactions if tx.get("amount_source") == "debank")
        subgraph_count = len(transactions) - debank_count

        # Current position status
        current_liquidity = int(position.get("liquidity", 0))
        status = "ACTIVE" if current_liquidity > 0 else "CLOSED"

        return {
            "position_id": position_id,
            "status": status,
            "pool": {
                "address": pool.get("id", ""),
                "fee_tier": int(pool.get("feeTier", 0)) / 10000,
                "token0": {
                    "address": token0.get("id", ""),
                    "symbol": token0.get("symbol", ""),
                    "decimals": int(token0.get("decimals", 18))
                },
                "token1": {
                    "address": token1.get("id", ""),
                    "symbol": token1.get("symbol", ""),
                    "decimals": int(token1.get("decimals", 18))
                }
            },
            "transactions": transactions,
            "summary": {
                "total_transactions": len(transactions),
                "total_deposited_usd": total_deposited_usd,
                "total_withdrawn_usd": total_withdrawn_usd,
                "total_fees_collected_usd": total_collected_usd,
                "net_invested_usd": total_deposited_usd - total_withdrawn_usd
            },
            "data_sources": {
                "structure": "subgraph",
                "amounts": "debank" if debank_count == len(transactions) else f"debank ({debank_count}), subgraph ({subgraph_count})",
                "prices": "subgraph",
                "debank_coverage": f"{debank_count}/{len(transactions)} transactions"
            }
        }

    async def get_pool_data(self, pool_address: str) -> Optional[Dict]:
        """
        Get comprehensive pool data including current price and token info
        """
        query = """
        {
          pool(id: "%s") {
            id
            feeTier
            sqrtPrice
            tick
            liquidity
            token0 {
              id
              symbol
              decimals
              derivedETH
            }
            token1 {
              id
              symbol
              decimals
              derivedETH
            }
            token0Price
            token1Price
          }
        }
        """ % pool_address.lower()
        
        data = await self._query(query)
        if not data:
            return None
        return data.get("data", {}).get("pool")

    async def get_position_data(self, position_id: str) -> Optional[Dict]:
        """
        Get comprehensive position data including liquidity and fee info
        """
        query = """
        {
          position(id: "%s") {
            id
            owner
            liquidity
            tickLower {
              tickIdx
            }
            tickUpper {
              tickIdx
            }
            depositedToken0
            depositedToken1
            withdrawnToken0
            withdrawnToken1
            collectedFeesToken0
            collectedFeesToken1
            feeGrowthInside0LastX128
            feeGrowthInside1LastX128
            pool {
              id
              feeTier
              sqrtPrice
              tick
              liquidity
              feeGrowthGlobal0X128
              feeGrowthGlobal1X128
              token0 {
                id
                symbol
                decimals
                derivedETH
              }
              token1 {
                id
                symbol
                decimals
                derivedETH
              }
              token0Price
              token1Price
            }
            transaction {
              id
              timestamp
              blockNumber
            }
          }
        }
        """ % position_id
        
        data = await self._query(query)
        if not data:
            return None
        return data.get("data", {}).get("position")


    def _tick_to_price(self, tick: int) -> float:
        """Convert tick to price ratio"""
        return 1.0001 ** tick

    def _calculate_token_amounts(
        self,
        liquidity: int,
        sqrt_price_x96: int,
        tick_lower: int,
        tick_upper: int,
        current_tick: int,
        decimals0: int,
        decimals1: int
    ) -> tuple:
        """
        Calculate token amounts from liquidity using Uniswap V3 math
        
        Returns:
            (amount0, amount1) as floats adjusted for decimals
        """
        sqrt_price = sqrt_price_x96 / Q96
        sqrt_price_lower = math.sqrt(self._tick_to_price(tick_lower))
        sqrt_price_upper = math.sqrt(self._tick_to_price(tick_upper))
        
        if current_tick < tick_lower:
            # Position is entirely in token0
            amount0 = liquidity * (1/sqrt_price_lower - 1/sqrt_price_upper)
            amount1 = 0
        elif current_tick >= tick_upper:
            # Position is entirely in token1
            amount0 = 0
            amount1 = liquidity * (sqrt_price_upper - sqrt_price_lower)
        else:
            # Position is in range
            amount0 = liquidity * (1/sqrt_price - 1/sqrt_price_upper)
            amount1 = liquidity * (sqrt_price - sqrt_price_lower)
        
        # Adjust for decimals
        amount0_adjusted = amount0 / (10 ** decimals0)
        amount1_adjusted = amount1 / (10 ** decimals1)
        
        return (amount0_adjusted, amount1_adjusted)

    async def get_full_position(self, position_id: str) -> Optional[Dict[str, Any]]:
        """
        Get fully enriched position data with calculated token amounts and USD values
        
        This is the main method that replaces DeBank for LP position data
        """
        # Get position data
        position = await self.get_position_data(position_id)
        if not position:
            logger.warning(f"Position {position_id} not found in subgraph")
            return None
        
        # Get ETH price for USD conversion
        eth_price_usd = await self.get_eth_price_usd()
        
        pool = position.get("pool", {})
        token0 = pool.get("token0", {})
        token1 = pool.get("token1", {})
        
        # Extract values
        liquidity = int(position.get("liquidity", 0))
        sqrt_price_x96 = int(pool.get("sqrtPrice", 0))
        current_tick = int(pool.get("tick", 0))
        tick_lower = int(position.get("tickLower", {}).get("tickIdx", 0))
        tick_upper = int(position.get("tickUpper", {}).get("tickIdx", 0))
        decimals0 = int(token0.get("decimals", 18))
        decimals1 = int(token1.get("decimals", 18))
        
        # Calculate current token amounts
        amount0, amount1 = self._calculate_token_amounts(
            liquidity, sqrt_price_x96, tick_lower, tick_upper, 
            current_tick, decimals0, decimals1
        )
        
        # Get token prices in USD
        token0_derived_eth = float(token0.get("derivedETH", 0))
        token1_derived_eth = float(token1.get("derivedETH", 0))
        token0_price_usd = token0_derived_eth * eth_price_usd
        token1_price_usd = token1_derived_eth * eth_price_usd
        
        # Calculate USD values
        value0_usd = amount0 * token0_price_usd
        value1_usd = amount1 * token1_price_usd
        total_value_usd = value0_usd + value1_usd
        
        # Get fee tier
        fee_tier = int(pool.get("feeTier", 0)) / 10000
        
        # Get deposited/withdrawn amounts for initial calculation
        deposited0 = float(position.get("depositedToken0", 0))
        deposited1 = float(position.get("depositedToken1", 0))
        withdrawn0 = float(position.get("withdrawnToken0", 0))
        withdrawn1 = float(position.get("withdrawnToken1", 0))
        collected_fees0 = float(position.get("collectedFeesToken0", 0))
        collected_fees1 = float(position.get("collectedFeesToken1", 0))
        
        # Net deposits (what was put in minus what was taken out, excluding fees)
        net_deposited0 = deposited0 - withdrawn0
        net_deposited1 = deposited1 - withdrawn1
        
        # Mint timestamp
        mint_timestamp = int(position.get("transaction", {}).get("timestamp", 0))
        
        # Check if position is in range
        in_range = tick_lower <= current_tick < tick_upper
        
        return {
            "position_id": position_id,
            "pool_address": pool.get("id", ""),
            "pool_name": f"{token0.get('symbol', 'UNK')}/{token1.get('symbol', 'UNK')}",
            "chain": "eth",
            "fee_tier": fee_tier,
            "in_range": in_range,
            "tick_lower": tick_lower,
            "tick_upper": tick_upper,
            "current_tick": current_tick,
            "liquidity": str(liquidity),
            "token0": {
                "symbol": token0.get("symbol", ""),
                "address": token0.get("id", ""),
                "decimals": decimals0,
                "amount": amount0,
                "price": token0_price_usd,
                "value_usd": value0_usd
            },
            "token1": {
                "symbol": token1.get("symbol", ""),
                "address": token1.get("id", ""),
                "decimals": decimals1,
                "amount": amount1,
                "price": token1_price_usd,
                "value_usd": value1_usd
            },
            "total_value_usd": total_value_usd,
            "initial_deposits": {
                "token0": {
                    "amount": net_deposited0,
                    "value_usd": 0  # Will calculate with historical prices
                },
                "token1": {
                    "amount": net_deposited1,
                    "value_usd": 0  # Will calculate with historical prices
                }
            },
            "collected_fees": {
                "token0": collected_fees0,
                "token1": collected_fees1,
                "total_usd": (collected_fees0 * token0_price_usd) + (collected_fees1 * token1_price_usd)
            },
            "position_mint_timestamp": mint_timestamp,
            "eth_price_usd": eth_price_usd
        }


    async def get_position_transactions(self, position_id: str) -> Dict[str, List]:
        """
        Get transaction summary for a position.
        
        Note: The V3 subgraph doesn't support direct position filtering on mints/burns.
        The position entity already has aggregated depositedToken0/1, withdrawnToken0/1,
        and collectedFeesToken0/1 which is what we use for calculations.
        
        This method returns the aggregated data from the position entity.
        """
        position = await self.get_position_data(position_id)
        if not position:
            return {"mints": [], "burns": [], "collects": [], "summary": {}}
        
        # Extract aggregated transaction data from position entity
        summary = {
            "deposited_token0": float(position.get("depositedToken0", 0)),
            "deposited_token1": float(position.get("depositedToken1", 0)),
            "withdrawn_token0": float(position.get("withdrawnToken0", 0)),
            "withdrawn_token1": float(position.get("withdrawnToken1", 0)),
            "collected_fees_token0": float(position.get("collectedFeesToken0", 0)),
            "collected_fees_token1": float(position.get("collectedFeesToken1", 0)),
            "mint_timestamp": int(position.get("transaction", {}).get("timestamp", 0)),
            "mint_block": int(position.get("transaction", {}).get("blockNumber", 0))
        }
        
        return {
            "mints": [],  # Individual transactions not available via position filter
            "burns": [],
            "collects": [],
            "summary": summary
        }

    async def get_historical_token_price(
        self, 
        token_address: str, 
        block_number: int
    ) -> Optional[float]:
        """
        Get token price in USD at a specific block
        """
        query = """
        {
          token(id: "%s", block: {number: %d}) {
            derivedETH
          }
          bundle(id: "1", block: {number: %d}) {
            ethPriceUSD
          }
        }
        """ % (token_address.lower(), block_number, block_number)
        
        data = await self._query(query)
        if not data:
            return None
        
        token = data.get("data", {}).get("token")
        bundle = data.get("data", {}).get("bundle")
        
        if not token or not bundle:
            return None
        
        derived_eth = float(token.get("derivedETH", 0))
        eth_price = float(bundle.get("ethPriceUSD", 0))
        
        return derived_eth * eth_price

    async def get_block_for_timestamp(self, timestamp: int) -> Optional[int]:
        """
        Get approximate block number for a timestamp
        Uses Ethereum's ~12 second block time
        """
        # Query a recent block to get current block/timestamp
        query = """
        {
          _meta {
            block {
              number
              timestamp
            }
          }
        }
        """
        data = await self._query(query)
        if not data:
            return None
        
        meta = data.get("data", {}).get("_meta", {}).get("block", {})
        current_block = int(meta.get("number", 0))
        current_timestamp = int(meta.get("timestamp", 0))
        
        if current_block == 0 or current_timestamp == 0:
            return None
        
        # Estimate block difference (12 seconds per block on Ethereum)
        time_diff = current_timestamp - timestamp
        block_diff = time_diff // 12
        
        estimated_block = current_block - block_diff
        return max(1, estimated_block)


    async def get_position_mint_values(
        self,
        owner_address: str,
        pool_address: str,
        min_block: int = 0,
        token0_address: str = None,
        token1_address: str = None
    ) -> Dict[str, Any]:
        """
        Get all mint transactions for an owner in a pool with per-token USD values.
        Calculates each token's value at the exact block of each mint using subgraph prices.
        
        Args:
            owner_address: Wallet address
            pool_address: Pool contract address
            min_block: Only include mints from this block onwards
            token0_address: Address of token0 for price lookups
            token1_address: Address of token1 for price lookups
        
        Returns:
            Dict with token0_usd, token1_usd, total_usd, token amounts, and mint details
        """
        query = """
        {
          mints(
            where: {origin: "%s", pool: "%s"}
            orderBy: timestamp
            orderDirection: asc
            first: 100
          ) {
            id
            timestamp
            amount0
            amount1
            amountUSD
            transaction {
              blockNumber
            }
          }
        }
        """ % (owner_address.lower(), pool_address.lower())
        
        data = await self._query(query)
        if not data:
            return {"token0_usd": 0, "token1_usd": 0, "total_usd": 0, "token0_total": 0, "token1_total": 0, "mints": []}
        
        mints = data.get("data", {}).get("mints", [])
        
        token0_usd_total = 0.0
        token1_usd_total = 0.0
        token0_total = 0.0
        token1_total = 0.0
        mint_details = []
        
        for mint in mints:
            block = int(mint.get("transaction", {}).get("blockNumber", 0))
            if min_block > 0 and block < min_block:
                continue
                
            amount0 = float(mint.get("amount0", 0))
            amount1 = float(mint.get("amount1", 0))
            
            token0_total += amount0
            token1_total += amount1
            
            # Get actual token prices at this specific block
            token0_value = 0.0
            token1_value = 0.0
            
            if token0_address and token1_address:
                prices = await self._get_token_prices_at_block(
                    token0_address, token1_address, block
                )
                if prices:
                    token0_value = amount0 * prices["token0_price"]
                    token1_value = amount1 * prices["token1_price"]
            
            token0_usd_total += token0_value
            token1_usd_total += token1_value
            
            mint_details.append({
                "timestamp": int(mint.get("timestamp", 0)),
                "block": block,
                "amount0": amount0,
                "amount1": amount1,
                "token0_usd": token0_value,
                "token1_usd": token1_value
            })
        
        return {
            "token0_usd": token0_usd_total,
            "token1_usd": token1_usd_total,
            "total_usd": token0_usd_total + token1_usd_total,
            "token0_total": token0_total,
            "token1_total": token1_total,
            "mints": mint_details
        }
    
    async def _get_token_prices_at_block(
        self,
        token0_address: str,
        token1_address: str,
        block_number: int
    ) -> Optional[Dict[str, float]]:
        """Get token prices in USD at a specific block."""
        query = """
        {
          bundle(id: "1", block: {number: %d}) {
            ethPriceUSD
          }
          token0: token(id: "%s", block: {number: %d}) {
            derivedETH
          }
          token1: token(id: "%s", block: {number: %d}) {
            derivedETH
          }
        }
        """ % (block_number, token0_address.lower(), block_number, token1_address.lower(), block_number)
        
        data = await self._query(query)
        if not data or "data" not in data:
            return None
        
        bundle = data["data"].get("bundle", {})
        eth_price = float(bundle.get("ethPriceUSD", 0))
        
        token0_data = data["data"].get("token0", {})
        token1_data = data["data"].get("token1", {})
        
        token0_derived = float(token0_data.get("derivedETH", 0)) if token0_data else 0
        token1_derived = float(token1_data.get("derivedETH", 0)) if token1_data else 0
        
        return {
            "token0_price": token0_derived * eth_price,
            "token1_price": token1_derived * eth_price,
            "eth_price": eth_price
        }

    async def get_position_with_historical_values(
        self, 
        position_id: str,
        coingecko_service=None,
        owner_address: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get full position data with historical USD values for initial deposits.
        
        Uses the subgraph's amountUSD recorded at time of each mint transaction,
        which is more accurate than retrospective price lookups.
        
        Args:
            position_id: The NFT position ID
            coingecko_service: Optional CoinGecko service (not used, kept for compatibility)
            owner_address: Wallet address that owns the position (required for accurate values)
        """
        # Get current position data
        position = await self.get_full_position(position_id)
        if not position:
            return None
        
        # Get transaction summary
        transactions = await self.get_position_transactions(position_id)
        summary = transactions.get("summary", {})
        
        # Get historical USD values from mint transactions
        initial_value0_usd = 0.0
        initial_value1_usd = 0.0
        total_initial_usd = 0.0
        mint_count = 0
        
        if owner_address and position.get("pool_address"):
            # Get the position's creation block to filter mints
            mint_block = summary.get("mint_block", 0)
            
            # Get per-token USD values calculated at each mint's block
            mint_values = await self.get_position_mint_values(
                owner_address, 
                position["pool_address"],
                min_block=mint_block,
                token0_address=position["token0"]["address"],
                token1_address=position["token1"]["address"]
            )
            
            # Use properly calculated per-token USD values
            initial_value0_usd = mint_values["token0_usd"]
            initial_value1_usd = mint_values["token1_usd"]
            total_initial_usd = mint_values["total_usd"]
            mint_count = len(mint_values["mints"])
        
        # Update position with historical values
        position["initial_deposits"]["token0"]["value_usd"] = initial_value0_usd
        position["initial_deposits"]["token1"]["value_usd"] = initial_value1_usd
        position["initial_total_value_usd"] = total_initial_usd
        position["gas_fees_usd"] = 0.0  # Would need separate gas tracking
        position["transaction_count"] = max(1, mint_count)
        position["transaction_summary"] = summary
        
        return position

    # Legacy methods for backward compatibility
    async def get_pool_fee_tier(self, pool_address: str) -> Optional[float]:
        """Get the fee tier for a Uniswap V3 pool"""
        pool = await self.get_pool_data(pool_address)
        if not pool:
            return None
        fee_tier = int(pool.get("feeTier", 0))
        return fee_tier / 10000

    async def get_position_mint_timestamp(self, position_id: str) -> Optional[int]:
        """Get the mint timestamp for a specific position"""
        position = await self.get_position_data(position_id)
        if not position:
            return None
        tx = position.get("transaction", {})
        return int(tx.get("timestamp", 0))


    async def get_unclaimed_fees(self, position_id: str) -> Dict[str, float]:
        """
        Calculate unclaimed fees for a position
        
        Note: The subgraph tracks collectedFeesToken0/1 (what's been claimed)
        The unclaimed fees need to be calculated from fee growth
        
        For simplicity, we use the reward_tokens approach similar to DeBank
        by querying the position's tokensOwed fields if available,
        or estimating from fee growth deltas.
        """
        position = await self.get_position_data(position_id)
        if not position:
            return {"token0": 0.0, "token1": 0.0, "total_usd": 0.0}
        
        pool = position.get("pool", {})
        token0 = pool.get("token0", {})
        token1 = pool.get("token1", {})
        
        # Get ETH price for USD conversion
        eth_price_usd = await self.get_eth_price_usd()
        
        # Get token prices
        token0_price = float(token0.get("derivedETH", 0)) * eth_price_usd
        token1_price = float(token1.get("derivedETH", 0)) * eth_price_usd
        
        # The subgraph position entity has depositedToken0/1 and withdrawnToken0/1
        # Unclaimed fees = (deposited - withdrawn + current_amount) - collected
        # But this is complex because current_amount changes with price
        
        # For now, we'll estimate based on the pool's fee growth
        # This is a simplified calculation - production would need on-chain call
        
        # Get collected fees (already claimed)
        collected0 = float(position.get("collectedFeesToken0", 0))
        collected1 = float(position.get("collectedFeesToken1", 0))
        
        # The deposited/withdrawn delta minus current holdings gives approximate fees
        deposited0 = float(position.get("depositedToken0", 0))
        deposited1 = float(position.get("depositedToken1", 0))
        withdrawn0 = float(position.get("withdrawnToken0", 0))
        withdrawn1 = float(position.get("withdrawnToken1", 0))
        
        # For accurate unclaimed fees, we'd need to call the NFT Position Manager
        # contract directly. For now, return the collected fees info.
        # The unclaimed will be calculated when we integrate with the contract
        
        return {
            "token0": 0.0,  # Will be populated by contract call
            "token1": 0.0,  # Will be populated by contract call
            "collected_token0": collected0,
            "collected_token1": collected1,
            "total_usd": 0.0,
            "collected_usd": (collected0 * token0_price) + (collected1 * token1_price)
        }
