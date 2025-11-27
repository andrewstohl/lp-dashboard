# Phase 2.0 Implementation Checklist

> **Purpose:** Track bite-sized implementation tasks to avoid overwhelming chat sessions
> **Rule:** Complete ONE task, test it, then move to next
> **Status:** In Progress

---

## ⚠️ ARCHITECTURAL REVISION (Nov 26, 2025)

**Problem Identified:** Original Phase 2.0a used subgraph-based adapters for transaction discovery.
This approach had critical flaws:
- Only discovered transactions from protocols with coded adapters
- Only discovered transactions on networks with configured subgraph URLs
- Missing transactions = unacceptable for enterprise portfolio analysis

**New Architecture (QuickBooks-inspired):**

| Layer | Purpose | Source |
|-------|---------|--------|
| **Discovery** | Find ALL transactions | DeBank `/user/history_list` |
| **Enrichment** | Accurate pricing (on-demand) | Protocol subgraphs |

**Key Decisions:**
1. Use DeBank's transaction format directly (no conversion layer)
2. Store reconciliation data as a separate overlay
3. Subgraphs become enrichment services, not discovery
4. Add chain/network filter to UI

---

## Phase 2.0a: Backend - Transaction Fetching

### Steps 1-6: Original Adapter Approach ⚠️ DEPRECATED
- [x] Steps 1-6 completed but architecture was flawed
- Subgraph adapters moved to `services/adapters/` (kept for future enrichment)
- Will be refactored to enrichment-only role

### Step 6b: DeBank Discovery Refactor ✅ COMPLETE
- [x] 6b.1 Create `services/discovery.py` - DeBank-based discovery
- [x] 6b.2 Fetch from DeBank `/user/history_list` across all chains
- [x] 6b.3 Return DeBank format directly (no conversion)
- [x] 6b.4 Update `/transactions` endpoint to use new discovery service
- [x] 6b.5 Add `chain` filter parameter to endpoint
- [x] 6b.6 Test: Verified 39 transactions across 5 chains (eth, arb, base, op, bsc)
- [x] 6b.7 Commit refactored architecture to GitHub

---

## Phase 2.0b: Frontend - Reconcile Page UI

### Step 7: Page Setup ✅
- [x] 7.1 Create `/app/reconcile/page.tsx` - Basic page shell
- [x] 7.2 Add navigation tab for Reconcile
- [x] 7.3 Test: Navigate to page, see placeholder

### Step 8: API Client ✅ COMPLETE
- [x] 8.1 Add `fetchTransactions()` to `lib/api.ts`
- [x] 8.2 Add TypeScript types for Transaction
- [x] 8.3 Test: Console.log fetched transactions
- [x] 8.4 Updated types to match DeBank format

### Step 9: Transaction List Component ✅ COMPLETE
- [x] 9.1 Create `TransactionList.tsx` - Display transactions
- [x] 9.2 Create `TransactionRow.tsx` - Single transaction display
- [x] 9.3 Add actions menu (••• button) - UI only, no logic yet
- [x] 9.4 Test: See transactions rendered
- [x] 9.5 Updated to display DeBank format with chain badges and metadata

### Step 10: Filter Bar ✅ COMPLETE
- [x] 10.1 Create `FilterBar.tsx` - Date, chain, protocol, type filters
- [x] 10.2 Wire filters to API call
- [x] 10.3 Add chain/network filter (eth, arb, op, base, polygon, etc.)
- [x] 10.4 Test: Filters change displayed transactions

### Step 11: Summary Bar ✅ COMPLETE
- [x] 11.1 Create `ReconcileSummary.tsx` - Stats display
- [x] 11.2 Calculate total value in/out/net by chain
- [x] 11.3 Show unreconciled count (prep for future reconciliation tracking)
- [x] 11.4 Test: Summary updates with data and respects hidden transactions

---

## Phase 2.0c: Allocation Logic & Persistence

### Step 12: localStorage Schema ✅ PARTIAL (Hide Feature)
- [x] 12.1 Create `lib/reconciliation/storage.ts` - Save/load functions
- [x] 12.2 Define reconciliation overlay schema (separate from raw txns)
- [x] 12.3 Key by `${chain}:${txHash}` for uniqueness
- [x] 12.4 Test: Save and reload data
- [x] 12.5 Added hide/unhide transaction functionality
- [x] 12.6 Added "Show Hidden" toggle to UI
- [ ] 12.7 Add position and strategy fields (future steps)

### Step 13: Position Management ✅ COMPLETE
- [x] 13.1 Create `lib/reconciliation/positions.ts` - Position CRUD
- [x] 13.2 Add auto-grouping by positionKey (suggestPositions function)
- [x] 13.3 Create Position modal UI (CreatePositionModal.tsx)
- [x] 13.4 Create Position suggestions panel (PositionSuggestionsPanel.tsx)
- [x] 13.5 Test: Create position from suggestion on reconcile page

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

## Phase 2.0f: Enrichment Services (Future)

### Step 20: On-Demand Pricing ⬜
- [ ] 20.1 Refactor adapters to enrichment-only role
- [ ] 20.2 Add "Get Accurate Pricing" action per transaction
- [ ] 20.3 Call subgraphs only when user requests analysis
- [ ] 20.4 Cache enriched values in reconciliation overlay

---

## Current Task

**Step 11: Summary Bar ✅ COMPLETE**

Added ReconcileSummary component with:
- Total Received / Total Sent / Net Flow cards
- Reconciliation status (unreconciled count)
- By-Chain breakdown with value details
- Respects hidden transaction filtering

**Phase 2.0b (Frontend UI) Complete!**

### Critical Bug Fixes (Nov 26, 2025)

**Fix 1: Complete Transaction Discovery ✅**
- Problem: Only querying 9 hardcoded chains, missing user's actual chains
- Solution: Use `/user/used_chain_list` to detect ALL chains dynamically
- Solution: Use `/user/all_history_list` for cross-chain queries
- Result: 56 → 1318 transactions (23x more!)

**Fix 2: SQLite Caching ✅**
- Problem: Full fetch takes 60+ seconds per request
- Solution: SQLite cache per wallet with incremental sync
- Result: First load ~60s, subsequent loads ~1s (60x faster)
- Files: `backend/services/transaction_cache.py`

**Next up:** Phase 2.0c - Step 14: Strategy Management

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
