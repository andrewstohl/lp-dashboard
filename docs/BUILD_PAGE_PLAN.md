# Build Page Implementation Plan

> **Version:** 1.0  
> **Created:** November 27, 2025  
> **Status:** In Progress (Phase 3 Complete, Phase 4 Starting)

---

## Overview

The Build page is a three-column workflow for constructing portfolios from raw transactions:

| Column 1: Transactions | Column 2: Positions | Column 3: Strategies |
|------------------------|---------------------|---------------------|
| UNMATCHED transactions only | Auto-built from DeBank | User-defined groupings |
| Expandable (show details) | Expandable (show txs) | Expandable (show positions) |
| Click → assign to position | Click → assign to strategy | Click → view combined P&L |

---

## Data Architecture

### Data Sources

| Data | Source | Purpose |
|------|--------|---------|
| Transactions | DeBank `/user/all_history_list` | Complete discovery |
| Open Positions | DeBank `/user/all_complex_protocol_list` | Position identification via `position_index` |
| Historical Prices | CoinGecko | USD values at transaction time |
| Closed Positions | Derived from unmatched transactions | Grouped by protocol+chain |

### Position Identification

| Protocol | position_index Format | Matching Strategy |
|----------|----------------------|-------------------|
| Uniswap V3 | NFT tokenId (e.g., `1128573`) | Match tx receives/sends for tokenId |
| GMX V2 | `{collateral}_{market}_{isLong}` | Match by market address + direction |
| PancakeSwap V3 | NFT tokenId | Same as Uniswap |
| Euler | Timestamp or None | Match by protocol + asset |

### MVT Filtering (Minimum Viable Transaction)

**Hidden by default:**
- Spam/scam tokens (DeBank `is_scam` flag)
- Dust transactions (<$0.10)
- Bridges and swaps (not positions)
- Failed transactions
- Standalone approvals

**Shown:**
- Position-creating transactions (mint, burn, collect, open, close, etc.)

---

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETE

| Step | Description | Status |
|------|-------------|--------|
| 1.1 | Build page skeleton with 3-column layout | ✅ Done |
| 1.2 | CoinGecko price service | ✅ Done |
| 1.3 | Price caching in SQLite | ✅ Done |

### Phase 2: Transaction Discovery ✅ COMPLETE

| Step | Description | Status |
|------|-------------|--------|
| 2.1 | Transaction fetching API | ✅ Done |
| 2.2 | Price enrichment endpoint | ✅ Done |
| 2.3 | MVT filtering | ✅ Done |

### Phase 3: Position Discovery ✅ COMPLETE

| Step | Description | Status |
|------|-------------|--------|
| 3.1 | Fetch open positions from DeBank | ✅ Done |
| 3.2 | Link transactions to positions | ✅ Done (needs refinement) |
| 3.3 | Build closed positions | ✅ Done |
| 3.4 | Position naming | ✅ Done |

### Phase 4: Transactions Column UI ✅ COMPLETE

| Step | Description | Status |
|------|-------------|--------|
| 4.1 | TransactionsColumn.tsx component | ✅ Done |
| 4.2 | Transaction detail expansion | ✅ Done |

### Phase 5: Positions Column UI ✅ COMPLETE

| Step | Description | Status |
|------|-------------|--------|
| 5.1 | PositionsColumn.tsx component | ✅ Done |
| 5.2 | Position expansion (show txs) | ✅ Done |
| 5.3 | Position actions (rename, unlink) | ⏸️ Deferred to Phase 7 |

### Phase 6: Strategies Column UI 🔄 IN PROGRESS

| Step | Description | Status |
|------|-------------|--------|
| 6.1 | StrategiesColumn.tsx component | ✅ Done |
| 6.2 | Strategy creation modal | ✅ Done |
| 6.3 | Position assignment to strategy | ✅ Done |
| 6.4 | Strategy expansion | ✅ Done |
| 6.5 | Strategy actions (delete) | ✅ Done |

### Phase 7: Persistence

| Step | Description | Status |
|------|-------------|--------|
| 7.1 | Database schema (positions, strategies) | ❌ Not started |
| 7.2 | CRUD API endpoints | ❌ Not started |
| 7.3 | State management | ❌ Not started |

### Phase 8: Integration & Polish

| Step | Description | Status |
|------|-------------|--------|
| 8.1 | Connect to Ledger page | ❌ Not started |
| 8.2 | Loading states | ❌ Not started |
| 8.3 | Empty states | ❌ Not started |

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/build/transactions` | Filtered transactions for Build page |
| `GET /api/v1/build/positions` | Open positions from DeBank |
| `GET /api/v1/build/positions/with-transactions` | Positions + linked transactions |
| `POST /api/v1/build/enrich-prices` | On-demand price enrichment |
| `GET /api/v1/build/cache-stats` | Cache statistics |

---

## Frontend Components (Planned)

```
/frontend/components/build/
├── TransactionsColumn.tsx    # Left column - unmatched transactions
├── PositionsColumn.tsx       # Middle column - all positions
├── StrategiesColumn.tsx      # Right column - user strategies
├── TransactionCard.tsx       # Single transaction display
├── PositionCard.tsx          # Single position display
├── StrategyCard.tsx          # Single strategy display
├── CreateStrategyModal.tsx   # Modal for new strategy
└── AssignPositionModal.tsx   # Modal for position → strategy
```

---

## Test Wallet

```
0x23b50a703d3076b73584df48251931ebf5937ba2
```

**Current Stats (6 months):**
- 616 filtered transactions (1185 total, 569 hidden)
- 27 positions (16 open, 11 closed)
- 91.4% transaction match rate
- Chains: ETH, ARB, BASE, OP, BSC
