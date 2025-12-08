"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { TransactionsColumn } from "@/components/build/TransactionsColumn";
import { PositionsColumn } from "@/components/build/PositionsColumn";
import { StrategiesColumn } from "@/components/build/StrategiesColumn";
import { CreateStrategyModal } from "@/components/build/CreateStrategyModal";
import { CreatePositionModal } from "@/components/build/CreatePositionModal";

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
}

interface TransactionGroup {
  groupKey: string;
  chain: string;
  protocol: string;
  protocolName: string;
  positionType: string;
  tokens: string[];
  tokensDisplay: string;
  transactions: Transaction[];
  transactionCount: number;
  totalIn: number;
  totalOut: number;
  netValue: number;
  latestActivity: number;
}

interface TokenInfo {
  symbol?: string;
  optimized_symbol?: string;
  name?: string;
  price?: number;
  logo_url?: string;
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
  const [transactionGroups, setTransactionGroups] = useState<TransactionGroup[]>([]);
  const [tokenDict, setTokenDict] = useState<Record<string, TokenInfo>>({});
  const [chainNames, setChainNames] = useState<Record<string, string>>(DEFAULT_CHAIN_NAMES);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [positionFilter, setPositionFilter] = useState<"all" | "open" | "closed">("all");
  const [showCreateStrategy, setShowCreateStrategy] = useState(false);
  const [showCreatePosition, setShowCreatePosition] = useState(false);

  // Load cached wallet on mount
  useEffect(() => {
    const cached = localStorage.getItem("vora_wallet_address");
    if (cached) {
      setWalletAddress(cached);
      setInputValue(cached);
    }
  }, []);

  // Fetch grouped transactions
  const fetchData = useCallback(async (address: string, forceRefresh: boolean = false) => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/api/v1/build/transactions/grouped?wallet=${address}&since=2m${forceRefresh ? '&force_refresh=true' : ''}`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      if (result.status === "success") {
        setTransactionGroups(result.data.groups || []);
        setTokenDict(result.data.tokenDict || {});
        setChainNames(result.data.chainNames || DEFAULT_CHAIN_NAMES);
        setTotalTransactions(result.data.totalTransactions || 0);
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

  // Auto-fetch when wallet changes
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
      fetchData(walletAddress, true);
    }
  };

  // Calculate summary stats
  const totalGroupTransactions = transactionGroups.reduce(
    (sum, g) => sum + g.transactionCount,
    0
  );

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
              {walletAddress && (
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
      {walletAddress && !loading && (
        <div className="border-b border-[#30363D] bg-[#161B22]/50">
          <div className="max-w-[1800px] mx-auto px-6 py-2">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-[#8B949E]">
                <span className="text-[#E6EDF3] font-medium">{transactionGroups.length}</span> protocol groups
              </span>
              <span className="text-[#8B949E]">
                <span className="text-[#E6EDF3] font-medium">{totalGroupTransactions}</span> transactions
              </span>
              <span className="text-[#30363D]">|</span>
              <span className="text-[#8B949E]">
                <span className="text-[#3FB950] font-medium">0</span> positions
              </span>
              <span className="text-[#30363D]">|</span>
              <span className="text-[#8B949E]">
                <span className="text-[#A371F7] font-medium">0</span> strategies
              </span>
              <span className="text-[#8B949E] ml-auto">
                Last 2 months
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
        ) : loading && transactionGroups.length === 0 ? (
          /* Loading State */
          <div className="flex items-center justify-center h-[600px]">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-[#58A6FF] mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-[#E6EDF3] mb-2">
                Loading Transactions...
              </h2>
              <p className="text-[#8B949E]">
                Fetching transactions from the last 2 months
              </p>
            </div>
          </div>
        ) : (
          /* Three Column Grid */
          <div className="grid grid-cols-3 gap-6 h-[calc(100vh-220px)]">
            {/* Column 1: Transaction Groups by Protocol */}
            <TransactionsColumn
              groups={transactionGroups}
              tokenDict={tokenDict}
              chainNames={chainNames}
              isLoading={loading}
              onDragStart={(txId, groupKey) => console.log('Drag started:', txId)}
            />

            {/* Column 2: Positions */}
            <PositionsColumn
              positions={[]}
              tokenDict={tokenDict}
              chainNames={chainNames}
              filter={positionFilter}
              onFilterChange={setPositionFilter}
              onRemoveTransaction={() => {}}
              onRenamePosition={() => {}}
              onCreatePosition={() => setShowCreatePosition(true)}
              onDropTransaction={() => {}}
              isLoading={loading}
            />

            {/* Column 3: Strategies */}
            <StrategiesColumn
              strategies={[]}
              positions={[]}
              onCreateStrategy={() => setShowCreateStrategy(true)}
              onDeleteStrategy={() => {}}
              isLoading={loading}
            />
          </div>
        )}
      </main>

      {/* Create Strategy Modal */}
      <CreateStrategyModal
        isOpen={showCreateStrategy}
        onClose={() => setShowCreateStrategy(false)}
        onSubmit={() => {}}
        availablePositions={[]}
      />

      {/* Create Position Modal */}
      <CreatePositionModal
        isOpen={showCreatePosition}
        onClose={() => setShowCreatePosition(false)}
        onSubmit={() => {}}
      />
    </div>
  );
}
