# Phase 2.0 Implementation Checklist

> **Purpose:** Track bite-sized implementation tasks to avoid overwhelming chat sessions
> **Rule:** Complete ONE task, test it, then move to next
> **Status:** In Progress

---

## Phase 2.0a: Backend - Transaction Fetching

### Step 1: Base Infrastructure ✅
- [x] 1.1 Create `services/adapters/base.py` - ProtocolAdapter abstract base class (~80 lines)
- [x] 1.2 Create `services/adapters/__init__.py` - Registry class (~69 lines)
- [x] 1.3 Test: Import and verify classes load

### Step 2: Uniswap V3 Adapter ✅
- [x] 2.1 Create `services/adapters/uniswap_v3.py` - Skeleton with interface
- [x] 2.2 Add `_fetch_positions()` method - Query positions by owner
- [x] 2.3 Add `_derive_transactions_from_snapshots()` - Calculate deltas
- [x] 2.4 Add helper methods for creating mint/burn/collect transactions
- [x] 2.5 Test: Found 111 transactions across 24 positions for test wallet

### Step 3: GMX V2 Adapter ✅
- [x] 3.1 Create `services/adapters/gmx_v2.py` - Skeleton with interface
- [x] 3.2 Add `_fetch_increases()` method with parsing
- [x] 3.3 Add `_fetch_decreases()` method with parsing
- [x] 3.4 Add helper methods for token/market symbol lookup
- [x] 3.5 Test: Found 344 GMX transactions (128 increases, 126 decreases, 46 opens, 44 closes)

### Step 4: Euler Adapter (Stub) ✅
- [x] 4.1 Create `services/adapters/euler.py` - Stub that returns empty list
- [x] 4.2 Documented Euler V2 subgraph structure and endpoints
- [x] 4.3 Registered adapter in ProtocolRegistry
- [x] 4.4 Test: Adapter loads, returns empty list, doesn't break other adapters

### Step 5: Transaction API Endpoint ✅
- [x] 5.1 Create `app/api/v1/transactions.py` - New endpoint file (157 lines)
- [x] 5.2 Add `GET /wallet/{address}/transactions` route with date filters
- [x] 5.3 Add pagination support (page, limit, totalPages, hasMore)
- [x] 5.4 Register router in `app/main.py`
- [x] 5.5 Test: Endpoint works, returns 28 transactions in 30 days with filters working

### Step 6: Integration Test & Commit ✅
- [x] 6.1 Test full flow: API → Adapters → Subgraphs → Response
- [x] 6.2 Verify transaction structure matches design doc
- [x] 6.3 Commit Phase 2.0a to GitHub (commit: 27f727e)

---

## Phase 2.0b: Frontend - Reconcile Page UI

### Step 7: Page Setup ✅
- [x] 7.1 Create `/app/reconcile/page.tsx` - Basic page shell
- [x] 7.2 Add navigation tab for Reconcile
- [x] 7.3 Test: Navigate to page, see placeholder

### Step 8: API Client ✅
- [x] 8.1 Add `fetchTransactions()` to `lib/api.ts`
- [x] 8.2 Add TypeScript types for Transaction
- [x] 8.3 Test: Console.log fetched transactions

### Step 9: Transaction List Component ✅
- [x] 9.1 Create `TransactionList.tsx` - Display transactions
- [x] 9.2 Create `TransactionRow.tsx` - Single transaction display
- [x] 9.3 Add actions menu (••• button) - UI only, no logic yet
- [x] 9.4 Test: See transactions rendered

### Step 10: Filter Bar ⬜
- [ ] 10.1 Create `FilterBar.tsx` - Date, protocol, type filters
- [ ] 10.2 Wire filters to API call
- [ ] 10.3 Test: Filters change displayed transactions

### Step 11: Summary Bar ⬜
- [ ] 11.1 Create `ReconcileSummary.tsx` - Stats display
- [ ] 11.2 Calculate unreconciled count, total value
- [ ] 11.3 Test: Summary updates with data

---

## Phase 2.0c: Allocation Logic & Persistence

### Step 12: localStorage Schema ⬜
- [ ] 12.1 Create `lib/reconciliation/storage.ts` - Save/load functions
- [ ] 12.2 Define storage schema with version
- [ ] 12.3 Test: Save and reload data

### Step 13: Position Management ⬜
- [ ] 13.1 Create `lib/reconciliation/positions.ts` - Position CRUD
- [ ] 13.2 Add auto-grouping by positionKey
- [ ] 13.3 Create Position modal UI
- [ ] 13.4 Test: Create position from transactions

### Step 14: Strategy Management ⬜
- [ ] 14.1 Create `lib/reconciliation/strategies.ts` - Strategy CRUD
- [ ] 14.2 Create Strategy modal UI
- [ ] 14.3 Add allocation percentage input
- [ ] 14.4 Test: Create strategy with positions

### Step 15: Allocation Calculations ⬜
- [ ] 15.1 Add position allocation derivation (from transactions)
- [ ] 15.2 Add strategy status derivation (from positions)
- [ ] 15.3 Add reduction allocation modal (pro-rata default)
- [ ] 15.4 Test: Allocations calculate correctly

### Step 16: Export/Import ⬜
- [ ] 16.1 Add JSON export function
- [ ] 16.2 Add JSON import with validation
- [ ] 16.3 Add UI buttons for export/import
- [ ] 16.4 Test: Round-trip export → import

---

## Phase 2.0d: Smart Suggestions

### Step 17: Suggestion Engine ⬜
- [ ] 17.1 Create `lib/reconciliation/suggestions.ts`
- [ ] 17.2 Add temporal grouping detection
- [ ] 17.3 Add unallocated position detection
- [ ] 17.4 Test: Suggestions generate correctly

### Step 18: Suggestions UI ⬜
- [ ] 18.1 Create `SuggestionsPanel.tsx`
- [ ] 18.2 Wire suggestion actions to creation modals
- [ ] 18.3 Test: Click suggestion → modal opens

---

## Phase 2.0e: Ledger Page Refactor

### Step 19: Ledger Updates ⬜
- [ ] 19.1 Add Current/Historical tabs
- [ ] 19.2 Read from reconciled strategies
- [ ] 19.3 Add date range filtering
- [ ] 19.4 Test: Ledger shows reconciled data

---

## Current Task

**Step 9 COMPLETE ✅**

**Next up:** Step 10 - Filter Bar (Phase 2.0b: Frontend - Reconcile Page UI)

---

## Test Wallet
```
0x23b50a703d3076b73584df48251931ebf5937ba2
```

## Quick Commands
```bash
# Restart backend
cd /Users/drewstohl/Desktop/lp-dashboard && docker compose restart backend

# Test API
curl http://localhost:8004/api/v1/wallet/0x23b50a703d3076b73584df48251931ebf5937ba2/transactions

# Check logs
docker logs lp-dashboard-backend-1 --tail 50
```
