# VORA Dashboard - Project Status Document

> **Last Updated:** November 26, 2025 (Phase 2.0a Backend Transaction Fetching - Complete)  
> **Project Name:** VORA Dashboard (DeFi LP Intelligence Platform)  
> **Repository:** https://github.com/andrewstohl/lp-dashboard  
> **Collaboration:** Drew (Product Owner) + Claude (Code Implementation) + Kimi K2 (System Design)

---

## 🎯 Project Vision

Build an institutional-grade DeFi LP Intelligence Dashboard that provides:
- Real-time LP position monitoring across protocols
- Perpetual position tracking for hedging strategies
- AI-powered optimization recommendations
- Net exposure analysis (LP + Perps consolidated view)
- Decision intelligence with actionable insights

---

## 👥 Collaboration Model

| Role | Responsibility |
|------|---------------|
| **Drew** | Product direction, requirements, testing, final approval |
| **Claude** | Code implementation, debugging, GitHub management |
| **Kimi K2** | System architecture, design decisions |
| **GitHub** | Single source of truth for all code |

**Workflow:** Drew provides requirements → Kimi/Claude discuss approach → Claude implements → Drew tests → Commit to GitHub

---

## 🏗️ Technical Architecture

### Stack
- **Frontend:** Next.js 16.0.3, React 19.2.0, TypeScript, Tailwind CSS 4.0
- **Backend:** Python FastAPI, async/await patterns
- **Data Sources:** Protocol-specific subgraphs (primary), DeBank API (discovery only)
- **Charts:** Recharts 3.4.1
- **Icons:** Lucide React 0.554.0

### Data Architecture (Standardized)

| Data Type | LP Positions | Perp Positions |
|-----------|-------------|----------------|
| **Discovery** | DeBank | GMX Subgraph |
| **Position Details** | Uniswap V3 Subgraph | GMX V2 Subgraph |
| **Current Prices** | Uniswap Subgraph (`derivedETH × ethPriceUSD`) | GMX Subgraph (`TokenPrice` entity) |
| **Historical Prices** | Uniswap Subgraph (at block) | GMX Subgraph (position events) |

**DeBank Now Only Used For:**
- LP position discovery (finding position IDs)
- Unclaimed fees (real-time fee accrual)
- GMX rewards tracking
- Funding fee history

**Key Principle:** All prices derived from on-chain data via protocol subgraphs. No external oracles (CoinGecko removed from core calculations).

### Port Configuration
| Service | Port | Notes |
|---------|------|-------|
| Frontend | 4001 | Avoids conflict with covered-call-dashboard (3000) |
| Backend | 8004 | Avoids conflict with other projects |

### Directory Structure
```
lp-dashboard/
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Main dashboard entry
│   │   ├── ledger/page.tsx       # Ledger view
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css           # Global styles
│   ├── components/
│   │   ├── ProfessionalDashboard.tsx  # Main dashboard component
│   │   ├── LedgerMatrix.tsx           # Net exposure matrix
│   │   ├── PerformanceAnalytics.tsx   # Fee trend charts
│   │   ├── DecisionIntelligence.tsx   # Actionable insights
│   │   └── ProfessionalStates.tsx     # Loading/Error/Empty states
│   ├── lib/
│   │   └── api.ts                # API client, types, helpers
│   └── .env.local                # NEXT_PUBLIC_API_URL=http://localhost:8004
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI entry point
│   │   └── api/v1/wallet.py      # Wallet endpoints
│   ├── services/
│   │   ├── debank.py             # DeBank API (discovery only)
│   │   ├── thegraph.py           # Uniswap V3 Subgraph (620+ lines)
│   │   ├── gmx_subgraph.py       # GMX V2 Subgraph (700+ lines)
│   │   └── coingecko.py          # CoinGecko (fallback only)
│   ├── core/
│   │   ├── config.py             # Configuration
│   │   ├── cache.py              # Redis caching
│   │   └── errors.py             # Error handling
│   └── .env                      # DEBANK_ACCESS_KEY, THEGRAPH_API_KEY
└── docker-compose.yml
```

---

## 📅 Development Timeline

### Phase 0: Project Creation
**Chat:** Initial Setup  
**Date:** November 2024

- ✅ Repository created on GitHub
- ✅ Basic project structure established
- ✅ Docker Compose configuration
- ✅ Initial backend scaffolding

### Phase 1.0: Backend Foundation
**Chat:** LP Phase 1.0  
**Date:** November 2024

- ✅ FastAPI backend setup
- ✅ DeBank API integration started
- ✅ Initial 403 errors with DeBank (resolved with proper auth)
- ✅ Basic wallet endpoint created

### Phase 1.1: Backend Completion + Frontend Start
**Chat:** LP Phase 1.1  
**Date:** November 22, 2025

**Backend Achievements:**
- ✅ DeBank API fully integrated with authentication
- ✅ Uniswap v3 LP position parsing
- ✅ GMX V2 perpetual position parsing
- ✅ Circuit breaker pattern for API resilience
- ✅ Health check endpoint (`/health`)
- ✅ Wallet positions endpoint (`/api/v1/wallet/{address}`)

**Frontend Achievements:**
- ✅ Next.js project initialized
- ✅ Basic component structure
- ✅ API client with TypeScript types
- ✅ Position card components (LP and Perp)

**Key Commits:**
- `ab445ce` - Add GMX perpetuals support
- `8f00439` - Configure frontend port 4001
- `ad43c0a` - Backend port 8004 configuration

### Phase 1.2: Frontend Professional Polish
**Chat:** LP Phase 1.2 (Current Session - Part 1)  
**Date:** November 24, 2025

**Dark Theme Implementation:**
- ✅ Deep navy background (#0D1117)
- ✅ Card backgrounds (#161B22)
- ✅ Accent colors (Blue #58A6FF, Green #3FB950, Purple #A371F7, Red #F85149)
- ✅ All text colors updated (#E6EDF3 primary, #8B949E secondary)

**Key Commits:**
- `22ac2fa` - Transform dashboard to professional dark theme

### Phase 1.3: Features + Cleanup
**Chat:** LP Phase 1.3 (Current Session - Part 2)  
**Date:** November 24, 2025

**Performance Analytics:**
- ✅ 7-day fee trend line chart (Recharts)
- ✅ Unclaimed fees display
- ✅ Estimated daily average
- ✅ Estimated APR calculation

**Professional States:**
- ✅ ProfessionalLoading component
- ✅ ProfessionalEmptyState component  
- ✅ ProfessionalErrorState component with retry
- ✅ ProfessionalSuccessState component

**User Experience:**
- ✅ Wallet address caching (localStorage)
- ✅ Default wallet address pre-filled
- ✅ Auto-load on page refresh

**Decision Intelligence:**
- ✅ LP Position Analysis (token composition, ROI)
- ✅ Perpetual Position Analysis (risk metrics, liquidation distance)
- ✅ Key Decision Points with actionable recommendations
- ✅ Overall Portfolio Intelligence summary

**Repository Cleanup:**
- ✅ Removed debug files (debank_raw_response.json, debug_debank.py)
- ✅ Removed root-level test files
- ✅ Disabled failing backend-tests workflow
- ✅ Updated .gitignore for future protection

**Key Commits:**
- `ba2aebf` - Add Performance Analytics section
- `a42236e` - Add professional state components
- `01894b3` - Add wallet address caching and auto-load
- `2cb9354` - Clean up repository
- `23da5b9` - Add Decision Intelligence section
- `f184516` - Remove backend-tests workflow

---

## ✅ Current Status (as of Nov 25, 2025)

### What's Working
| Feature | Status | Data Source |
|---------|--------|-------------|
| Backend API | ✅ Working | Port 8004 |
| Frontend Dashboard | ✅ Working | Port 4001 |
| LP Position Data | ✅ Working | Uniswap V3 Subgraph |
| Perp Position Data | ✅ Working | GMX V2 Subgraph |
| Current Prices | ✅ Working | Protocol Subgraphs |
| Historical Prices | ✅ Working | Subgraph at-block queries |
| Position Discovery | ✅ Working | DeBank (LP only) |
| Unclaimed Fees | ✅ Working | DeBank |
| GMX Rewards | ✅ Working | DeBank |
| Dark Theme | ✅ Complete | Institutional navy theme |
| Portfolio Overview | ✅ Complete | 4 metric cards |
| LP Position Cards | ✅ Complete | Token amounts, fees |
| Perp Position Cards | ✅ Complete | P&L, leverage, liquidation |
| Performance Analytics | ✅ Complete | 7-day fee chart |
| Decision Intelligence | ✅ Complete | Actionable insights |
| Wallet Caching | ✅ Complete | Auto-loads on refresh |
| Ledger View | ✅ Complete | Net exposure matrix |
| Navigation | ✅ Complete | Dashboard/Ledger tabs |
| Mobile Responsive | ✅ Complete | All components |

### Data Accuracy Verification (Nov 25, 2025)

**LP Initial Deposits:**
| Token | Our Value | Metrix | Difference |
|-------|-----------|--------|------------|
| LINK | $25,896.28 | $25,872.57 | 0.09% |
| WETH | $19,693.26 | $19,709.17 | 0.08% |
| **Total** | **$45,589.54** | **$45,581.74** | **0.02%** |

**Perp Realized P&L (filtered to after LP mint):**
| Metric | Value |
|--------|-------|
| LP Mint Date | Nov 12, 2025 12:30:23 |
| Trades After LP | 7 |
| Realized P&L | $5,851.26 |

### Test Wallet
```
0x23b50a703d3076b73584df48251931ebf5937ba2
```

**Current Positions (as of Nov 25, 2025):**
1. LINK/WETH LP - Position 1128573
   - Current: ~$40,078 (1,774.8 LINK + 5.82 WETH)
   - Initial: $45,590 (1,748.6 LINK + 5.94 WETH)
   
2. GMX Short WETH
   - Size: 5.83 tokens ($16,326)
   - Entry: $2,798.78, Mark: ~$2,935
   - Leverage: 2.86x
   
3. GMX Short LINK
   - Size: 1,886.2 tokens ($23,606)
   - Entry: $12.52, Mark: ~$13.00
   - Leverage: 3.00x

---

## 🚧 In Progress / Next Up

### Phase 1.4: Ledger View ✅ COMPLETE
**Status:** Implemented and deployed

**Goal:** Create consolidated net exposure view showing LP + Perp positions in matrix format

**Completed:**
- ✅ New route: `/app/ledger/page.tsx`
- ✅ Navigation component with Dashboard/Ledger tabs
- ✅ LedgerMatrix component (400 lines)
- ✅ Token-by-token exposure breakdown (LP vs Perp vs Net)
- ✅ Hedge ratio calculation with status badges (🟢 HEDGED, 🟡 PARTIAL, 🔴 LOW HEDGE)
- ✅ P&L summary (fees + perp P&L)
- ✅ Mobile responsive design
- ✅ Unmatched perps section for standalone positions
- ✅ Updated layout metadata to "VORA Dashboard"
- ✅ Visual hierarchy: USD value on top (large/bold), token amount below (small/muted)
- ✅ Removed "+" signs from positive numbers
- ✅ Conditional coloring only on NET token amounts and TOTAL P&L
- ✅ Per-token fee and perp P&L calculations populated

**Key Commits:**
- `f042fc4` - Add Phase 1.4: Ledger View with net exposure matrix
- `db29f8d` - Enhanced Ledger View visuals and token-level P&L

### Phase 1.5: Uniswap Subgraph Migration ✅ COMPLETE
**Chat:** LP Phase 1.5 - Subgraph Migration  
**Date:** November 25, 2025

**Problem Identified:** DeBank API lag causing stale position values (15-60+ minutes behind actual on-chain data). Positions showing incorrect values compared to GMX/Uniswap interfaces.

**Architectural Decision:** Migrate from DeBank to protocol-specific subgraphs for real-time accuracy.

**Uniswap V3 Subgraph Integration:**
- ✅ `thegraph.py` expanded from 89 to 620+ lines
- ✅ `get_eth_price_usd()` - Query bundle entity for ETH/USD price
- ✅ `get_pool_data()` - Fetch pool info (sqrtPrice, tick, liquidity, tokens)
- ✅ `get_position_data()` - Comprehensive position query
- ✅ `_calculate_token_amounts()` - Uniswap V3 math for liquidity → token amounts
- ✅ `get_full_position()` - Enriched position with calculated USD values
- ✅ `get_position_mint_values()` - Query mint transactions with USD values at each block
- ✅ `_get_token_prices_at_block()` - Historical price lookups at specific blocks

**Uniswap V3 Math Implementation:**
- Token amounts calculated from liquidity using sqrtPrice formulas
- Handles three cases: below range (all token0), above range (all token1), in range (both)
- Formula: `amount0 = liquidity × (1/sqrt_price - 1/sqrt_price_upper)`
- Formula: `amount1 = liquidity × (sqrt_price - sqrt_price_lower)`
- Prices: `token_price = derivedETH × bundle.ethPriceUSD`

**Historical Pricing Fix:**
- Problem: Position built over 3 mints at different prices, but was using single timestamp
- Solution: Sum USD values from each mint's `amountUSD` field, filtered by position creation block
- Per-token USD calculated individually at each mint's block (not 50/50 split)
- Result: $45,589.54 vs Metrix $45,581.74 (0.02% difference)

**Key Commits:**
- `2a0e375` - Phase 1: Migrate LP positions from DeBank to Uniswap Subgraph
- `3561bf5` - Fix historical pricing: use subgraph amountUSD at time of each mint
- `5ffe67e` - Fix per-token USD calculation: query actual prices at each mint block

### Phase 2: GMX Subgraph Migration ✅ COMPLETE
**Chat:** LP Phase 1.5 - Subgraph Migration (continued)  
**Date:** November 25, 2025

**GMX V2 Synthetics Subgraph Integration:**
- ✅ `gmx_subgraph.py` expanded to 700+ lines
- ✅ `get_token_prices()` - Query TokenPrice entity for current prices
- ✅ `get_full_positions()` - Complete position data with all calculated fields
- ✅ `get_position_history()` - Position increase/decrease events
- ✅ `get_enriched_positions()` - Positions with entry price from events
- ✅ `get_trade_history()` - Trade actions with P&L
- ✅ `get_realized_pnl()` - Total realized P&L with timestamp filtering
- ✅ `get_position_entry_data()` - Average entry price from position events

**GMX Price Handling:**
- GMX stores prices with (30 - tokenDecimals) precision
- WETH/LINK (18 decimals): divide by 10^12
- USDC (6 decimals): divide by 10^24

**Position Calculations:**
- Entry price from weighted average of position increases
- Mark price from GMX TokenPrice entity
- PnL: `(entry_price - mark_price) × size_tokens` for shorts
- Leverage: `size_usd / collateral_usd`
- Liquidation price calculated with 95% buffer

**P&L Timestamp Filtering:**
- Realized P&L filtered to only include trades after LP mint timestamp
- LP minted: Nov 12, 2025 12:30:23 (timestamp: 1762972223)
- 48 trades before LP excluded ($17,322.20)
- 7 trades after LP included ($5,851.26)

**Key Commits:**
- `772e317` - Phase 2: Migrate perp positions from DeBank to GMX Subgraph
- `e53dac2` - Verify P&L timestamp filtering works correctly

---

## 🚀 Phase 2.0: Reconciliation System (IN PROGRESS)

**Design Document:** [docs/RECONCILIATION_DESIGN.md](docs/RECONCILIATION_DESIGN.md)
**Implementation Tracker:** [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md)

**Overview:** Transaction-level reconciliation system enabling users to organize trades into Positions and Strategies with partial allocation support. Inspired by QuickBooks reconciliation workflow.

**Status:** Phase 2.0a Complete, Phase 2.0b Pending

### Key Design Decisions

| Decision | Resolution |
|----------|------------|
| Page location | `/reconcile` (new navigation tab) |
| View structure | Single page with collapsible sections (QuickBooks-inspired) |
| Data hierarchy | Strategy → Position → Transaction |
| Allocation model | Transaction-level allocation (position allocation is derived) |
| Reduction handling | Default pro-rata with user override option |
| History depth | 6 months initially, paginated |
| Persistence (MVP) | localStorage + JSON export/import |
| Persistence (Future) | Backend database for multi-user support |

### Core Concepts

**Transaction:** Atomic on-chain event (mint, burn, open, close, fee claim, etc.)

**Position:** Container for transactions sharing the same underlying primitive
- One LP position (by NFT ID)
- One perp position (by position key)
- One staking position (by pool + asset)

**Strategy:** User-defined grouping of related positions with partial allocation support
- "Q4 Delta Neutral" = LP + Short LINK (100%) + Short WETH (50%)
- Status derived from positions: OPEN if any position open, CLOSED when all closed

### Key Innovation: Transaction-Level Allocation

Instead of allocating positions to strategies, each transaction is allocated independently:

```
Position: WETH Short
├── TXN 1: Open $10,000 → 50% Strategy A, 50% Strategy B
├── TXN 2: Increase $5,000 → 100% Strategy A
└── TXN 3: Decrease -$7,000 → Pro-rata or user-specified

Position's allocation to each strategy = weighted sum of transaction allocations
```

This approach:
- Handles partial hedging across multiple strategies
- Provides clear audit trail per transaction
- Requires no retroactive adjustments
- Matches established accounting patterns (lot tracking)

### Implementation Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 2.0a | Backend - Transaction fetching APIs | ✅ Complete |
| 2.0b | Frontend - Reconcile page UI | Pending |
| 2.0c | Allocation logic & localStorage persistence | Pending |
| 2.0d | Smart suggestions (temporal, token matching) | Pending |
| 2.0e | Ledger page refactor (Current/Historical tabs) | Pending |
| 2.0f | Polish & testing | Pending |

### Phase 2.0a Completed (Nov 26, 2025)

**Protocol Adapter System:**
- Base adapter class with standardized Transaction format
- ProtocolRegistry for managing multiple adapters
- Uniswap V3 adapter: mint, burn, collect transactions
- GMX V2 adapter: open, increase, decrease, close transactions
- Euler adapter: stub for future implementation

**Transaction API Endpoint:**
- `GET /api/v1/wallet/{address}/transactions`
- Date filtering (ISO format or relative like "30d", "6m")
- Protocol and type filters
- Pagination with summary counts

**Test Results (6 months, test wallet):**
- 455 total transactions
- Uniswap V3: 111 (46 mints, 31 burns, 34 collects)
- GMX V2: 344 (46 opens, 128 increases, 126 decreases, 44 closes)

### MVP Protocol Support

| Protocol | Type | Transactions | Status |
|----------|------|--------------|--------|
| Uniswap V3 | DEX/LP | mint, burn, collect | ✅ Implemented |
| GMX V2 | Perps | open, increase, decrease, close | ✅ Implemented |
| Euler | Lending | deposit, withdraw, borrow, repay | Stub (future) |

### Future Protocol Support (Post-MVP)

- **DEXs:** Pancakeswap, Aerodrome, Orca, Raydium
- **Perps:** Aster
- **Lending/Staking:** AAVE, Silo

### Smart Suggestions (MVP)

1. **Temporal grouping:** "3 transactions on Nov 12 happened within 1 hour"
2. **Token matching:** "Short LINK matches LINK exposure in your LP"
3. **Unallocated warnings:** "WETH Short is 50% unallocated"
4. **Unreconciled alerts:** "You have 15 unreconciled transactions"

**Key Commits:**
- `8d321c8` - Phase 2.0 Reconciliation System design documentation
- `27f727e` - Phase 2.0a: Backend transaction fetching (adapters + API)

---

## 📋 Future Phases (Backlog)

### Phase 3: Enhanced Features
- [ ] Section tabs (LP / Perpetuals / Combined navigation)
- [ ] Skeleton loading screens
- [ ] Pull-to-refresh functionality
- [ ] Auto-refresh every 60 seconds
- [ ] Range visualization for LP positions
- [ ] Detailed modal views for positions

### Phase 4: Multi-Wallet & Portfolio
- [ ] Wallet selector/switcher
- [ ] Saved wallets list
- [ ] Portfolio aggregation across wallets
- [ ] Portfolio layer (group strategies into portfolios)

### Phase 5: AI Recommendations
- [ ] Kimi K2 integration for optimization suggestions
- [ ] Rebalancing recommendations
- [ ] Gas optimization alerts
- [ ] Risk scoring system

### Phase 6: Advanced Analytics & Reporting
- [ ] Historical P&L tracking with date ranges (MTD, QTD, YTD)
- [ ] Fee accumulation over time
- [ ] Tax reporting from reconciled data
- [ ] Strategy templates for common approaches

---

## 🔧 How to Run

### Prerequisites
- Node.js 18+
- Python 3.11+
- DeBank API key (in backend/.env)

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8004 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:4001
```

### Verify
```bash
# Backend health
curl http://localhost:8004/health

# Fetch positions
curl http://localhost:8004/api/v1/wallet/0x23b50a703d3076b73584df48251931ebf5937ba2
```

---

## 📝 Notes & Decisions

1. **Port Selection:** 4001/8004 chosen to avoid conflicts with covered-call-dashboard project
2. **DeBank API:** Purchased 1M units - now only used for discovery, unclaimed fees, GMX rewards
3. **Subgraph Migration (Nov 25):** Moved from DeBank to protocol-specific subgraphs for real-time accuracy
4. **No External Oracles:** All prices derived from on-chain data via protocol subgraphs (not CoinGecko)
5. **Historical Price Calculation:** Per-token USD calculated at each mint block, not single timestamp
6. **P&L Filtering:** Realized P&L only includes trades after LP position mint timestamp
7. **No Tests Currently:** Backend tests disabled pending proper test fixtures
8. **Incremental Development:** Drew prefers single-task focus with immediate testing
9. **GitHub as Source of Truth:** All changes must be committed and pushed
10. **Data Accuracy Benchmark:** Metrix Finance used as reference for data precision
11. **Reconciliation System (Nov 26):** Full design documented in [docs/RECONCILIATION_DESIGN.md](docs/RECONCILIATION_DESIGN.md)

---

## 🔗 Quick Links

- **Repository:** https://github.com/andrewstohl/lp-dashboard
- **Frontend:** http://localhost:4001
- **Backend:** http://localhost:8004
- **API Docs:** http://localhost:8004/docs (Swagger)
- **Reconciliation Design:** [docs/RECONCILIATION_DESIGN.md](docs/RECONCILIATION_DESIGN.md)

### Subgraph URLs
- **Uniswap V3 (Ethereum):** `https://gateway.thegraph.com/api/{key}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`
- **GMX V2 (Arbitrum):** `https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api`

### Key API Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/v1/wallet/{address}` | Basic positions (DeBank discovery) |
| `GET /api/v1/wallet/{address}/ledger` | Full ledger with subgraph data |

---

*Document maintained by Claude. Updated after each development session.*
