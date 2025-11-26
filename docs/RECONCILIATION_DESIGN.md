# VORA Dashboard - Reconciliation System Design

> **Version:** 1.0  
> **Created:** November 26, 2025  
> **Status:** Design Complete, Implementation Pending  
> **Authors:** Drew (Product Owner) + Claude (Design & Implementation)

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Core Concepts & Hierarchy](#2-core-concepts--hierarchy)
3. [Data Models](#3-data-models)
4. [Allocation System](#4-allocation-system)
5. [UI Design](#5-ui-design)
6. [API Endpoints](#6-api-endpoints)
7. [Smart Suggestions](#7-smart-suggestions)
8. [Persistence & Storage](#8-persistence--storage)
9. [Protocol Extensibility](#9-protocol-extensibility)
10. [Implementation Phases](#10-implementation-phases)
11. [Open Questions & Future Considerations](#11-open-questions--future-considerations)

---

## 1. Overview & Goals

### The Problem

The current VORA Dashboard provides point-in-time snapshots of DeFi positions, but lacks the ability to:

1. **Track related trades as unified strategies** - A "delta neutral" approach involves an LP position + multiple perp hedges, but these are displayed separately with no connection.

2. **Handle cross-position hedging** - A single WETH short might hedge WETH exposure across 4 different LP pools. Current system can't represent this.

3. **Provide historical P&L analysis** - Without knowing which trades belong together, we can't calculate true strategy performance over time.

4. **Support partial allocation** - When one hedge covers multiple LPs, users need to allocate percentages to each strategy.

### The Solution

Build a **Position Management System (PMS)** inspired by QuickBooks' reconciliation workflow:

- Users reconcile raw on-chain transactions into **Positions**
- Positions are grouped into **Strategies**
- Each transaction can be partially allocated across multiple strategies
- Once reconciled, comprehensive P&L analysis becomes possible

### Design Principles

1. **User-defined relationships** - The user knows their intent; the system doesn't assume
2. **Transaction-level allocation** - Allocations happen per-transaction, not per-position
3. **Single-view reconciliation** - Everything visible on one page (QuickBooks-inspired)
4. **Sensible defaults** - Smart suggestions reduce manual work
5. **Full audit trail** - Every allocation decision is traceable
6. **Extensible architecture** - Easy to add new protocols (DEXs, perps, staking)

---

## 2. Core Concepts & Hierarchy

### The Three-Tier Hierarchy

```
TRANSACTION (atomic on-chain event)
     ↓ groups into
POSITION (single DeFi primitive + its lifecycle)
     ↓ groups into
STRATEGY (coordinated positions working together)
     ↓ future: groups into
PORTFOLIO (multiple strategies)
```

### Definitions

#### Transaction
An atomic on-chain event that affects the user's portfolio. Immutable once recorded.

**Examples:**
- LP mint (add liquidity)
- LP burn (remove liquidity)
- LP fee collection
- Perp position open
- Perp position increase/decrease
- Perp position close
- Staking deposit/withdrawal
- Reward claims

#### Position
A container for transactions that share the same underlying DeFi primitive.

**Rules:**
- All transactions in a position share the same `positionKey` (LP token ID, perp position ID, etc.)
- A position represents ONE thing: one LP, one perp, one stake
- Fee claims, adjustments, etc. belong to the position they originated from
- When fees are swapped to stablecoins and staked elsewhere, that's a NEW position

**Examples:**
- "LINK/WETH LP #1128573" - contains mint, fee claims, eventual burn
- "GMX Short WETH" - contains open, increases, decreases, eventual close
- "AAVE USDC Stake" - contains deposit, reward claims, eventual withdrawal

#### Strategy
A user-defined container that groups related positions into a logical trading approach.

**Rules:**
- Strategies have user-defined names
- A strategy can contain multiple positions
- Positions can be **partially allocated** to a strategy (e.g., 50% of a WETH short)
- A strategy is OPEN if any position within it is OPEN
- A strategy is CLOSED only when ALL positions within it are CLOSED

**Examples:**
- "Q4 Delta Neutral" - LINK/WETH LP + Short LINK + 50% of Short WETH
- "WBTC Flywheel" - WBTC/WETH LP + Short WBTC + 50% of Short WETH + AAVE stake

#### Portfolio (Future)
A container for multiple strategies. Not in MVP scope.

### Visual Example

```
STRATEGY: "Q4 Delta Neutral"
├── POSITION: LP (LINK/WETH 0.05%)
│   ├── TRADE: Mint $45,590 (Nov 12)
│   ├── TRADE: Fee Claim $127 (Nov 20)
│   └── TRADE: Fee Claim $89 (Nov 28)
│
├── POSITION: Perp Short LINK (100% allocated)
│   ├── TRADE: Open $23,000 (Nov 12)
│   └── TRADE: Adjust -$2,000 (Nov 22)
│
├── POSITION: Perp Short WETH (50% allocated here)
│   ├── TRADE: Open $10,000 → 50% here, 50% Strategy B (Nov 12)
│   ├── TRADE: Increase $5,000 → 100% here (Nov 15)
│   └── TRADE: Decrease -$7,000 → 100% here (Nov 25)
│
└── Status: OPEN (LP still active)
```

---

## 3. Data Models

### Transaction

```typescript
interface Transaction {
  // Identity
  id: string;                    // Internal UUID
  txHash: string;                // On-chain transaction hash
  logIndex: number;              // For uniqueness within tx (multiple events per tx)
  timestamp: number;             // Unix timestamp
  blockNumber: number;           // For historical price lookups
  
  // Classification
  protocol: ProtocolType;        // 'uniswap_v3', 'gmx_v2', 'aave', etc.
  type: TransactionType;         // 'lp_mint', 'perp_open', etc.
  
  // Position linkage
  positionKey: string;           // LP token ID, perp position key, etc.
                                 // Used to auto-group transactions into positions
  
  // Token details
  tokens: {
    symbol: string;
    amount: number;
    usdValue: number;            // USD value at time of transaction
    direction: 'in' | 'out';     // Received or sent
  }[];
  
  // Value
  usdValue: number;              // Net USD value (positive for adds, negative for removes)
  realizedPnl?: number;          // For closes/reductions with P&L
  fees?: number;                 // Gas fees, protocol fees
  
  // Allocation (THE KEY FEATURE)
  allocations: TransactionAllocation[];
  
  // Reconciliation status
  status: 'unreconciled' | 'reconciled';
  positionId: string | null;     // Null until assigned to a position
  
  // Metadata
  createdAt: number;             // When added to our system
}

interface TransactionAllocation {
  strategyId: string;
  percentage: number;            // 0-100, what % of THIS transaction goes here
  usdValue: number;              // Calculated: transaction.usdValue × (percentage / 100)
}

type ProtocolType = 
  // DEXs (MVP)
  | 'uniswap_v3'
  // DEXs (Future)
  | 'uniswap_v2' | 'pancakeswap' | 'aerodrome' | 'orca' | 'raydium'
  // Perps (MVP)
  | 'gmx_v2'
  // Perps (Future)
  | 'gmx_v1' | 'aster'
  // Staking/Lending (MVP)
  | 'aave'
  // Staking/Lending (Future)
  | 'euler' | 'silo'
  // Catch-all
  | 'other';

type TransactionType = 
  // LP
  | 'lp_mint' | 'lp_burn' | 'lp_collect'
  // Perp
  | 'perp_open' | 'perp_increase' | 'perp_decrease' | 'perp_close'
  // Staking
  | 'stake' | 'unstake' | 'reward_claim'
  // Future
  | 'swap' | 'bridge' | 'gas' | 'other';
```

### Position

```typescript
interface Position {
  // Identity
  id: string;                    // Internal UUID
  name: string;                  // User-editable, defaults to auto-generated
  
  // Classification
  positionType: 'lp' | 'perp' | 'stake' | 'other';
  protocol: ProtocolType;
  positionKey: string;           // The grouping key from transactions
  
  // Tokens involved
  tokens: string[];              // ['WETH', 'LINK']
  
  // Transaction references
  transactionIds: string[];      // All transactions in this position
  
  // Lifecycle
  status: 'open' | 'closed';     // Derived from transactions
  openedAt: number;              // Timestamp of first transaction
  closedAt?: number;             // Timestamp of closing transaction (if closed)
  
  // Calculated values (DERIVED from transactions, not set directly)
  currentValue: number;          // Sum of transaction USD values
  realizedPnl: number;           // Sum of realized P&L from transactions
  
  // Allocation summary (CALCULATED from transaction allocations)
  strategyAllocations: {
    strategyId: string;
    usdValue: number;            // Sum of transaction allocations to this strategy
    percentage: number;          // usdValue / currentValue × 100
  }[];
  unallocatedPercentage: number; // 100 - sum(strategy percentages)
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}
```

### Strategy

```typescript
interface Strategy {
  // Identity
  id: string;                    // Internal UUID
  name: string;                  // User-defined, required
  description?: string;          // Optional notes
  tags?: string[];               // 'delta-neutral', 'flywheel', etc.
  
  // Position references
  positionIds: string[];         // Positions included in this strategy
  
  // Lifecycle (DERIVED from positions)
  status: 'draft' | 'open' | 'closed';
  // draft  = has positions with unallocated %
  // open   = all positions allocated, at least one position open
  // closed = all positions allocated AND all positions closed
  
  openedAt?: number;             // Earliest position open timestamp
  closedAt?: number;             // Latest position close timestamp (if all closed)
  
  // Calculated values (DERIVED from position allocations)
  totalValue: number;            // Sum of position allocations to this strategy
  totalRealizedPnl: number;      // Sum of realized P&L × allocation %
  totalUnrealizedPnl: number;    // Sum of unrealized P&L × allocation %
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}
```



---

## 4. Allocation System

### Core Principle: Transaction-Level Allocation

**The key insight:** Don't allocate Positions to Strategies. Allocate each Transaction to Strategies.

The Position's overall allocation is a **weighted calculation** based on the sum of all its transaction allocations. This is analogous to **lot tracking** or **specific identification** in inventory accounting.

### Why Transaction-Level?

| Position-Level Allocation | Transaction-Level Allocation |
|---------------------------|------------------------------|
| "50% of this position goes to Strategy A" | "50% of THIS transaction goes to Strategy A" |
| What happens when position value changes? | Each transaction is independently allocated |
| Retroactive adjustments needed | No retroactive changes ever |
| Ambiguous audit trail | Clear audit trail per transaction |

### Allocation Rules

1. **Each transaction is allocated independently**
2. **Total allocation across strategies must equal 100%** (or remain partially unallocated)
3. **Position allocation is always derived** from summing transaction allocations
4. **Strategy status depends on allocation completeness**

### Example: Building Up Allocations

**Initial State - Open $10,000 WETH Short:**
```
Transaction 1: Open $10,000
  → 50% Strategy A ($5,000)
  → 50% Strategy B ($5,000)

Position Allocation:
  Strategy A: $5,000 (50%)
  Strategy B: $5,000 (50%)
```

**Add $5,000 to Strategy A only:**
```
Transaction 2: Increase $5,000
  → 100% Strategy A ($5,000)
  → 0% Strategy B ($0)

Position Allocation (recalculated):
  Strategy A: $5,000 + $5,000 = $10,000 (66.67%)
  Strategy B: $5,000 + $0 = $5,000 (33.33%)
  Total: $15,000
```

### Handling Reductions

When a reduction transaction occurs (perp decrease, LP burn), the user must specify how to allocate the reduction.

**Three options:**

| Method | Description | Use Case |
|--------|-------------|----------|
| **Pro-rata** (default) | Reduce proportionally by current allocation | "I'm reducing my overall position" |
| **LIFO** | Reduce from most recent transactions first | "Undo my last add" |
| **User-specified** | User explicitly chooses split | "I'm specifically reducing Strategy A" |

**Example: Reduce $7,000 from position with 66.67% A / 33.33% B**

Pro-rata result:
```
Strategy A: -$4,667 (66.67% of $7,000)
Strategy B: -$2,333 (33.33% of $7,000)
```

User-specified (100% from A):
```
Strategy A: -$7,000 (100%)
Strategy B: $0 (0%)
```

### Allocation Validation

**Strategy cannot be saved as OPEN unless:**
1. All positions in the strategy have 100% allocation (across all strategies)
2. At least one position is OPEN

**Position shows warning if:**
- Total allocation < 100% (unallocated portion)
- User tries to close strategy with unallocated positions

### P&L Calculation with Allocations

```
Strategy P&L = Σ (Position P&L × Position's allocation % to this strategy)
```

For a position with transactions allocated to multiple strategies:
```
Position's contribution to Strategy A = 
  Σ (Transaction P&L × Transaction's allocation % to Strategy A)
```

---

## 5. UI Design

### Page: `/reconcile`

Single-page reconciliation view inspired by QuickBooks. Everything visible without tab switching.

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  VORA Dashboard    [Dashboard]  [Ledger]  [Reconcile]               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ Summary Bar ────────────────────────────────────────────────┐  │
│  │ Unreconciled: 12 txns ($47,234)  │  Open Strategies: 2       │  │
│  │ Open Positions: 4                │  Draft Strategies: 1      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Filters ────────────────────────────────────────────────────┐  │
│  │ [Date Range ▼] [Protocol ▼] [Type ▼] [Status ▼] [Token ▼]   │  │
│  │ [Search...                                            🔍]    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ 💡 Suggestions (collapsible) ───────────────────────────────┐  │
│  │ • 3 transactions on Nov 12 look related - create strategy?   │  │
│  │ • WETH Short has 50% unallocated                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
│  UNRECONCILED TRANSACTIONS (12)                      [Select All]   │
│  ─────────────────────────────────────────────────────────────────  │
│  │ Transaction rows with action menus (•••)                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  OPEN STRATEGIES (2)                                 [+ New Strategy]│
│  ─────────────────────────────────────────────────────────────────  │
│  │ Collapsible strategy cards showing positions                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  UNASSIGNED POSITIONS (1)                                           │
│  ─────────────────────────────────────────────────────────────────  │
│  │ Positions not yet in any strategy                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  CLOSED STRATEGIES (5)                               [Show/Hide]    │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  [← Previous]  Page 1 of 3  [Next →]                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Transaction Row

```
┌──────────────────────────────────────────────────────────────────┐
│ □ Nov 28, 2025 • Fee Claim • LINK/WETH LP                   •••  │
│   $47.23 • Uniswap V3 • 0x1234...5678                            │
│   💡 Related to: Position "Main LINK/WETH LP"                    │
└──────────────────────────────────────────────────────────────────┘
```

### Transaction Actions Menu (•••)

**For Unreconciled Transaction:**
```
┌───────────────────────────────┐
│ Create Position               │
│ Create Strategy               │
│ Add to Existing Position...   │
│ Add to Existing Strategy...   │
│ ─────────────────────────     │
│ View on Explorer ↗            │
└───────────────────────────────┘
```

**For Reconciled Transaction:**
```
┌───────────────────────────────┐
│ View Position                 │
│ View Strategy                 │
│ Edit Allocation...            │
│ Remove from Position          │
│ ─────────────────────────     │
│ View on Explorer ↗            │
└───────────────────────────────┘
```

### Create Position Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ Create Position                                           ✕     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ This LP position has 3 related transactions:                    │
│   ✓ Nov 12 - Mint ($45,590)                                    │
│   ✓ Nov 20 - Fee Claim ($127.45)                               │
│   ✓ Nov 28 - Fee Claim ($89.32)                                │
│                                                                 │
│ Position Name:                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ LINK/WETH LP #1128573                                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ (Auto-generated, you can customize)                             │
│                                                                 │
│                              [Cancel]  [Create Position]        │
└─────────────────────────────────────────────────────────────────┘
```

### Create Strategy Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ Create Strategy                                           ✕     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Strategy Name: *                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Q4 Delta Neutral                                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Description (optional):                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ LINK/WETH LP with hedged perp positions                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Tags (optional):                                                │
│ [delta-neutral] [×]  [Add tag...]                              │
│                                                                 │
│ Starting Position:                                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ LINK/WETH LP #1128573                                       │ │
│ │ Current Value: $40,078 • 3 transactions                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Allocation to this Strategy:                                    │
│ [100]% ($40,078)                                                │
│                                                                 │
│                              [Cancel]  [Create Strategy]        │
└─────────────────────────────────────────────────────────────────┘
```

### Allocation Modal (for reductions)

```
┌─────────────────────────────────────────────────────────────────┐
│ Allocate Reduction                                        ✕     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Transaction: WETH Short Decrease                                │
│ Amount: -$7,000 • Nov 25, 2025                                  │
│                                                                 │
│ Current Position Allocation:                                    │
│   Strategy A (Q4 Delta Neutral): 66.67% ($10,000)              │
│   Strategy B (WBTC Flywheel): 33.33% ($5,000)                  │
│                                                                 │
│ ─────────────────────────────────────────────────────────────   │
│                                                                 │
│ Reduce from:                                                    │
│                                                                 │
│ ● Pro-rata (recommended)                                        │
│     Strategy A: -$4,667 (66.67%)                                │
│     Strategy B: -$2,333 (33.33%)                                │
│                                                                 │
│ ○ Custom allocation                                             │
│     Strategy A: [-$7,000    ] ← (editable)                      │
│     Strategy B: [-$0        ]                                   │
│     Remaining: $0 ✓                                             │
│                                                                 │
│                              [Cancel]  [Apply Allocation]       │
└─────────────────────────────────────────────────────────────────┘
```

### Filter Options

| Filter | Options |
|--------|---------|
| Date Range | Last 7 days, 30 days, 90 days, 6 months, Custom |
| Protocol | Uniswap V3, GMX V2, AAVE, All |
| Type | LP, Perp, Stake, All |
| Status | Unreconciled, Reconciled, All |
| Strategy | [Dropdown of strategies], Unassigned |
| Token | WETH, LINK, WBTC, USDC, etc. |
| Value Range | Min/Max USD |
| Allocation | Fully allocated, Partial, Unallocated |

---

## 6. API Endpoints

### New Endpoints Required

#### Transaction Fetching

```
GET /api/v1/wallet/{address}/transactions
  ?since=2025-06-01T00:00:00Z
  &until=2025-11-26T23:59:59Z
  &protocol=uniswap_v3,gmx_v2,aave
  &type=lp_mint,lp_burn,lp_collect,perp_open,...
  &page=1
  &limit=50

Response:
{
  transactions: Transaction[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    hasMore: boolean
  }
}
```

#### Transaction Details (for historical pricing)

```
GET /api/v1/transaction/{txHash}
  ?logIndex=0

Response: Transaction (with full token details and USD values)
```

### Backend Services Required

#### Protocol Adapters

Each protocol needs an adapter implementing:

```python
class ProtocolAdapter:
    async def fetch_transactions(
        self, 
        wallet: str, 
        since: datetime, 
        until: datetime
    ) -> List[Transaction]:
        pass
    
    async def get_position_key(self, tx: RawTransaction) -> str:
        """Extract the position identifier from a transaction"""
        pass
    
    async def get_current_value(self, position_key: str) -> float:
        """Get current USD value of a position"""
        pass
```

**MVP Adapters:**
- `UniswapV3Adapter` - LP mints, burns, collects
- `GmxV2Adapter` - Perp opens, increases, decreases, closes
- `AaveAdapter` - Stakes, unstakes, reward claims

### Existing Endpoints (Enhanced)

```
GET /api/v1/wallet/{address}/ledger
  → Now reads from reconciled data
  → Returns strategies with calculated P&L
```

---

## 7. Smart Suggestions

### Types of Suggestions

#### 1. Temporal Grouping
Detect transactions that occurred close together (within 1 hour).

```
💡 "3 transactions on Nov 12 happened within 1 hour"
   - LP Mint: LINK/WETH ($45,590)
   - Perp Open: Short LINK ($23,000)
   - Perp Open: Short WETH ($10,000)
   [Create Strategy from All]
```

**Logic:**
```python
def find_temporal_groups(transactions, window_minutes=60):
    # Sort by timestamp
    # Group transactions within window
    # Return groups with 2+ transactions
```

#### 2. Token Matching
Suggest hedges that match LP token exposure.

```
💡 "Short LINK matches LINK exposure in your LINK/WETH LP"
   [Add to same strategy]
```

**Logic:**
```python
def find_token_matches(transactions):
    # Find LP positions and their tokens
    # Find perp shorts matching those tokens
    # Suggest pairing
```

#### 3. Unallocated Warnings
Alert when positions have unallocated percentage.

```
⚠️ "WETH Short is 50% unallocated"
   [Create new strategy] [Add to existing]
```

#### 4. Unreconciled Alerts
Periodic reminder about old unreconciled transactions.

```
📋 "You have 15 unreconciled transactions"
   Oldest from 3 weeks ago
   [View Unreconciled]
```

#### 5. Strategy Completeness
Suggest missing pieces for strategies.

```
💡 "Strategy 'Q4 Delta Neutral' has LP exposure but no WETH hedge"
   Unhedged WETH: $19,500
   [Find matching positions]
```

### Suggestion Priority

1. Unallocated warnings (blocking issue)
2. Temporal grouping (highest value for new users)
3. Token matching (helpful for hedging)
4. Unreconciled alerts (maintenance)
5. Strategy completeness (advanced)



---

## 8. Persistence & Storage

### MVP: localStorage + JSON Export

#### localStorage Schema

```typescript
interface ReconciliationStore {
  version: string;                    // Schema version for migrations
  walletAddress: string;              // Current wallet
  lastFetched: number;                // Timestamp of last transaction fetch
  
  transactions: Record<string, Transaction>;   // id → Transaction
  positions: Record<string, Position>;         // id → Position
  strategies: Record<string, Strategy>;        // id → Strategy
  
  // Index for quick lookups
  indexes: {
    txByHash: Record<string, string>;           // txHash → transaction id
    txByPosition: Record<string, string[]>;     // positionId → transaction ids
    positionByKey: Record<string, string>;      // positionKey → position id
    positionByStrategy: Record<string, string[]>; // strategyId → position ids
  };
}
```

#### Storage Keys

```
vora_reconciliation_v1_{walletAddress}
```

#### JSON Export Format

```typescript
interface ReconciliationExport {
  exportVersion: string;
  exportedAt: string;                 // ISO timestamp
  walletAddress: string;
  
  data: {
    transactions: Transaction[];
    positions: Position[];
    strategies: Strategy[];
  };
  
  // Checksums for validation
  checksums: {
    transactionCount: number;
    positionCount: number;
    strategyCount: number;
  };
}
```

#### Export/Import Functions

```typescript
function exportReconciliationData(wallet: string): string {
  // Returns JSON string for download
}

function importReconciliationData(jsonString: string): boolean {
  // Validates and imports, returns success
}
```

### Future: Backend Database

When moving to multi-user/cloud:

```sql
-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  tx_hash VARCHAR(66) NOT NULL,
  log_index INT NOT NULL,
  timestamp BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  protocol VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  position_key VARCHAR(255) NOT NULL,
  tokens JSONB NOT NULL,
  usd_value DECIMAL(20, 2) NOT NULL,
  realized_pnl DECIMAL(20, 2),
  fees DECIMAL(20, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'unreconciled',
  position_id UUID REFERENCES positions(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tx_hash, log_index)
);

-- Transaction allocations table
CREATE TABLE transaction_allocations (
  id UUID PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,
  percentage DECIMAL(5, 2) NOT NULL,
  usd_value DECIMAL(20, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Positions table
CREATE TABLE positions (
  id UUID PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  name VARCHAR(255) NOT NULL,
  position_type VARCHAR(20) NOT NULL,
  protocol VARCHAR(50) NOT NULL,
  position_key VARCHAR(255) NOT NULL,
  tokens VARCHAR(20)[] NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  opened_at BIGINT NOT NULL,
  closed_at BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Strategies table
CREATE TABLE strategies (
  id UUID PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tags VARCHAR(50)[],
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  opened_at BIGINT,
  closed_at BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 9. Protocol Extensibility

### Adapter Pattern

Each DeFi protocol implements a standard adapter interface:

```python
from abc import ABC, abstractmethod
from typing import List
from datetime import datetime

class ProtocolAdapter(ABC):
    """Base class for protocol-specific transaction fetching"""
    
    @property
    @abstractmethod
    def protocol_name(self) -> str:
        """Return protocol identifier (e.g., 'uniswap_v3')"""
        pass
    
    @property
    @abstractmethod
    def supported_transaction_types(self) -> List[str]:
        """Return list of transaction types this adapter handles"""
        pass
    
    @abstractmethod
    async def fetch_transactions(
        self,
        wallet_address: str,
        since: datetime,
        until: datetime
    ) -> List[Transaction]:
        """Fetch all transactions for wallet in date range"""
        pass
    
    @abstractmethod
    def extract_position_key(self, raw_tx: dict) -> str:
        """Extract unique position identifier from raw transaction data"""
        pass
    
    @abstractmethod
    async def get_current_position_value(self, position_key: str) -> float:
        """Get current USD value of a position"""
        pass
```

### MVP Adapters

#### UniswapV3Adapter

```python
class UniswapV3Adapter(ProtocolAdapter):
    protocol_name = "uniswap_v3"
    supported_transaction_types = ["lp_mint", "lp_burn", "lp_collect"]
    
    # Uses existing thegraph.py service
    # Position key = NFT token ID
```

#### GmxV2Adapter

```python
class GmxV2Adapter(ProtocolAdapter):
    protocol_name = "gmx_v2"
    supported_transaction_types = [
        "perp_open", "perp_increase", "perp_decrease", "perp_close"
    ]
    
    # Uses existing gmx_subgraph.py service
    # Position key = account + market + collateralToken + isLong
```

#### AaveAdapter

```python
class AaveAdapter(ProtocolAdapter):
    protocol_name = "aave"
    supported_transaction_types = ["stake", "unstake", "reward_claim"]
    
    # New service needed
    # Position key = pool + asset + account
```

### Adding New Protocols (Future)

To add a new protocol:

1. Create adapter class implementing `ProtocolAdapter`
2. Add subgraph/API integration for data fetching
3. Register adapter in `ProtocolRegistry`
4. Add protocol to `ProtocolType` enum
5. Update UI filters to include new protocol

### Protocol Registry

```python
class ProtocolRegistry:
    _adapters: Dict[str, ProtocolAdapter] = {}
    
    @classmethod
    def register(cls, adapter: ProtocolAdapter):
        cls._adapters[adapter.protocol_name] = adapter
    
    @classmethod
    def get_adapter(cls, protocol: str) -> ProtocolAdapter:
        return cls._adapters.get(protocol)
    
    @classmethod
    def fetch_all_transactions(
        cls,
        wallet: str,
        since: datetime,
        until: datetime,
        protocols: List[str] = None
    ) -> List[Transaction]:
        """Fetch from all (or specified) protocols"""
        results = []
        for name, adapter in cls._adapters.items():
            if protocols is None or name in protocols:
                results.extend(
                    adapter.fetch_transactions(wallet, since, until)
                )
        return sorted(results, key=lambda t: t.timestamp, reverse=True)
```

---

## 10. Implementation Phases

### Phase 2.0a: Backend - Transaction Fetching (Week 1)

**Goal:** API endpoints to fetch historical transactions from all protocols

**Tasks:**
- [ ] Create `ProtocolAdapter` base class
- [ ] Implement `UniswapV3Adapter` (extend existing thegraph.py)
  - [ ] Fetch mint events with USD values
  - [ ] Fetch burn events with USD values
  - [ ] Fetch collect events (fee claims)
- [ ] Implement `GmxV2Adapter` (extend existing gmx_subgraph.py)
  - [ ] Fetch position increase events
  - [ ] Fetch position decrease events
  - [ ] Map events to transaction types
- [ ] Implement `AaveAdapter` (new service)
  - [ ] Set up AAVE subgraph integration
  - [ ] Fetch deposit/withdraw events
  - [ ] Fetch reward claim events
- [ ] Create `GET /api/v1/wallet/{address}/transactions` endpoint
- [ ] Add pagination support
- [ ] Add date range filtering

**Deliverable:** API returns paginated transaction history for wallet

### Phase 2.0b: Frontend - Reconcile Page UI (Week 2)

**Goal:** Build the reconciliation interface

**Tasks:**
- [ ] Create `/reconcile` page route
- [ ] Build page layout with sections:
  - [ ] Summary bar component
  - [ ] Filter bar component
  - [ ] Suggestions panel (collapsible)
  - [ ] Transaction list component
  - [ ] Strategy list component
  - [ ] Unassigned positions component
- [ ] Build transaction row component with actions menu
- [ ] Build modals:
  - [ ] Create Position modal
  - [ ] Create Strategy modal
  - [ ] Add to Strategy modal
- [ ] Implement filtering logic
- [ ] Add pagination controls
- [ ] Update navigation to include Reconcile tab

**Deliverable:** Functional UI displaying transactions and strategies

### Phase 2.0c: Allocation Logic & Persistence (Week 3)

**Goal:** Implement the allocation system and local storage

**Tasks:**
- [ ] Define localStorage schema
- [ ] Implement storage service:
  - [ ] Save/load reconciliation data
  - [ ] Index management
  - [ ] Migration support
- [ ] Build allocation logic:
  - [ ] Transaction-level allocation
  - [ ] Position allocation calculation (derived)
  - [ ] Strategy status calculation (derived)
  - [ ] Reduction allocation (pro-rata default)
- [ ] Build allocation modal for reductions
- [ ] Implement JSON export/import
- [ ] Add allocation validation (100% rule)

**Deliverable:** Full allocation workflow with persistence

### Phase 2.0d: Smart Suggestions (Week 4)

**Goal:** Add intelligent suggestions to streamline reconciliation

**Tasks:**
- [ ] Implement temporal grouping detection
- [ ] Implement token matching suggestions
- [ ] Add unallocated position warnings
- [ ] Add unreconciled transaction alerts
- [ ] Build suggestions panel UI
- [ ] Add "Create Strategy from suggestion" workflow

**Deliverable:** Smart suggestions helping users reconcile faster

### Phase 2.0e: Ledger Page Refactor (Week 5)

**Goal:** Update Ledger to read from reconciled data

**Tasks:**
- [ ] Refactor Ledger to use Strategy data
- [ ] Add "Current" tab (open strategies)
- [ ] Add "Historical" tab (closed strategies)
- [ ] Implement date range filtering (MTD, QTD, YTD, Custom)
- [ ] Add per-strategy P&L breakdown
- [ ] Add per-position P&L within strategies
- [ ] Update P&L calculations to respect allocations

**Deliverable:** Ledger showing reconciled strategy performance

### Phase 2.0f: Polish & Testing (Week 6)

**Goal:** Bug fixes, edge cases, and user experience improvements

**Tasks:**
- [ ] Handle edge cases:
  - [ ] Position with 0 value
  - [ ] Strategy with all positions closed
  - [ ] Partial page refresh
- [ ] Add loading states throughout
- [ ] Add error handling and recovery
- [ ] Performance optimization for large transaction lists
- [ ] User testing and feedback incorporation
- [ ] Documentation updates

**Deliverable:** Production-ready reconciliation system

---

## 11. Open Questions & Future Considerations

### Resolved Questions

| Question | Resolution |
|----------|------------|
| Page name | `/reconcile` (not `/positions`) |
| View structure | Single page with collapsible sections |
| Allocation model | Transaction-level allocation |
| Position allocation | Derived from transaction allocations |
| Reduction handling | Default pro-rata, user can override |
| History depth | 6 months initially |
| Persistence (MVP) | localStorage + JSON export |

### Open Questions for Implementation

1. **Auto-position creation:** Should transactions with matching `positionKey` automatically create a Position, or require user action?
   - **Lean:** Auto-create Position, require user action for Strategy

2. **Position naming:** Auto-generate vs require user input?
   - **Lean:** Auto-generate with optional override

3. **Historical price accuracy:** How to handle transactions where we can't get exact historical USD values?
   - **Lean:** Best effort from subgraph, flag as estimated

4. **Mobile responsiveness:** Full feature parity on mobile?
   - **Lean:** MVP is desktop-first, mobile support in polish phase

### Future Enhancements (Post-MVP)

1. **Portfolio layer:** Group strategies into portfolios
2. **Multi-wallet support:** Track positions across multiple wallets
3. **Backend database:** Move from localStorage to cloud persistence
4. **Shared strategies:** Export/import strategies between users
5. **Tax reporting:** Generate tax reports from reconciled data
6. **Additional protocols:** Pancakeswap, Aerodrome, Orca, Raydium, Euler, Silo
7. **Swap/Bridge tracking:** Include token swaps and bridge transactions in cost basis
8. **Gas cost attribution:** Track gas costs per transaction and include in P&L
9. **Notifications:** Alert when positions need attention
10. **Strategy templates:** Pre-built templates for common approaches (delta-neutral, etc.)

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Transaction** | Atomic on-chain event (mint, burn, open, close, etc.) |
| **Position** | Container for transactions sharing the same underlying (one LP, one perp) |
| **Strategy** | User-defined grouping of related positions |
| **Position Key** | Unique identifier for an underlying (LP token ID, perp position key) |
| **Allocation** | Percentage of a transaction assigned to a strategy |
| **Pro-rata** | Proportional distribution based on current allocation percentages |
| **Reconcile** | Process of assigning transactions to positions and strategies |

---

## Appendix B: Reference Links

- **QuickBooks Reconciliation:** Inspiration for single-view reconciliation workflow
- **FIFO/LIFO Accounting:** Inspiration for transaction-level allocation (lot tracking)
- **Uniswap V3 Subgraph:** https://thegraph.com/hosted-service/subgraph/uniswap/uniswap-v3
- **GMX V2 Subgraph:** https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api
- **AAVE Subgraph:** https://thegraph.com/hosted-service/subgraph/aave/protocol-v3

---

*Document maintained by Claude. Updated after each design session.*
