import logging
from typing import Dict, List, Any, Optional
from backend.services.debank import DeBankService
from backend.services.coingecko import CoinGeckoService

logger = logging.getLogger(__name__)


class PositionEnrichmentService:
    """
    Enriches position data with historical prices and calculated P&L
    """
    
    def __init__(self, debank: DeBankService, coingecko: CoinGeckoService):
        self.debank = debank
        self.coingecko = coingecko

    async def enrich_lp_position(
        self, 
        position: Dict[str, Any], 
        wallet: str
    ) -> Dict[str, Any]:
        """
        Enrich an LP position with initial deposit values and fees
        
        Adds:
        - initial_deposits: token amounts and USD values at time of deposit
        - claimed_fees: fees that have been claimed
        - gas_fees_usd: total gas spent on this position
        """
        pool_address = position.get("pool_address", "")
        
        # Get transaction history for this position
        tx_data = await self.debank.get_uniswap_transactions(wallet, pool_address)
        
        # Calculate initial deposits from mint + increase transactions
        initial_token0_amount = 0.0
        initial_token1_amount = 0.0
        initial_token0_value = 0.0
        initial_token1_value = 0.0
        
        token0_address = position.get("token0", {}).get("address", "").lower()
        token1_address = position.get("token1", {}).get("address", "").lower()
        
        # Process mint transactions
        for tx in tx_data.get("mint_transactions", []):
            timestamp = tx.get("timestamp", 0)
            sends = tx.get("sends", [])
            
            # Get historical prices at this timestamp
            prices = await self.coingecko.get_historical_prices_batch(
                [token0_address, token1_address],
                timestamp
            )
            
            for send in sends:
                token_addr = send.get("token_id", "").lower()
                amount = float(send.get("amount", 0))
                
                if token_addr == token0_address:
                    initial_token0_amount += amount
                    price = prices.get(token0_address, position.get("token0", {}).get("price", 0))
                    initial_token0_value += amount * price
                elif token_addr == token1_address:
                    initial_token1_amount += amount
                    price = prices.get(token1_address, position.get("token1", {}).get("price", 0))
                    initial_token1_value += amount * price
        
        # Process increaseLiquidity transactions
        for tx in tx_data.get("increase_transactions", []):
            timestamp = tx.get("timestamp", 0)
            sends = tx.get("sends", [])
            
            prices = await self.coingecko.get_historical_prices_batch(
                [token0_address, token1_address],
                timestamp
            )
            
            for send in sends:
                token_addr = send.get("token_id", "").lower()
                amount = float(send.get("amount", 0))
                
                if token_addr == token0_address:
                    initial_token0_amount += amount
                    price = prices.get(token0_address, position.get("token0", {}).get("price", 0))
                    initial_token0_value += amount * price
                elif token_addr == token1_address:
                    initial_token1_amount += amount
                    price = prices.get(token1_address, position.get("token1", {}).get("price", 0))
                    initial_token1_value += amount * price
        
        # Calculate claimed fees from collect transactions
        claimed_token0 = 0.0
        claimed_token1 = 0.0
        claimed_token0_value = 0.0
        claimed_token1_value = 0.0
        
        for tx in tx_data.get("collect_transactions", []):
            timestamp = tx.get("timestamp", 0)
            receives = tx.get("receives", [])
            
            prices = await self.coingecko.get_historical_prices_batch(
                [token0_address, token1_address],
                timestamp
            )
            
            for receive in receives:
                token_addr = receive.get("token_id", "").lower()
                amount = float(receive.get("amount", 0))
                
                if token_addr == token0_address:
                    claimed_token0 += amount
                    price = prices.get(token0_address, position.get("token0", {}).get("price", 0))
                    claimed_token0_value += amount * price
                elif token_addr == token1_address:
                    claimed_token1 += amount
                    price = prices.get(token1_address, position.get("token1", {}).get("price", 0))
                    claimed_token1_value += amount * price
        
        # Add enriched data to position
        position["initial_deposits"] = {
            "token0": {
                "amount": initial_token0_amount,
                "value_usd": initial_token0_value
            },
            "token1": {
                "amount": initial_token1_amount,
                "value_usd": initial_token1_value
            },
            "total_value_usd": initial_token0_value + initial_token1_value
        }
        
        position["claimed_fees"] = {
            "token0": claimed_token0_value,
            "token1": claimed_token1_value,
            "total_value_usd": claimed_token0_value + claimed_token1_value
        }
        
        position["gas_fees_usd"] = tx_data.get("total_gas_usd", 0.0)
        
        logger.info(f"Enriched LP position {position.get('pool_name')}: "
                   f"initial=${initial_token0_value + initial_token1_value:.2f}, "
                   f"claimed_fees=${claimed_token0_value + claimed_token1_value:.2f}, "
                   f"gas=${tx_data.get('total_gas_usd', 0):.2f}")
        
        return position

    async def enrich_perp_position(
        self,
        position: Dict[str, Any],
        gmx_rewards: Dict[str, Any],
        wallet: str
    ) -> Dict[str, Any]:
        """
        Enrich a perpetual position with initial margin and funding rewards
        
        Adds:
        - initial_margin_usd: initial margin deposited
        - funding_rewards_usd: funding/rewards earned
        """
        base_token = position.get("base_token", {}).get("symbol", "")
        
        # Initial margin is already in the position data from DeBank
        margin_token = position.get("margin_token", {})
        position["initial_margin_usd"] = margin_token.get("value_usd", 0)
        
        # Allocate GMX rewards to this position based on base token
        rewards = gmx_rewards.get("rewards", [])
        funding = 0.0
        
        for reward in rewards:
            reward_symbol = reward.get("symbol", "")
            reward_value = reward.get("value_usd", 0)
            
            # Allocate rewards matching base token or USDC
            if reward_symbol == base_token:
                funding += reward_value
            elif reward_symbol == "USDC":
                # Split USDC rewards proportionally (simplified: 50/50 for now)
                funding += reward_value * 0.5
        
        position["funding_rewards_usd"] = funding
        
        logger.info(f"Enriched perp {position.get('position_name')}: "
                   f"margin=${position['initial_margin_usd']:.2f}, "
                   f"funding=${funding:.2f}")
        
        return position

    async def enrich_all_positions(
        self,
        positions: List[Dict[str, Any]],
        wallet: str
    ) -> List[Dict[str, Any]]:
        """
        Enrich all positions with historical data
        """
        # Get GMX rewards for perp enrichment
        gmx_rewards = await self.debank.get_gmx_rewards(wallet)
        
        # Get total GMX gas fees
        gmx_tx_data = await self.debank.get_gmx_transactions(wallet)
        total_gmx_gas = gmx_tx_data.get("total_gas_usd", 0)
        
        enriched = []
        for position in positions:
            if position.get("type") == "perpetual":
                enriched_pos = await self.enrich_perp_position(
                    position, gmx_rewards, wallet
                )
            else:
                # LP position
                enriched_pos = await self.enrich_lp_position(position, wallet)
            
            enriched.append(enriched_pos)
        
        return enriched


# Global service instance
_enrichment_service: Optional[PositionEnrichmentService] = None


async def get_enrichment_service() -> PositionEnrichmentService:
    global _enrichment_service
    if _enrichment_service is None:
        from backend.services.debank import get_debank_service
        from backend.services.coingecko import get_coingecko_service
        
        debank = await get_debank_service()
        coingecko = await get_coingecko_service()
        _enrichment_service = PositionEnrichmentService(debank, coingecko)
    
    return _enrichment_service
