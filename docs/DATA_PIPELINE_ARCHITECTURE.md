# LP Dashboard Data Pipeline Architecture

## Executive Summary

This document defines the standardized data pipeline for the LP Dashboard, mapping how data flows from source APIs through to the Ledger display. The goal is to establish a **single source of truth** for each data field and eliminate ad-hoc fixes that break the system.

**Key Principle**: The Test page already implements the correct, standardized approach. The Ledger page should consume the same data structures.

---

## 1. Data Sources Overview

### 1.1 Primary Data Sources

| Source | Purpose | Data Types |
|--------|---------|------------|
| **Uniswap V3 Subgraph** | LP position discovery, historical prices | Positions, pool data, token prices at block |
| **GMX V2 Subgraph** | Perp position discovery, trade history | Trades, execution prices, realized P&L |
| **DeBank API** | Transaction discovery, unclaimed fees, live positions | Wallet positions, transaction history |

### 1.2 What Each Source Is Best At

| Data Field | Best Source | Why |
|------------|-------------|-----|
| LP Position Discovery | Uniswap Subgraph | DeBank returns Position Manager address, not pool addresses |
| LP Token Amounts | DeBank | Subgraph has bugs in fee collection data |
| LP Historical Prices | Uniswap Subgraph | `derivedETH * ethPriceUSD` at any block |
| LP Unclaimed Fees | DeBank | Real-time from position state |
| GMX Trade Discovery | GMX Subgraph | Self-contained, no DeBank needed |
| GMX Execution Price | GMX Subgraph | `executionPrice / 10^(30 - decimals)` |
| GMX Realized P&L | GMX Subgraph | `basePnlUsd` on decrease events |
| GMX Unrealized P&L | DeBank (live positions) | Real-time position state |
| Current Prices | Subgraphs | `derivedETH * ethPriceUSD` (current block) |

### 1.3 Why NOT CoinGecko

CoinGecko was incorrectly added for unrealized P&L calculation. This was wrong because:

1. **Inconsistent with established patterns**: Test page never uses CoinGecko
2. **Subgraphs are better**: Both Uniswap and GMX subgraphs provide `derivedETH * ethPriceUSD` for accurate current prices
3. **Additional dependency**: CoinGecko adds latency, rate limits, and a potential failure point
4. **Different price sources**: Mixing CoinGecko prices with subgraph prices creates inconsistencies

---

## 2. LP Position Data Pipeline

### 2.1 Test Page LP Flow (CORRECT)

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Uniswap Subgraph  │     │     DeBank API      │     │    Test Page UI     │
│                     │     │                     │     │                     │
│  get_positions_by_  │────▶│  discover_          │────▶│   PoolGroup[]       │
│  owner()            │     │  transactions()     │     │   LPPosition[]      │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
         │                           │
         │                           │
         ▼                           ▼
  Position Structure          Token Amounts
  Pool Info                   Unclaimed Fees
  Historical Prices           Transaction History
```

### 2.2 Test Page LP Data Structure

```typescript
// From backend: /api/v1/test/uniswap-lp
interface LPPosition {
  position_id: string;
  status: "ACTIVE" | "CLOSED";
  liquidity: string;
  deposited_token0: number;
  deposited_token1: number;
  mint_timestamp: number;
}

interface PoolGroup {
  pool_address: string;
  token0_symbol: string;
  token1_symbol: string;
  fee_tier: string;          // "0.05%"
  chain_name: string;
  positions: LPPosition[];
}
```

### 2.3 Test Page Position History

```typescript
// From backend: /api/v1/test/position-history/{id}
interface LPPositionHistory {
  position_id: string;
  status: string;
  pool: {
    address: string;
    fee_tier: number;        // 0.0005
    token0: { address: string; symbol: string; decimals: number };
    token1: { address: string; symbol: string; decimals: number };
  };
  transactions: LPTransaction[];
  summary: {
    total_deposited_usd: number;      // Sum of Deposit transactions
    total_withdrawn_usd: number;      // Sum of Withdraw/Burn transactions
    total_fees_collected_usd: number; // Sum of Collect transactions
    net_invested_usd: number;         // deposited - withdrawn
  };
  data_sources: {
    structure: "subgraph";
    amounts: "debank" | "subgraph";
    prices: "subgraph";
  };
}

interface LPTransaction {
  timestamp: number;
  block_number: number;
  tx_hash: string;
  action: "Deposit" | "Withdraw" | "Collect" | "Burn";
  token0_amount: number;        // FROM DEBANK
  token1_amount: number;        // FROM DEBANK
  token0_price_usd: number;     // FROM SUBGRAPH (at block)
  token1_price_usd: number;     // FROM SUBGRAPH (at block)
  token0_value_usd: number;     // COMPUTED: amount * price
  token1_value_usd: number;     // COMPUTED: amount * price
  total_value_usd: number;      // COMPUTED: token0 + token1
  amount_source: "debank" | "subgraph";
}
```

### 2.4 Ledger Page LP Requirements

The LedgerMatrix expects:

```typescript
interface LPPosition {
  pool_name: string;                    // "LINK/WETH"
  pool_address: string;
  position_index: string;               // position_id
  chain: string;                        // "eth"
  fee_tier: number;                     // 0.0005 (numeric)

  // Current State (from subgraph get_full_position)
  token0: {
    symbol: string;
    address: string;
    amount: number;                     // Current amount in pool
    price: number;                      // Current USD price
    value_usd: number;                  // amount * price
  };
  token1: { /* same structure */ };
  total_value_usd: number;              // Current total value

  // Historical Values (from position history)
  initial_deposits: {
    token0: { amount: number; value_usd: number };
    token1: { amount: number; value_usd: number };
  };
  initial_total_value_usd: number;      // Sum of initial deposits

  // Fees (claimed from history, unclaimed from DeBank)
  claimed_fees: {
    token0: number;                     // USD from Collect transactions
    token1: number;
    total: number;
  };
  unclaimed_fees_usd: number;           // FROM DEBANK (real-time)

  // Metadata
  gas_fees_usd: number;
  transaction_count: number;
}
```

### 2.5 LP Field Mapping

| LedgerMatrix Field | Source | Method |
|--------------------|--------|--------|
| `pool_name` | Subgraph | `token0.symbol + "/" + token1.symbol` |
| `pool_address` | Subgraph | `pool.id` |
| `position_index` | Subgraph | `position.id` |
| `fee_tier` | Subgraph | `pool.feeTier / 10000` |
| `token0.amount` | Subgraph | `_calculate_token_amounts()` |
| `token0.price` | Subgraph | `derivedETH * ethPriceUSD` |
| `token0.value_usd` | Computed | `amount * price` |
| `initial_deposits.token0.amount` | Subgraph | `depositedToken0 - withdrawnToken0` |
| `initial_deposits.token0.value_usd` | Subgraph | Historical price at mint block |
| `claimed_fees.token0` | History | Sum of Collect transactions token0_value_usd |
| `unclaimed_fees_usd` | DeBank | `position.unclaimed_fees_usd` |

---

## 3. GMX Perp Data Pipeline

### 3.1 Test Page GMX Flow (CORRECT)

```
┌─────────────────────┐     ┌─────────────────────┐
│   GMX V2 Subgraph   │     │    Test Page UI     │
│                     │     │                     │
│  get_all_trades()   │────▶│   GMXTrade[]        │
│                     │     │   (flat list)       │
└─────────────────────┘     └─────────────────────┘
         │
         │
         ▼
  Position Key (groups trades)
  Execution Price (from subgraph)
  basePnlUsd (realized P&L)
  sizeDeltaUsd, sizeInUsd
  collateralAmount
```

### 3.2 Test Page GMX Data Structure

```typescript
// From backend: /api/v1/test/gmx-trades
interface GMXTrade {
  timestamp: number;
  tx_hash: string;
  position_key: string;              // Groups trades into positions
  market_address: string;
  market: string;                    // "ETH", "BTC", "LINK"
  market_name: string;               // "ETH/USD [1]"
  side: "Long" | "Short";
  is_long: boolean;
  action: "Open" | "Increase" | "Decrease" | "Close";
  size_delta_usd: number;            // FROM SUBGRAPH: sizeDeltaUsd / 1e30
  size_after_usd: number;            // FROM SUBGRAPH: sizeInUsd / 1e30
  collateral_usd: number;            // FROM SUBGRAPH: collateralAmount / 1e6
  execution_price: number;           // FROM SUBGRAPH: executionPrice / precision
  pnl_usd: number;                   // FROM SUBGRAPH: basePnlUsd / 1e30
  fees_usd: number;
}
```

### 3.3 Strategy GMX Item (Saved to localStorage)

```typescript
interface StrategyGMXTradeItem {
  type: "gmx_trade";
  tx_hash: string;                   // Unique identifier
  position_key: string;              // For aggregation
  market: string;                    // "ETH"
  market_address: string;
  side: string;                      // "Long" | "Short"
  action: string;                    // "Open" | "Close" etc.
  size_delta_usd: number;            // Position size change
  collateral_usd: number;            // Initial margin
  execution_price: number;           // FROM SUBGRAPH
  pnl_usd: number;                   // Realized P&L from subgraph
  timestamp: number;
}
```

### 3.4 Ledger Page Perp Requirements

The LedgerMatrix expects:

```typescript
interface PerpetualPosition {
  type: "perpetual";
  protocol: string;                  // "GMX V2"
  position_name: string;             // "ETH/USD"
  chain: string;                     // "arb"
  side: "Long" | "Short";

  // Size & Value
  base_token: {
    symbol: string;                  // "ETH"
    address: string;
    price: number;                   // Current/mark price
  };
  margin_token: {
    symbol: string;                  // "USDC"
    address: string;
    amount: number;
    price: number;
    value_usd: number;
  };
  position_size: number;             // Size in tokens
  position_value_usd: number;        // Size in USD
  entry_price: number;               // Weighted average entry
  mark_price: number;                // Current price (for unrealized P&L)
  liquidation_price: number;
  leverage: number;

  // P&L
  pnl_usd: number;                   // UNREALIZED P&L
  realized_pnl_usd: number;          // From closed trades

  // Metadata
  initial_margin_usd: number;        // From first Open trade
  funding_rewards_usd: number;
  position_index: string;            // position_key
  status: "ACTIVE" | "CLOSED";
  trade_count: number;
}
```

### 3.5 GMX Field Mapping

| LedgerMatrix Field | Source | Method |
|--------------------|--------|--------|
| `position_name` | Strategy Item | `market + "/USD"` |
| `side` | Strategy Item | Directly from saved trade |
| `entry_price` | Aggregation | Weighted avg from Open/Increase trades |
| `position_size` | Aggregation | `total_size_usd / entry_price` |
| `position_value_usd` | Aggregation | Sum of size_delta_usd (net) |
| `initial_margin_usd` | First Open | `collateral_usd` from first Open trade |
| `realized_pnl_usd` | Aggregation | Sum of `pnl_usd` from Decrease/Close |
| `pnl_usd` (unrealized) | **See Section 4** | Requires live price |
| `mark_price` | **See Section 4** | Current asset price |
| `status` | Aggregation | "ACTIVE" if `position_value_usd > 0.01` |

---

## 4. Unrealized P&L: The Correct Approach

### 4.1 The Problem

For **closed positions**, we have complete data:
- Entry price (from Open/Increase trades)
- Exit price (from Decrease/Close trades)
- Realized P&L (from `basePnlUsd` in subgraph)

For **active positions**, we need:
- Current mark price (NOT in strategy data)
- Entry price (from trade aggregation)
- Position size (from trade aggregation)

### 4.2 Options for Mark Price

| Option | Source | Pros | Cons |
|--------|--------|------|------|
| GMX Subgraph | `tokenPrice` query | Consistent with other data | Additional query |
| Uniswap Subgraph | `derivedETH * ethPriceUSD` | Already used for LP | Different price feed |
| DeBank | Live position state | Has unrealized P&L directly | Need to fetch full positions |
| CoinGecko | External API | Simple | **WRONG** - inconsistent source |

### 4.3 Recommended Approach: DeBank Live Positions

For **active** strategy positions, fetch live data from DeBank:

```python
# In strategy/load endpoint:
async def load_strategy_for_ledger(request):
    # 1. Aggregate GMX trades from strategy
    aggregated_perps = aggregate_gmx_trades_to_positions(gmx_items)

    # 2. For ACTIVE positions, enrich with DeBank live data
    if has_active_positions(aggregated_perps):
        debank = await get_debank_service()
        live_positions = await debank.get_wallet_positions(wallet)

        # Match by position characteristics (market, side)
        for perp in aggregated_perps:
            if perp["status"] == "ACTIVE":
                live_match = find_matching_debank_position(
                    live_positions,
                    perp["market"],
                    perp["side"]
                )
                if live_match:
                    perp["pnl_usd"] = live_match["pnl_usd"]  # Unrealized
                    perp["mark_price"] = live_match["base_token"]["price"]
```

### 4.4 Alternative: GMX Subgraph Token Prices

```python
# Query GMX subgraph for token prices
async def get_gmx_mark_prices(markets: List[str]) -> Dict[str, float]:
    """
    GMX stores prices as: price * 10^(30 - tokenDecimals)
    """
    query = """
    {
      tokenPrice(id: "0x82af49...") {  # WETH
        minPrice
        maxPrice
      }
    }
    """
    # Parse and return prices
```

### 4.5 Unrealized P&L Formula

```
For Long:  unrealized_pnl = position_size * (mark_price - entry_price)
For Short: unrealized_pnl = position_size * (entry_price - mark_price)
```

Where:
- `position_size` = total tokens from aggregated trades
- `entry_price` = weighted average from Open/Increase trades
- `mark_price` = current price from DeBank or subgraph

---

## 5. Strategy Loading Flow

### 5.1 Current Flow (with issues)

```
Frontend Strategy        Backend /strategy/load       LedgerMatrix
┌─────────────────┐     ┌─────────────────────────┐  ┌─────────────────┐
│ StrategyLPItem[]│────▶│ 1. Get LP from subgraph │──│ LPPosition[]    │
│ StrategyGMXItem[]│    │ 2. Get unclaimed fees   │  │                 │
└─────────────────┘     │    from DeBank          │  │ PerpPosition[]  │
                        │ 3. Aggregate GMX trades │  │                 │
                        │ 4. ??? Unrealized P&L   │  │ perpHistory     │
                        └─────────────────────────┘  └─────────────────┘
```

### 5.2 Correct Flow

```
Frontend Strategy        Backend /strategy/load       LedgerMatrix
┌─────────────────┐     ┌─────────────────────────┐  ┌─────────────────┐
│ StrategyLPItem[]│────▶│ LP POSITIONS:           │──│ LPPosition[]    │
│ StrategyGMXItem[]│    │  1. Subgraph: structure │  │   - current vals│
└─────────────────┘     │  2. Subgraph: prices    │  │   - initial vals│
                        │  3. DeBank: unclaimed   │  │   - claimed fees│
                        │                         │  │   - unclaimed   │
                        │ GMX POSITIONS:          │  │                 │
                        │  1. Aggregate trades    │  │ PerpPosition[]  │
                        │  2. Calculate entry px  │  │   - entry_price │
                        │  3. Calculate realized  │  │   - realized_pnl│
                        │  4. DeBank: live state  │  │   - unrealized  │
                        │     for active only     │  │   - mark_price  │
                        │                         │  │                 │
                        │ PERP HISTORY:           │  │ perpHistory     │
                        │  - Total realized P&L   │  │   - realized_pnl│
                        │  - From aggregated      │  │   - margin      │
                        │    trades               │  │   - funding     │
                        └─────────────────────────┘  └─────────────────┘
```

---

## 6. Field Mapping Summary

### 6.1 LedgerMatrix Props

```typescript
interface LedgerMatrixProps {
  lpPositions: LPPosition[];          // Enriched LP positions
  perpPositions: PerpetualPosition[]; // Aggregated perp positions
  gmxRewards?: GMXRewards;            // Staking rewards (optional)
  perpHistory?: PerpHistory;          // Summary P&L data
  totalGasFees?: number;
}
```

### 6.2 TokenExposure Calculation Sources

| Field | LP Source | Perp Source |
|-------|-----------|-------------|
| `initialLpValue` | Subgraph: historical price at mint | N/A |
| `currentLpValue` | Subgraph: current price | N/A |
| `claimedFees` | Position History: Collect txs | N/A |
| `unclaimedFees` | DeBank: position state | N/A |
| `perpInitialMargin` | N/A | Strategy: first Open collateral |
| `perpUnrealizedPnl` | N/A | DeBank: live position OR calculated |
| `perpRealizedPnl` | N/A | Strategy: sum of trade pnl_usd |
| `perpFunding` | N/A | GMX Subgraph (optional) |

---

## 7. Implementation Checklist

### 7.1 Remove CoinGecko Usage

- [ ] Remove `coingecko.py` service (or deprecate `get_current_prices`)
- [ ] Remove CoinGecko calls from `test.py` strategy loading
- [ ] Remove `SYMBOL_TO_COINGECKO` mapping

### 7.2 Add DeBank Live Position Enrichment

- [ ] In `/strategy/load`, fetch DeBank positions for wallet
- [ ] Match active GMX positions to DeBank perp positions
- [ ] Extract `pnl_usd` and `mark_price` from DeBank

### 7.3 Fix Unrealized P&L Display

- [ ] For ACTIVE positions: use DeBank live data
- [ ] For CLOSED positions: unrealized = 0 (all realized)
- [ ] Display both in LedgerMatrix unmatched perps section

### 7.4 Ensure Data Source Consistency

- [ ] All LP prices from Subgraph
- [ ] All GMX execution prices from Subgraph
- [ ] All current/live data from DeBank
- [ ] No external price feeds (CoinGecko, etc.)

---

## 8. Backend Service Reference

### 8.1 thegraph.py - Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `get_positions_by_owner()` | Find all LP positions | Raw position data |
| `get_position_history()` | Transaction history with prices | Deposits, withdraws, collects |
| `get_full_position()` | Current position state | Token amounts, values |
| `get_position_with_historical_values()` | Initial deposit values | Historical USD values |

### 8.2 gmx_subgraph.py - Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `get_all_trades()` | Flat list of all trades | GMXTrade[] |
| `get_all_positions()` | Grouped by position_key | Position summaries |
| `get_position_history_by_key()` | Single position detail | All trades for position |
| `get_token_prices()` | Current GMX prices | Token -> USD price |

### 8.3 debank.py - Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `get_wallet_positions()` | All current positions | LP and Perp positions |
| `discover_transactions()` | Transaction history | Raw transaction list |

---

## 9. Price Precision Reference

### 9.1 GMX Price Precision

```python
# GMX stores prices as: price * 10^(30 - indexTokenDecimals)
MARKET_INFO = {
    "0x70d95587...": {"name": "ETH/USD", "decimals": 18},  # WETH
    "0x47c03123...": {"name": "BTC/USD", "decimals": 8},   # WBTC
    # ... etc
}

def get_execution_price(raw_price: int, market_address: str) -> float:
    decimals = MARKET_INFO.get(market_address, {}).get("decimals", 18)
    precision = 10 ** (30 - decimals)
    return raw_price / precision
```

### 9.2 GMX Size Precision

```python
# Sizes in USD: stored as value * 10^30
size_usd = raw_size_in_usd / 1e30

# Collateral (USDC): stored as value * 10^6
collateral_usd = raw_collateral_amount / 1e6
```

### 9.3 Uniswap Price Calculation

```python
# Token price in USD = derivedETH * ethPriceUSD
async def get_token_price_usd(token_address: str, block: int = None) -> float:
    query = """
    {
      token(id: "%s", block: {number: %d}) { derivedETH }
      bundle(id: "1", block: {number: %d}) { ethPriceUSD }
    }
    """ % (token_address, block, block)

    data = await self._query(query)
    derived_eth = float(data["token"]["derivedETH"])
    eth_price = float(data["bundle"]["ethPriceUSD"])

    return derived_eth * eth_price
```

---

## 10. Conclusion

The architecture is sound when following these principles:

1. **Test page patterns are correct** - They use subgraphs for structure/prices, DeBank for amounts/live data
2. **No external price feeds** - Subgraphs provide consistent pricing
3. **Strategy aggregation is key** - GMX trades are aggregated by position_key
4. **DeBank for live state** - Unrealized P&L comes from live position data
5. **Separate realized vs unrealized** - Realized from trade history, unrealized from live state

The CoinGecko integration was an incorrect shortcut that violated these principles.
