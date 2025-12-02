"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Wallet, RefreshCw, Loader2, AlertCircle, Clock, DollarSign } from "lucide-react";
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
  _flowDirection?: "INCREASE" | "DECREASE" | "OVERHEAD";
  _netValue?: number;
  _totalIn?: number;
  _totalOut?: number;
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
  isOpen?: boolean;
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

interface UserPosition {
  id: string;
  name: string;
  description?: string;
  chain?: string;
  protocol?: string;
  position_type?: string;
  status: string;
  transactionIds: string[];
  transactionCount: number;
  created_at: string;
  updated_at: string;
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
  const [transactionGroups, setTransactionGroups] = useState<TransactionGroup[]>([]);
  const [positionFilter, setPositionFilter] = useState<"all" | "open" | "closed">("all");
  
  // Hidden transactions (persisted in localStorage)
  const [hiddenTxIds, setHiddenTxIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  
  // Strategies (from API)
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [showCreateStrategy, setShowCreateStrategy] = useState(false);

  // User-created positions (from API)
  const [userPositions, setUserPositions] = useState<UserPosition[]>([]);
  const [showCreatePosition, setShowCreatePosition] = useState(false);
  const [assignedTxIds, setAssignedTxIds] = useState<Set<string>>(new Set());
  
  // Price enrichment state
  const [priceInfo, setPriceInfo] = useState<{
    historicalPrices: number;
    currentPrices: number;
    needsEnrichment: boolean;
  } | null>(null);
  const [enrichingPrices, setEnrichingPrices] = useState(false);

  // Load cached wallet and hidden transactions on mount
  useEffect(() => {
    const cached = localStorage.getItem("vora_wallet_address");
    if (cached) {
      setWalletAddress(cached);
      setInputValue(cached);
      
      // Load hidden transactions for this wallet
      const hiddenKey = `vora_hidden_txs_${cached.toLowerCase()}`;
      const hiddenData = localStorage.getItem(hiddenKey);
      if (hiddenData) {
        try {
          setHiddenTxIds(new Set(JSON.parse(hiddenData)));
        } catch (e) {
          console.error("Failed to load hidden transactions:", e);
        }
      }
    }
  }, []);

  // Fetch data when wallet changes
  const fetchData = useCallback(async (address: string) => {
    if (!address) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch grouped transactions
      const groupedResponse = await fetch(
        `${API_URL}/api/v1/build/transactions/grouped?wallet=${address}&since=6m`
      );
      
      if (!groupedResponse.ok) {
        throw new Error(`API error: ${groupedResponse.status}`);
      }
      
      const groupedResult = await groupedResponse.json();
      
      if (groupedResult.status === "success") {
        setTransactionGroups(groupedResult.data.groups || []);
        
        // Capture price info
        if (groupedResult.data.priceInfo) {
          setPriceInfo(groupedResult.data.priceInfo);
        }
        
        // Set basic data for token dict and project dict
        setData({
          transactions: [],
          positions: [],
          openPositions: [],
          closedPositions: [],
          unmatchedTransactions: [],
          tokenDict: groupedResult.data.tokenDict || {},
          projectDict: groupedResult.data.projectDict || {},
          summary: {
            total: groupedResult.data.totalTransactions || 0,
            totalPositions: 0,
            openPositions: 0,
            closedPositions: 0,
            matchedTransactions: 0,
            unmatchedTransactions: groupedResult.data.totalTransactions || 0,
            matchRate: "0%",
          }
        });
      } else {
        throw new Error(groupedResult.detail?.error || "Failed to fetch data");
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

  // Transaction hiding handlers
  const handleHideTransaction = (txId: string) => {
    setHiddenTxIds((prev) => {
      const next = new Set(prev);
      next.add(txId);
      // Persist to localStorage
      const hiddenKey = `vora_hidden_txs_${walletAddress.toLowerCase()}`;
      localStorage.setItem(hiddenKey, JSON.stringify([...next]));
      return next;
    });
  };

  const handleUnhideTransaction = (txId: string) => {
    setHiddenTxIds((prev) => {
      const next = new Set(prev);
      next.delete(txId);
      // Persist to localStorage
      const hiddenKey = `vora_hidden_txs_${walletAddress.toLowerCase()}`;
      localStorage.setItem(hiddenKey, JSON.stringify([...next]));
      return next;
    });
  };

  const handleToggleShowHidden = () => {
    setShowHidden((prev) => !prev);
  };

  // Position editing handlers (for future implementation)
  const handleAddToPosition = (txId: string, positionId: string) => {
    console.log(`TODO: Add transaction ${txId} to position ${positionId}`);
    // This would require backend support to persist custom transaction-position mappings
  };

  const handleRemoveFromPosition = (positionId: string, txId: string) => {
    console.log(`TODO: Remove transaction ${txId} from position ${positionId}`);
    // This would require backend support to persist custom transaction-position mappings
  };

  const handleRenamePosition = (positionId: string, newName: string) => {
    console.log(`TODO: Rename position ${positionId} to ${newName}`);
    // This would require backend support to persist custom position names
  };

  const handleCreateStrategy = () => {
    setShowCreateStrategy(true);
  };

  const handleStrategySubmit = async (strategyData: {
    name: string;
    description?: string;
    positions: Array<{ positionId: string; percentage: number }>;
  }) => {
    try {
      // Create strategy via API
      const response = await fetch(
        `${API_URL}/api/v1/build/strategies?wallet=${walletAddress}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: strategyData.name,
            description: strategyData.description,
            positions: strategyData.positions,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create strategy: ${response.status}`);
      }

      // Refresh strategies from API
      await fetchStrategies(walletAddress);
    } catch (err) {
      console.error("Error creating strategy:", err);
      setError(err instanceof Error ? err.message : "Failed to create strategy");
    }
  };

  // Fetch strategies from API
  const fetchStrategies = useCallback(async (address: string) => {
    if (!address) return;
    
    try {
      const response = await fetch(
        `${API_URL}/api/v1/build/strategies?wallet=${address}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch strategies: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.status === "success") {
        // Transform API response to match frontend Strategy interface
        const apiStrategies = (result.data.strategies || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          status: s.status as "draft" | "open" | "closed",
          positionIds: s.positionIds || [],
          totalValueUsd: 0, // Will be calculated below
          totalPnlUsd: undefined,
          createdAt: new Date(s.createdAt).getTime(),
        }));
        
        // Calculate total value for each strategy based on current positions
        if (data?.positions) {
          apiStrategies.forEach((strat: Strategy) => {
            strat.totalValueUsd = strat.positionIds.reduce((sum: number, posId: string) => {
              const pos = data.positions.find((p) => p.id === posId);
              return sum + (pos?.valueUsd || 0);
            }, 0);
            
            // Update status based on positions
            const hasOpenPosition = strat.positionIds.some((posId: string) => {
              const pos = data.positions.find((p) => p.id === posId);
              return pos?.status === "open";
            });
            strat.status = hasOpenPosition ? "open" : (strat.positionIds.length > 0 ? "closed" : "draft");
          });
        }
        
        setStrategies(apiStrategies);
      }
    } catch (err) {
      console.error("Error fetching strategies:", err);
      // Don't set error state - strategies are optional
    }
  }, [data?.positions]);

  // Load strategies when wallet changes or data loads
  useEffect(() => {
    if (walletAddress) {
      fetchStrategies(walletAddress);
    }
  }, [walletAddress, fetchStrategies]);

  // Fetch user positions from API
  const fetchUserPositions = useCallback(async (address: string) => {
    if (!address) return;
    
    try {
      const response = await fetch(
        `${API_URL}/api/v1/build/user-positions?wallet=${address}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch positions: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.status === "success") {
        setUserPositions(result.data.positions || []);
        
        // Collect all assigned transaction IDs
        const assigned = new Set<string>();
        (result.data.positions || []).forEach((pos: UserPosition) => {
          (pos.transactionIds || []).forEach((txId: string) => assigned.add(txId));
        });
        setAssignedTxIds(assigned);
      }
    } catch (err) {
      console.error("Error fetching user positions:", err);
    }
  }, []);

  // Load user positions when wallet changes
  useEffect(() => {
    if (walletAddress) {
      fetchUserPositions(walletAddress);
    }
  }, [walletAddress, fetchUserPositions]);

  // Build transaction lookup map from all transaction groups
  const transactionLookup = useMemo(() => {
    const lookup = new Map<string, Transaction>();
    transactionGroups.forEach(group => {
      group.transactions.forEach(tx => {
        lookup.set(tx.id, tx);
      });
    });
    return lookup;
  }, [transactionGroups]);

  // Create user position
  const handleCreatePosition = async (posData: { name: string; description: string }) => {
    try {
      const params = new URLSearchParams({
        wallet: walletAddress,
        name: posData.name,
        description: posData.description,
      });
      
      const response = await fetch(
        `${API_URL}/api/v1/build/user-positions?${params}`,
        { method: "POST" }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to create position: ${response.status}`);
      }
      
      await fetchUserPositions(walletAddress);
    } catch (err) {
      console.error("Error creating position:", err);
      setError(err instanceof Error ? err.message : "Failed to create position");
    }
  };

  // Add transaction to position
  const handleAddTransactionToPosition = async (positionId: string, transactionId: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/build/user-positions/${positionId}/transactions/${transactionId}?wallet=${walletAddress}`,
        { method: "POST" }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to add transaction: ${response.status}`);
      }
      
      await fetchUserPositions(walletAddress);
    } catch (err) {
      console.error("Error adding transaction:", err);
    }
  };

  // Remove transaction from position
  const handleRemoveTransactionFromPosition = async (positionId: string, transactionId: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/build/user-positions/${positionId}/transactions/${transactionId}?wallet=${walletAddress}`,
        { method: "DELETE" }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to remove transaction: ${response.status}`);
      }
      
      await fetchUserPositions(walletAddress);
    } catch (err) {
      console.error("Error removing transaction:", err);
    }
  };

  // Enrich historical prices
  const handleEnrichPrices = async () => {
    if (!walletAddress || enrichingPrices) return;
    
    setEnrichingPrices(true);
    try {
      // Enrich in batches of 10
      const response = await fetch(
        `${API_URL}/api/v1/build/enrich-prices?wallet=${walletAddress}&max_transactions=10`,
        { method: "POST" }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to enrich prices: ${response.status}`);
      }
      
      const result = await response.json();
      console.log("Price enrichment result:", result);
      
      // Refresh data to get updated prices
      await fetchData(walletAddress);
    } catch (err) {
      console.error("Error enriching prices:", err);
    } finally {
      setEnrichingPrices(false);
    }
  };

  const handleDeleteStrategy = async (strategyId: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/build/strategies/${strategyId}?wallet=${walletAddress}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error(`Failed to delete strategy: ${response.status}`);
      }

      // Remove from local state
      setStrategies((prev) => prev.filter((s) => s.id !== strategyId));
    } catch (err) {
      console.error("Error deleting strategy:", err);
      setError(err instanceof Error ? err.message : "Failed to delete strategy");
    }
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6 text-sm">
                <span className="text-[#8B949E]">
                  <span className="text-[#E6EDF3] font-medium">{transactionGroups.length}</span> groups
                </span>
                <span className="text-[#8B949E]">
                  <span className="text-[#E6EDF3] font-medium">
                    {transactionGroups.reduce((sum, g) => sum + g.transactions.filter(tx => !assignedTxIds.has(tx.id)).length, 0)}
                  </span> unassigned txs
                </span>
                <span className="text-[#30363D]">|</span>
                <span className="text-[#8B949E]">
                  <span className="text-[#3FB950] font-medium">{userPositions.length}</span> positions
                </span>
                <span className="text-[#8B949E]">
                  <span className="text-[#58A6FF] font-medium">{assignedTxIds.size}</span> assigned txs
                </span>
                <span className="text-[#30363D]">|</span>
                <span className="text-[#8B949E]">
                  <span className="text-[#A371F7] font-medium">{strategies.length}</span> strategies
                </span>
              </div>
              
              {/* Price Info */}
              {priceInfo && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-2 text-[#8B949E]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      <span className="text-[#3FB950] font-medium">{priceInfo.historicalPrices}</span> historical
                    </span>
                    <span>/</span>
                    <span>
                      <span className={priceInfo.currentPrices > 0 ? "text-[#F0883E] font-medium" : "text-[#8B949E]"}>
                        {priceInfo.currentPrices}
                      </span> current
                    </span>
                  </div>
                  {priceInfo.needsEnrichment && (
                    <button
                      onClick={handleEnrichPrices}
                      disabled={enrichingPrices}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#238636] hover:bg-[#2EA043] disabled:bg-[#21262D] disabled:text-[#8B949E] text-white rounded font-medium transition-colors"
                      title="Fetch historical prices from CoinGecko (10 at a time)"
                    >
                      {enrichingPrices ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <DollarSign className="w-3 h-3" />
                      )}
                      {enrichingPrices ? "Fetching..." : "Fetch Prices"}
                    </button>
                  )}
                </div>
              )}
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
            {/* Column 1: Transaction Groups */}
            <TransactionsColumn
              groups={transactionGroups.map(g => ({
                ...g,
                transactions: g.transactions.filter(tx => !assignedTxIds.has(tx.id)),
                transactionCount: g.transactions.filter(tx => !assignedTxIds.has(tx.id)).length
              })).filter(g => g.transactionCount > 0)}
              tokenDict={data?.tokenDict || {}}
              chainNames={chainNames}
              isLoading={loading}
              onDragStart={(txId, groupKey) => console.log('Drag started:', txId)}
            />

            {/* Column 2: User Positions */}
            <PositionsColumn
              positions={userPositions.map(up => ({
                id: up.id,
                protocol: up.protocol || "",
                protocolName: up.protocol || "Custom",
                chain: up.chain || "",
                type: up.position_type || "custom",
                name: up.name,
                displayName: up.name,
                valueUsd: 0,
                status: up.status as "open" | "closed",
                transactionCount: up.transactionCount,
                transactions: (up.transactionIds || [])
                  .map(txId => transactionLookup.get(txId))
                  .filter((tx): tx is Transaction => tx !== undefined)
              }))}
              tokenDict={data?.tokenDict || {}}
              chainNames={chainNames}
              filter={positionFilter}
              onFilterChange={setPositionFilter}
              onRemoveTransaction={handleRemoveTransactionFromPosition}
              onRenamePosition={handleRenamePosition}
              onCreatePosition={() => setShowCreatePosition(true)}
              onDropTransaction={handleAddTransactionToPosition}
              isLoading={loading}
            />

            {/* Column 3: Strategies */}
            <StrategiesColumn
              strategies={strategies}
              positions={userPositions.map(up => ({
                id: up.id,
                protocol: up.protocol || "",
                protocolName: up.protocol || "Custom",
                chain: up.chain || "",
                type: up.position_type || "custom",
                name: up.name,
                displayName: up.name,
                valueUsd: 0,
                status: up.status as "open" | "closed",
                transactionCount: up.transactionCount,
              }))}
              onCreateStrategy={handleCreateStrategy}
              onDeleteStrategy={handleDeleteStrategy}
              isLoading={loading}
            />
          </div>
        )}
      </main>

      {/* Create Strategy Modal */}
      <CreateStrategyModal
        isOpen={showCreateStrategy}
        onClose={() => setShowCreateStrategy(false)}
        onSubmit={handleStrategySubmit}
        availablePositions={data?.positions || []}
      />

      {/* Create Position Modal */}
      <CreatePositionModal
        isOpen={showCreatePosition}
        onClose={() => setShowCreatePosition(false)}
        onSubmit={handleCreatePosition}
      />
    </div>
  );
}
