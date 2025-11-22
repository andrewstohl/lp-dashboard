#!/usr/bin/env python3
"""
Test multiple wallets to verify the fix works
"""
import asyncio
import sys
sys.path.insert(0, 'backend')

from services.debank import DeBankService

async def test_multiple_wallets():
    """Test with several wallet addresses"""
    test_wallets = [
        ("0x23b50a703d3076b73584df48251931ebf5937ba2", "Original test wallet"),
        # Add more test wallets if you have them
    ]
    
    service = DeBankService(cache=None)
    
    try:
        for address, description in test_wallets:
            print(f"\n{'='*80}")
            print(f"Testing: {description}")
            print(f"Address: {address}")
            print(f"{'='*80}")
            
            result = await service.get_wallet_positions(address)
            positions = result.get('positions', [])
            
            print(f"\nPositions found: {len(positions)}")
            
            if positions:
                for i, pos in enumerate(positions, 1):
                    print(f"\n  Position {i}:")
                    print(f"    Pool: {pos['pool_name']}")
                    print(f"    Chain: {pos.get('chain', 'N/A')}")
                    print(f"    Total Value: ${pos['total_value_usd']:,.2f}")
                    print(f"    Token0: {pos['token0']['symbol']} - {pos['token0']['amount']:.4f} (${pos['token0']['value_usd']:,.2f})")
                    print(f"    Token1: {pos['token1']['symbol']} - {pos['token1']['amount']:.4f} (${pos['token1']['value_usd']:,.2f})")
                    
                    if pos.get('unclaimed_fees_usd', 0) > 0:
                        print(f"    Unclaimed Fees: ${pos['unclaimed_fees_usd']:,.2f}")
                        if pos.get('reward_tokens'):
                            print(f"    Reward tokens:")
                            for reward in pos['reward_tokens']:
                                print(f"      - {reward['symbol']}: {reward['amount']:.6f} (${reward['value_usd']:,.2f})")
            else:
                print("\n  No Uniswap v3 positions found")
                
    finally:
        await service.close()

if __name__ == "__main__":
    asyncio.run(test_multiple_wallets())
