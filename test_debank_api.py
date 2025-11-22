#!/usr/bin/env python3
"""
Quick test script to check what DeBank API returns for a wallet
"""
import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from services.debank import DeBankService
from core.config import settings

async def test_wallet(address: str):
    """Test fetching wallet data from DeBank"""
    print(f"\n{'='*80}")
    print(f"Testing DeBank API for wallet: {address}")
    print(f"{'='*80}\n")
    
    # Create service without cache for testing
    service = DeBankService(cache=None)
    
    try:
        # Fetch positions
        result = await service.get_wallet_positions(address)
        
        print(f"\n{'='*80}")
        print("RESULTS:")
        print(f"{'='*80}")
        print(f"Wallet: {result.get('wallet')}")
        print(f"Number of positions: {len(result.get('positions', []))}")
        print(f"Cached: {result.get('cached', False)}")
        
        if result.get('positions'):
            print("\nPositions found:")
            for idx, pos in enumerate(result['positions'], 1):
                print(f"\n  Position {idx}:")
                
                # Check if it's a perpetual position
                if pos.get('type') == 'perpetual':
                    print(f"    Type: Perpetual")
                    print(f"    Protocol: {pos.get('protocol', 'N/A')}")
                    print(f"    Position: {pos.get('position_name')}")
                    print(f"    Side: {pos.get('side')}")
                    print(f"    Base Token: {pos.get('base_token', {}).get('symbol')}")
                    print(f"    Position Size: {pos.get('position_size', 0):.4f}")
                    print(f"    Entry Price: ${pos.get('entry_price', 0):,.2f}")
                    print(f"    Mark Price: ${pos.get('mark_price', 0):,.2f}")
                    print(f"    Liquidation Price: ${pos.get('liquidation_price', 0):,.2f}")
                    print(f"    Leverage: {pos.get('leverage', 0):.2f}x")
                    print(f"    PnL: ${pos.get('pnl_usd', 0):,.2f}")
                    print(f"    Margin: {pos.get('margin_token', {}).get('amount', 0):,.2f} {pos.get('margin_token', {}).get('symbol')}")
                    print(f"    Total Value: ${pos.get('total_value_usd', 0):,.2f}")
                    print(f"    Net Value: ${pos.get('net_value_usd', 0):,.2f}")
                # Otherwise it's an LP position
                else:
                    print(f"    Type: Liquidity Pool")
                    print(f"    Pool: {pos.get('pool_name')}")
                    print(f"    Total Value: ${pos.get('total_value_usd', 0):.2f}")
                    print(f"    Token0: {pos.get('token0', {}).get('symbol')} - {pos.get('token0', {}).get('amount', 0):.4f}")
                    print(f"    Token1: {pos.get('token1', {}).get('symbol')} - {pos.get('token1', {}).get('amount', 0):.4f}")
        else:
            print("\nNo positions found!")
            print("\nPossible reasons:")
            print("  1. The wallet truly has no Uniswap v3 positions")
            print("  2. DeBank returned positions in a different format")
            print("  3. Positions are in other protocols (check logs above)")
        
    except Exception as e:
        print(f"\nERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await service.close()

async def main():
    # Test with the wallet from the conversation
    test_wallet_address = "0x23b50a703d3076b73584df48251931ebf5937ba2"
    
    # Allow overriding with command line argument
    if len(sys.argv) > 1:
        test_wallet_address = sys.argv[1]
    
    await test_wallet(test_wallet_address)

if __name__ == "__main__":
    asyncio.run(main())
