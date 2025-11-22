#!/usr/bin/env python3
"""
Debug script to see raw DeBank API response
"""
import asyncio
import httpx
import json
import os

DEBANK_BASE_URL = "https://pro-openapi.debank.com/v1"
DEBANK_ACCESS_KEY = "550d6f5c339e8fcdbade6301e9e817384545ce91"

async def test_raw_api(address: str):
    """Fetch raw data from DeBank API"""
    print(f"\nFetching data for wallet: {address}")
    print(f"API: {DEBANK_BASE_URL}/user/all_complex_protocol_list")
    print("=" * 80)
    
    async with httpx.AsyncClient(
        base_url=DEBANK_BASE_URL,
        headers={"AccessKey": DEBANK_ACCESS_KEY},
        timeout=30.0
    ) as client:
        response = await client.get(
            "/user/all_complex_protocol_list",
            params={"id": address.lower()}
        )
        
        print(f"\nStatus Code: {response.status_code}")
        print(f"Headers: {dict(response.headers)}")
        
        data = response.json()
        
        # Save to file
        output_file = "debank_raw_response.json"
        with open(output_file, "w") as f:
            json.dump(data, f, indent=2)
        
        print(f"\n✅ Raw response saved to: {output_file}")
        print(f"\nResponse summary:")
        print(f"  Type: {type(data)}")
        print(f"  Length: {len(data) if isinstance(data, (list, dict)) else 'N/A'}")
        
        if isinstance(data, list):
            print(f"\n  Protocols found: {len(data)}")
            for i, protocol in enumerate(data):
                if isinstance(protocol, dict):
                    protocol_id = protocol.get("id", "UNKNOWN")
                    chain = protocol.get("chain", "UNKNOWN")
                    portfolio_items = protocol.get("portfolio_item_list", [])
                    print(f"\n  Protocol {i+1}:")
                    print(f"    ID: {protocol_id}")
                    print(f"    Chain: {chain}")
                    print(f"    Portfolio Items: {len(portfolio_items)}")
                    
                    # Show keys of first portfolio item if available
                    if portfolio_items and len(portfolio_items) > 0:
                        first_item = portfolio_items[0]
                        print(f"    First item keys: {list(first_item.keys())}")
        
        print(f"\n{'='*80}")
        print(f"Check {output_file} for complete response")
        print(f"{'='*80}\n")

if __name__ == "__main__":
    test_wallet = "0x23b50a703d3076b73584df48251931ebf5937ba2"
    asyncio.run(test_raw_api(test_wallet))
