const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// =============================================================================
// Transaction Types (for Reconciliation)
// =============================================================================

export interface TransactionToken {
  symbol: string;
  amount: number;
  usdValue: number;
  direction: 'in' | 'out';
}

export interface Transaction {
  // Identity
  id: string;
  txHash: string;
  logIndex: number;
  timestamp: number;
  blockNumber: number;
  
  // Classification
  protocol: 'uniswap_v3' | 'gmx_v2' | 'aave' | 'euler' | string;
  type: 'lp_mint' | 'lp_burn' | 'lp_collect' | 'perp_open' | 'perp_increase' | 'perp_decrease' | 'perp_close' | string;
  
  // Position linkage
  positionKey: string;
  
  // Token details
  tokens: TransactionToken[];
  
  // Value
  usdValue: number;
  realizedPnl: number | null;
  fees: number | null;
  
  // Reconciliation status
  status: 'unreconciled' | 'reconciled';
  positionId: string | null;
}

export interface TransactionsResponse {
  status: 'success';
  data: {
    transactions: Transaction[];
    wallet: string;
    filters: {
      since: string;
      until: string;
      protocol: string | null;
      type: string | null;
    };
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
    summary: {
      totalTransactions: number;
      byProtocol: Record<string, number>;
      byType: Record<string, number>;
    };
  };
}

export interface FetchTransactionsParams {
  since?: string;  // ISO date or relative like "30d", "6m"
  until?: string;  // ISO date
  protocol?: string;
  type?: string;
  page?: number;
  limit?: number;
}

// Fetch transactions for reconciliation
export async function fetchTransactions(
  address: string, 
  params: FetchTransactionsParams = {}
): Promise<TransactionsResponse> {
  const searchParams = new URLSearchParams();
  
  if (params.since) searchParams.set('since', params.since);
  if (params.until) searchParams.set('until', params.until);
  if (params.protocol) searchParams.set('protocol', params.protocol);
  if (params.type) searchParams.set('type', params.type);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  
  const queryString = searchParams.toString();
  const url = `${API_BASE}/api/v1/wallet/${address}/transactions${queryString ? `?${queryString}` : ''}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.statusText}`);
  }
  
  return response.json();
}

// =============================================================================
// Position Types
// =============================================================================

// Token Info
export interface TokenInfo {
  symbol: string;
  address: string;
  amount: number;
  price: number;
  value_usd: number;
}

// Initial Deposit Info
export interface InitialDeposit {
  token0: { amount: number; value_usd: number };
  token1: { amount: number; value_usd: number };
}

// Uniswap v3 LP Position (enriched)
export interface LPPosition {
  pool_name: string;
  pool_address: string;
  position_index: string;
  chain: string;
  fee_tier?: number;  // VERIFIED from The Graph (e.g., 0.0005 for 0.05%)
  token0: TokenInfo;
  token1: TokenInfo;
  total_value_usd: number;
  unclaimed_fees_usd: number;
  reward_tokens?: Array<{
    symbol: string;
    address: string;
    amount: number;
    value_usd: number;
  }>;
  // Enriched fields from ledger endpoint
  initial_deposits?: InitialDeposit;
  initial_total_value_usd?: number;
  claimed_fees?: { token0: number; token1: number; total: number };
  gas_fees_usd?: number;
  transaction_count?: number;
}

// GMX Perpetual Position (enriched)
export interface PerpetualPosition {
  type: "perpetual";
  protocol: string;
  position_name: string;
  chain: string;
  side: "Long" | "Short";
  base_token: {
    symbol: string;
    address: string;
    price: number;
  };
  margin_token: TokenInfo;
  position_size: number;
  position_value_usd: number;
  entry_price: number;
  mark_price: number;
  liquidation_price: number;
  leverage: number;
  pnl_usd: number;
  total_value_usd: number;
  debt_usd: number;
  net_value_usd: number;
  position_index: string;
  // Enriched fields from ledger endpoint
  initial_margin_usd?: number;
  funding_rewards_usd?: number;
}

// GMX Rewards
export interface GMXRewards {
  rewards: Array<{
    symbol: string;
    address: string;
    amount: number;
    price: number;
    value_usd: number;
  }>;
  total_value_usd: number;
}

// Union type for all positions
export type Position = LPPosition | PerpetualPosition;

// API Response
export interface WalletPositionsResponse {
  status: "success";
  data: {
    positions: Position[];
    wallet: string;
    cached: boolean;
    is_stale: boolean;
    fetched_at?: string;
  };
}

// GMX History from transaction parsing
export interface PerpHistory {
  realized_pnl: number;
  current_margin: number;
  total_funding_claimed: number;
}

// Ledger API Response
export interface LedgerResponse {
  status: "success";
  data: {
    wallet: string;
    lp_positions: LPPosition[];
    perp_positions: PerpetualPosition[];
    gmx_rewards: GMXRewards;
    perp_history?: PerpHistory;
    total_gas_fees_usd: number;
  };
}

// Helper to check if position is LP or Perpetual
export function isLPPosition(position: Position): position is LPPosition {
  return !("type" in position);
}

export function isPerpetualPosition(position: Position): position is PerpetualPosition {
  return "type" in position && position.type === "perpetual";
}

// Fetch wallet positions from backend
export async function getWalletPositions(address: string): Promise<WalletPositionsResponse> {
  const response = await fetch(`${API_BASE}/api/v1/wallet/${address}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.statusText}`);
  }
  
  return response.json();
}

// Fetch enriched ledger data
export async function getWalletLedger(address: string): Promise<LedgerResponse> {
  const response = await fetch(`${API_BASE}/api/v1/wallet/${address}/ledger`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.statusText}`);
  }
  
  return response.json();
}

// Formatting helpers
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompactCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(2)}K`;
  }
  return formatCurrency(amount);
}

export function formatPercentage(amount: number, decimals: number = 2): string {
  return `${amount.toFixed(decimals)}%`;
}

export function formatTokenAmount(amount: number, decimals: number = 4): string {
  return amount.toFixed(decimals);
}
