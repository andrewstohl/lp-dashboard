"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { TransactionsColumn } from "@/components/build/TransactionsColumn";
import { PositionsColumn } from "@/components/build/PositionsColumn";
import { StrategiesColumn } from "@/components/build/StrategiesColumn";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8004";

interface Transaction {
  id: string;
  chain: string;
  time_at: number;
  project_id?: string;
  cate_id?: string;
  tx?: {
    name?: string;
    hash?: string;
  };
  sends?: Array<{
    token_id: string;
    amount: number;
  }>;
  receives?: Array<{
    token_id: string;
    amount: number;
  }>;
  _category?: string;
  _matched?: boolean;  // Whether this tx is linked to a position
}

interface TokenInfo {
  symbol?: string;
  optimized_symbol?: string;
  name?: string;
  price?: number;
  logo_url?: string;
  is_scam?: boolean;
}

interface Position {
  id: string;
  protocol: string;
  protocolName: string;
  chain: string;
  type: string;
  name: string;
  displayName?: string;
  positionIndex?: string;
  valueUsd: number;
  status: "open" | "closed";
  transactionCount: number;
  transactions?: Transaction[];
  // Type-specific
  side?: string;
  leverage?: number;
  pnlUsd?: number;
  tokens?: Array<{
    symbol: string;
    address: string;
    amount: number;
    price: number;
    valueUsd: number;
  }>;
  totalRewardsUsd?: number;
}

interface Strategy {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "open" | "closed";
  positionIds: string[];
  totalValueUsd: number;
  totalPnlUsd?: number;
  createdAt: number;
}

interface BuildData {
  transactions: Transaction[];
  positions: Position[];
  openPositions: Position[];
  closedPositions: Position[];
  unmatchedTransactions: Transaction[];
  tokenDict: Record<string, TokenInfo>;
  projectDict: Record<string, { name: string; logo_url?: string }>;
  chainNames?: Record<string, string>;
  summary: {
    total: number;
    totalUnfiltered?: number;
    filtered?: number;
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    matchedTransactions: number;
    unmatchedTransactions: number;
    matchRate: string;
    byCategory?: Record<string, number>;
    byChain?: Record<string, number>;
  };
}

const DEFAULT_CHAIN_NAMES: Record<string, string> = {
  eth: "Ethereum",
  arb: "Arbitrum",
  op: "Optimism",
  base: "Base",
  matic: "Polygon",
  bsc: "BNB Chain",
};

export default function BuildPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BuildData | null>(null);
  const [positionFilter, setPositionFilter] = useState<"all" | "open" | "closed">("all");
  
  // Strategies (in-memory for now, Phase 7 will add persistence)
  const [strategies, setStrategies] = useState<Strategy[]>([]);

  // Load cached wallet on mount
  useEffect(() => {
    const cached = localStorage.getItem("vora_wallet_address");
    if (cached) {
      setWalletAddress(cached);
      setInputValue(cached);
    }
  }, []);

  // Fetch data when wallet changes
  const fetchData = useCallback(async (address: string) => {
    if (!address) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${API_URL}/api/v1/build/positions/with-transactions?wallet=${address}&since=6m`
      );
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.status === "success") {
        // Mark transactions that are matched to positions
        const matchedTxIds = new Set<string>();
        (result.data.positions || []).forEach((pos: Position) => {
          (pos.transactions || []).forEach((tx: Transaction) => {
            matchedTxIds.add(tx.id);
          });
        });
        
        // Add _matched flag to all transactions
        const transactionsWithMatchFlag = (result.data.transactions || []).map((tx: Transaction) => ({
          ...tx,
          _matched: matchedTxIds.has(tx.id),
        }));
        
        // Get truly unmatched transactions (not linked to any position)
        const unmatchedTxs = transactionsWithMatchFlag.filter((tx: Transaction) => !tx._matched);
        
        setData({
          ...result.data,
          transactions: transactionsWithMatchFlag,
          unmatchedTransactions: unmatchedTxs,
        });
      } else {
        throw new Error(result.detail?.error || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch when wallet address is set
  useEffect(() => {
    if (walletAddress) {
      fetchData(walletAddress);
    }
  }, [walletAddress, fetchData]);

  const handleLoadWallet = () => {
    if (!inputValue.trim()) return;
    const address = inputValue.trim().toLowerCase();
    setWalletAddress(address);
    localStorage.setItem("vora_wallet_address", address);
  };

  const handleRefresh = () => {
    if (walletAddress) {
      fetchData(walletAddress);
    }
  };

  const handleCreateStrategy = () => {
    // TODO: Open create strategy modal (Phase 6)
    console.log("Create strategy clicked - implement in Phase 6");
  };

  // Get chain names from data or use defaults
  const chainNames = data?.chainNames || DEFAULT_CHAIN_NAMES;

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Header */}
      <header className="border-b border-[#30363D] bg-[#161B22]">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-[#E6EDF3]">VORA</h1>
              <Navigation />
            </div>
            {/* Wallet Input */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B949E]" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLoadWallet()}
                  placeholder="Enter wallet address..."
                  className="w-[420px] pl-10 pr-4 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#8B949E] focus:outline-none focus:border-[#58A6FF]"
                />
              </div>
              <button
                onClick={handleLoadWallet}
                disabled={loading || !inputValue.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2EA043] disabled:bg-[#21262D] disabled:text-[#8B949E] text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Load
              </button>
              {data && (
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="p-2 text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D] rounded-lg transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Summary Bar */}
      {data && !loading && (
        <div className="border-b border-[#30363D] bg-[#161B22]/50">
          <div className="max-w-[1800px] mx-auto px-6 py-2">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-[#8B949E]">
                <span className="text-[#E6EDF3] font-medium">{data.summary.totalPositions}</span> positions
              </span>
              <span className="text-[#8B949E]">
                <span className="text-[#3FB950] font-medium">{data.summary.openPositions}</span> open
              </span>
              <span className="text-[#8B949E]">
                <span className="text-[#E6EDF3] font-medium">{data.summary.closedPositions}</span> closed
              </span>
              <span className="text-[#30363D]">|</span>
              <span className="text-[#8B949E]">
                <span className="text-[#E6EDF3] font-medium">{data.summary.matchedTransactions}</span> matched txs
              </span>
              <span className="text-[#8B949E]">
                <span className="text-[#F0883E] font-medium">{data.unmatchedTransactions?.length || 0}</span> unmatched
              </span>
              <span className="text-[#8B949E]">
                Match rate: <span className="text-[#58A6FF] font-medium">{data.summary.matchRate}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-[#F8514933] border border-[#F85149] rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[#F85149]" />
            <span className="text-[#F85149]">{error}</span>
          </div>
        )}

        {!walletAddress ? (
          /* Empty State - No Wallet */
          <div className="flex items-center justify-center h-[600px]">
            <div className="text-center">
              <Wallet className="w-16 h-16 text-[#30363D] mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-[#E6EDF3] mb-2">
                Enter Wallet Address to Begin
              </h2>
              <p className="text-[#8B949E]">
                Build your portfolio by organizing transactions into positions and strategies
              </p>
            </div>
          </div>
        ) : loading && !data ? (
          /* Initial Loading State */
          <div className="flex items-center justify-center h-[600px]">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-[#58A6FF] mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-[#E6EDF3] mb-2">
                Loading Portfolio...
              </h2>
              <p className="text-[#8B949E]">
                Fetching transactions and positions from DeBank
              </p>
            </div>
          </div>
        ) : (
          /* Three Column Grid */
          <div className="grid grid-cols-3 gap-6 h-[calc(100vh-220px)]">
            {/* Column 1: Unmatched Transactions */}
            <TransactionsColumn
              transactions={data?.unmatchedTransactions || []}
              tokenDict={data?.tokenDict || {}}
              projectDict={data?.projectDict || {}}
              chainNames={chainNames}
              isLoading={loading}
            />

            {/* Column 2: Positions */}
            <PositionsColumn
              positions={data?.positions || []}
              tokenDict={data?.tokenDict || {}}
              chainNames={chainNames}
              filter={positionFilter}
              onFilterChange={setPositionFilter}
              isLoading={loading}
            />

            {/* Column 3: Strategies */}
            <StrategiesColumn
              strategies={strategies}
              positions={data?.positions || []}
              onCreateStrategy={handleCreateStrategy}
              isLoading={loading}
            />
          </div>
        )}
      </main>
    </div>
  );
}
