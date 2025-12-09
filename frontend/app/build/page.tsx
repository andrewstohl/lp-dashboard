"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Wallet, Loader2, ChevronDown, ChevronRight, ChevronUp, ExternalLink, TrendingUp, TrendingDown, Plus, X, Layers, CheckSquare, Square, Edit2, RefreshCw, Save } from "lucide-react";
import { Navigation } from "@/components/Navigation";

// LocalStorage keys
const STORAGE_KEYS = {
  WALLET: "lp_dashboard_wallet",
  POSITIONS: "lp_dashboard_positions",
  STRATEGIES: "lp_dashboard_strategies",
};

interface CachedPositions {
  wallet: string;
  poolGroups: PoolGroup[];
  gmxTrades: GMXTrade[];
  timestamp: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8004";

// LP Position Types
interface LPTransaction {
  timestamp: number;
  block_number: number;
  tx_hash: string;
  action: string;
  token0_amount: number;
  token1_amount: number;
  token0_symbol: string;
  token1_symbol: string;
  token0_price_usd: number;
  token1_price_usd: number;
  token0_value_usd: number;
  token1_value_usd: number;
  total_value_usd: number;
  amount_source: string;
}

interface LPPositionHistory {
  position_id: string;
  status: string;
  pool: {
    address: string;
    fee_tier: number;
    token0: { address: string; symbol: string; decimals: number };
    token1: { address: string; symbol: string; decimals: number };
  };
  transactions: LPTransaction[];
  summary: {
    total_transactions: number;
    total_deposited_usd: number;
    total_withdrawn_usd: number;
    total_fees_collected_usd: number;
    net_invested_usd: number;
  };
  data_sources: {
    structure: string;
    amounts: string;
    prices: string;
    debank_coverage: string;
  };
}

interface LPPosition {
  position_id: string;
  status: string;
  liquidity: string;
  deposited_token0: number;
  deposited_token1: number;
  mint_timestamp: number;
}

interface PoolGroup {
  pool_address: string;
  token0_symbol: string;
  token1_symbol: string;
  fee_tier: string;
  chain_name: string;
  positions: LPPosition[];
}

// GMX Trade Types (flat list - no position grouping)
interface GMXTrade {
  timestamp: number;
  tx_hash: string;
  position_key: string;
  market_address: string;
  market: string;  // Just "ETH", "BTC", etc.
  market_name: string;  // "ETH/USD [1]", etc.
  side: string;
  is_long: boolean;
  action: string;  // Open, Increase, Decrease, Close
  size_delta_usd: number;
  size_after_usd: number;
  collateral_usd: number;  // For initial margin tracking
  execution_price: number;
  pnl_usd: number;
  fees_usd: number;
}

interface GMXTradesSummary {
  total_trades: number;
  unique_markets: number;
  long_trades: number;
  short_trades: number;
  total_pnl_usd: number;
}

// Strategy Types
interface StrategyLPItem {
  type: "lp";
  position_id: string;
  pool_address: string;
  token0_symbol: string;
  token1_symbol: string;
  fee_tier: string;
  status: string;
}

interface StrategyGMXTradeItem {
  type: "gmx_trade";
  tx_hash: string;
  position_key: string;  // Groups trades into positions for aggregation
  market: string;
  market_address: string;
  side: string;
  action: string;
  size_delta_usd: number;
  collateral_usd: number;  // For initial margin tracking
  execution_price: number;
  pnl_usd: number;
  timestamp: number;
}

type StrategyItem = StrategyLPItem | StrategyGMXTradeItem;

interface Strategy {
  id: string;
  name: string;
  items: StrategyItem[];
  created_at: number;
}

export default function TestPage() {
  const [walletAddress, setWalletAddress] = useState("0x23b50a703d3076b73584df48251931ebf5937ba2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LP State
  const [poolGroups, setPoolGroups] = useState<PoolGroup[]>([]);
  const [expandedLPPositions, setExpandedLPPositions] = useState<Set<string>>(new Set());
  const [lpHistories, setLPHistories] = useState<Record<string, LPPositionHistory>>({});
  const [loadingLPPositions, setLoadingLPPositions] = useState<Set<string>>(new Set());

  // GMX State (flat trade list)
  const [gmxTrades, setGMXTrades] = useState<GMXTrade[]>([]);
  const [gmxSummary, setGMXSummary] = useState<GMXTradesSummary | null>(null);

  // GMX Filters
  const [gmxMarketFilter, setGMXMarketFilter] = useState<string>("all");
  const [gmxSideFilter, setGMXSideFilter] = useState<string>("all");
  const [gmxActionFilter, setGMXActionFilter] = useState<string>("all");
  const [gmxSortField, setGMXSortField] = useState<string>("timestamp");
  const [gmxSortDir, setGMXSortDir] = useState<"asc" | "desc">("desc");

  // Strategy State
  const [selectedLPPositions, setSelectedLPPositions] = useState<Set<string>>(new Set());
  const [selectedGMXTrades, setSelectedGMXTrades] = useState<Set<string>>(new Set()); // "positionKey:txHash"
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [newStrategyName, setNewStrategyName] = useState("");

  // Section collapse state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["strategies", "lp", "perp"]));
  const [expandedPools, setExpandedPools] = useState<Set<string>>(new Set());
  // Active strategy ID: null = creating new, string = editing existing
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);

  // Ref to track if we've completed initial load from localStorage
  const hasLoadedFromStorage = useRef(false);

  // Load strategies from localStorage on mount
  useEffect(() => {
    try {
      const savedStrategies = localStorage.getItem(STORAGE_KEYS.STRATEGIES);
      if (savedStrategies) {
        const parsed = JSON.parse(savedStrategies);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStrategies(parsed);
        }
      }
      const savedWallet = localStorage.getItem(STORAGE_KEYS.WALLET);
      if (savedWallet) {
        setWalletAddress(savedWallet);
      }
    } catch (e) {
      console.error("Error loading from localStorage:", e);
    }
    // Mark that we've completed loading
    hasLoadedFromStorage.current = true;
  }, []);

  // Save strategies to localStorage whenever they change (skip initial mount)
  useEffect(() => {
    // Don't save on initial mount - wait until we've loaded first
    if (!hasLoadedFromStorage.current) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEYS.STRATEGIES, JSON.stringify(strategies));
    } catch (e) {
      console.error("Error saving strategies:", e);
    }
  }, [strategies]);

  // Save wallet address to localStorage when it changes
  useEffect(() => {
    if (walletAddress) {
      try {
        localStorage.setItem(STORAGE_KEYS.WALLET, walletAddress);
      } catch (e) {
        console.error("Error saving wallet:", e);
      }
    }
  }, [walletAddress]);

  // Auto-load positions from cache or fetch fresh on mount
  useEffect(() => {
    const autoLoad = async () => {
      if (!walletAddress) return;

      try {
        // Check for cached positions
        const cached = localStorage.getItem(STORAGE_KEYS.POSITIONS);
        if (cached) {
          const parsed: CachedPositions = JSON.parse(cached);
          if (parsed.wallet.toLowerCase() === walletAddress.toLowerCase()) {
            // Use cached data
            setPoolGroups(parsed.poolGroups);
            setGMXTrades(parsed.gmxTrades || []);
            setCacheTimestamp(parsed.timestamp);
            return;
          }
        }

        // No cache or different wallet - fetch fresh
        setIsAutoLoading(true);
        await handleLoadInternal();
      } catch (e) {
        console.error("Error in auto-load:", e);
      } finally {
        setIsAutoLoading(false);
      }
    };

    autoLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute position-to-strategy mapping for badges
  const positionStrategyMap = useMemo(() => {
    const map: Record<string, string[]> = {};

    for (const strategy of strategies) {
      for (const item of strategy.items) {
        if (item.type === "lp") {
          const key = item.position_id;
          if (!map[key]) map[key] = [];
          if (!map[key].includes(strategy.name)) map[key].push(strategy.name);
        } else if (item.type === "gmx_trade") {
          const key = item.tx_hash;
          if (!map[key]) map[key] = [];
          if (!map[key].includes(strategy.name)) map[key].push(strategy.name);
        }
      }
    }

    return map;
  }, [strategies]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const togglePool = (poolAddress: string) => {
    const newExpanded = new Set(expandedPools);
    if (newExpanded.has(poolAddress)) {
      newExpanded.delete(poolAddress);
    } else {
      newExpanded.add(poolAddress);
    }
    setExpandedPools(newExpanded);
  };

  // Internal load function (used by both auto-load and manual refresh)
  const handleLoadInternal = async () => {
    if (!walletAddress) return;

    setError(null);
    setExpandedLPPositions(new Set());
    setLPHistories({});
    setSelectedLPPositions(new Set());
    setSelectedGMXTrades(new Set());

    try {
      // Fetch LP positions and GMX trades in parallel
      const [lpResponse, gmxResponse] = await Promise.all([
        fetch(`${API_URL}/api/v1/build/uniswap-lp?wallet=${walletAddress}`),
        fetch(`${API_URL}/api/v1/build/gmx-trades?wallet=${walletAddress}`)
      ]);

      if (!lpResponse.ok) {
        throw new Error(`LP API error: ${lpResponse.status}`);
      }
      if (!gmxResponse.ok) {
        throw new Error(`GMX API error: ${gmxResponse.status}`);
      }

      const [lpResult, gmxResult] = await Promise.all([
        lpResponse.json(),
        gmxResponse.json()
      ]);

      const newPoolGroups = lpResult.status === "success" ? (lpResult.data.pools || []) : [];
      const newGMXTrades = gmxResult.status === "success" ? (gmxResult.data.trades || []) : [];
      const newGMXSummary = gmxResult.status === "success" ? gmxResult.data.summary : null;

      setPoolGroups(newPoolGroups);
      setGMXTrades(newGMXTrades);
      setGMXSummary(newGMXSummary);

      // Save to cache
      const cacheData: CachedPositions = {
        wallet: walletAddress,
        poolGroups: newPoolGroups,
        gmxTrades: newGMXTrades,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(cacheData));
      setCacheTimestamp(cacheData.timestamp);

    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    }
  };

  // Manual refresh (clears and reloads)
  const handleRefresh = async () => {
    if (!walletAddress) return;
    setLoading(true);
    setPoolGroups([]);
    setGMXTrades([]);
    setGMXSummary(null);
    await handleLoadInternal();
    setLoading(false);
  };

  const toggleLPPosition = async (positionId: string) => {
    const newExpanded = new Set(expandedLPPositions);

    if (newExpanded.has(positionId)) {
      newExpanded.delete(positionId);
    } else {
      newExpanded.add(positionId);

      if (!lpHistories[positionId]) {
        setLoadingLPPositions(prev => new Set(prev).add(positionId));

        try {
          const response = await fetch(
            `${API_URL}/api/v1/build/position-history/${positionId}?wallet=${walletAddress}`
          );
          const result = await response.json();

          if (result.status === "success") {
            setLPHistories(prev => ({ ...prev, [positionId]: result.data }));
          }
        } catch (err) {
          console.error("Error fetching LP position history:", err);
        } finally {
          setLoadingLPPositions(prev => {
            const next = new Set(prev);
            next.delete(positionId);
            return next;
          });
        }
      }
    }

    setExpandedLPPositions(newExpanded);
  };

  const formatDate = (ts: number) => {
    return new Date(ts * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatAmount = (value: number, decimals: number = 4) => {
    if (value === 0) return "0";
    if (Math.abs(value) < 0.0001) return "<0.0001";
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    });
  };

  const formatPrice = (value: number) => {
    if (value === 0) return "$0";
    if (value < 0.01) return `$${value.toExponential(2)}`;
    return formatUSD(value);
  };

  const getLPActionColor = (action: string) => {
    switch (action) {
      case "Deposit": return "text-[#3FB950]";
      case "Withdraw": return "text-[#F85149]";
      case "Collect": return "text-[#A371F7]";
      default: return "text-[#8B949E]";
    }
  };

  const getGMXActionColor = (action: string) => {
    switch (action) {
      case "Open":
      case "Increase": return "text-[#3FB950]";
      case "Close":
      case "Decrease": return "text-[#F85149]";
      default: return "text-[#8B949E]";
    }
  };

  // Strategy helpers
  const toggleLPSelection = (positionId: string) => {
    const newSelected = new Set(selectedLPPositions);
    if (newSelected.has(positionId)) {
      newSelected.delete(positionId);
    } else {
      newSelected.add(positionId);
    }
    setSelectedLPPositions(newSelected);
  };

  const toggleGMXTradeSelection = (txHash: string) => {
    const newSelected = new Set(selectedGMXTrades);
    if (newSelected.has(txHash)) {
      newSelected.delete(txHash);
    } else {
      newSelected.add(txHash);
    }
    setSelectedGMXTrades(newSelected);
  };

  // Build items array from current selections
  const buildItemsFromSelections = (): StrategyItem[] => {
    const items: StrategyItem[] = [];

    // Add selected LP positions
    for (const pool of poolGroups) {
      for (const pos of pool.positions) {
        if (selectedLPPositions.has(pos.position_id)) {
          items.push({
            type: "lp",
            position_id: pos.position_id,
            pool_address: pool.pool_address,
            token0_symbol: pool.token0_symbol,
            token1_symbol: pool.token1_symbol,
            fee_tier: pool.fee_tier,
            status: pos.status,
          });
        }
      }
    }

    // Add selected GMX trades from flat list
    for (const txHash of Array.from(selectedGMXTrades)) {
      const trade = gmxTrades.find(t => t.tx_hash === txHash);
      if (trade) {
        items.push({
          type: "gmx_trade",
          tx_hash: trade.tx_hash,
          position_key: trade.position_key,
          market: trade.market,
          market_address: trade.market_address,
          side: trade.side,
          action: trade.action,
          size_delta_usd: trade.size_delta_usd,
          collateral_usd: trade.collateral_usd || 0,
          execution_price: trade.execution_price,
          pnl_usd: trade.pnl_usd,
          timestamp: trade.timestamp,
        });
      }
    }

    return items;
  };

  // Save strategy (creates new or updates existing based on activeStrategyId)
  const saveStrategy = () => {
    if (!newStrategyName.trim()) return;
    const items = buildItemsFromSelections();
    if (items.length === 0) return;

    if (activeStrategyId) {
      // Update existing strategy
      setStrategies(prev => prev.map(s => {
        if (s.id !== activeStrategyId) return s;
        return { ...s, name: newStrategyName.trim(), items };
      }));
    } else {
      // Create new strategy
      const newStrategy: Strategy = {
        id: `strategy-${Date.now()}`,
        name: newStrategyName.trim(),
        items,
        created_at: Date.now(),
      };
      setStrategies(prev => [...prev, newStrategy]);
    }

    // Clear state
    setNewStrategyName("");
    setSelectedLPPositions(new Set());
    setSelectedGMXTrades(new Set());
    setActiveStrategyId(null);
  };

  // Start editing a strategy - load its items into selection state
  const startEditingStrategy = (strategyId: string) => {
    const strategy = strategies.find(s => s.id === strategyId);
    if (!strategy) return;

    // Load strategy name
    setNewStrategyName(strategy.name);

    // Load items into selection state
    const lpPositions = new Set<string>();
    const gmxTradesSet = new Set<string>();

    for (const item of strategy.items) {
      if (item.type === "lp") {
        lpPositions.add(item.position_id);
      } else if (item.type === "gmx_trade") {
        gmxTradesSet.add(item.tx_hash);
      }
    }

    setSelectedLPPositions(lpPositions);
    setSelectedGMXTrades(gmxTradesSet);
    setActiveStrategyId(strategyId);
  };

  // Cancel editing - clear all state
  const cancelEditing = () => {
    setNewStrategyName("");
    setSelectedLPPositions(new Set());
    setSelectedGMXTrades(new Set());
    setActiveStrategyId(null);
  };

  const removeStrategy = (strategyId: string) => {
    setStrategies(prev => prev.filter(s => s.id !== strategyId));
    if (activeStrategyId === strategyId) {
      cancelEditing();
    }
  };

  // Stats
  const totalLPPositions = poolGroups.reduce((sum, pool) => sum + pool.positions.length, 0);
  const activeLPPositions = poolGroups.reduce(
    (sum, pool) => sum + pool.positions.filter(p => p.status === "ACTIVE").length,
    0
  );
  const totalGMXTrades = gmxTrades.length;
  const totalGMXPnL = gmxSummary?.total_pnl_usd ?? gmxTrades.reduce((sum, t) => sum + t.pnl_usd, 0);

  // Get unique markets for filter dropdown
  const uniqueMarkets = useMemo(() => {
    const markets = new Set(gmxTrades.map(t => t.market));
    return Array.from(markets).sort();
  }, [gmxTrades]);

  // Filter and sort GMX trades
  const filteredGMXTrades = useMemo(() => {
    let filtered = gmxTrades;

    // Apply filters
    if (gmxMarketFilter !== "all") {
      filtered = filtered.filter(t => t.market === gmxMarketFilter);
    }
    if (gmxSideFilter !== "all") {
      filtered = filtered.filter(t => t.side === gmxSideFilter);
    }
    if (gmxActionFilter !== "all") {
      filtered = filtered.filter(t => t.action === gmxActionFilter);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (gmxSortField) {
        case "timestamp":
          aVal = a.timestamp;
          bVal = b.timestamp;
          break;
        case "market":
          aVal = a.market;
          bVal = b.market;
          break;
        case "size":
          aVal = a.size_delta_usd;
          bVal = b.size_delta_usd;
          break;
        case "price":
          aVal = a.execution_price;
          bVal = b.execution_price;
          break;
        case "pnl":
          aVal = a.pnl_usd;
          bVal = b.pnl_usd;
          break;
        default:
          aVal = a.timestamp;
          bVal = b.timestamp;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return gmxSortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return gmxSortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return sorted;
  }, [gmxTrades, gmxMarketFilter, gmxSideFilter, gmxActionFilter, gmxSortField, gmxSortDir]);

  // Toggle sort
  const toggleGMXSort = (field: string) => {
    if (gmxSortField === field) {
      setGMXSortDir(gmxSortDir === "asc" ? "desc" : "asc");
    } else {
      setGMXSortField(field);
      setGMXSortDir("desc");
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <Navigation />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#E6EDF3] mb-2">
            Strategy Builder
          </h1>
          <p className="text-[#8B949E]">
            Build strategies by selecting LP positions (Uniswap V3) and Perp trades (GMX V2)
          </p>
        </div>

        {/* Wallet Input */}
        <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-6 mb-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#8B949E] mb-2">
                Wallet Address
              </label>
              <div className="relative">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E]" />
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full pl-10 pr-4 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#8B949E] focus:outline-none focus:ring-2 focus:ring-[#58A6FF]"
                />
              </div>
            </div>
            <div className="flex items-end gap-3">
              {/* Cache status indicator */}
              {cacheTimestamp && (
                <div className="text-xs text-[#8B949E] pb-2">
                  Cached: {formatDate(cacheTimestamp / 1000)}
                </div>
              )}
              {isAutoLoading && (
                <div className="flex items-center gap-2 text-[#58A6FF] pb-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Loading...</span>
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={loading || isAutoLoading || !walletAddress}
                className="px-6 py-2 bg-[#238636] hover:bg-[#2EA043] disabled:bg-[#21262D] disabled:text-[#8B949E] text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-[#161B22] border border-[#F85149] rounded-xl p-4 mb-6">
            <p className="text-[#F85149]">{error}</p>
          </div>
        )}

        {/* Full-Width Stacked Sections */}
        {(poolGroups.length > 0 || gmxTrades.length > 0) && (
          <div className="space-y-6">

            {/* ======================================== */}
            {/* SECTION 1: STRATEGIES (Top) */}
            {/* ======================================== */}
            <div className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden">
              {/* Section Header - Clickable to collapse */}
              <button
                onClick={() => toggleSection("strategies")}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#1C2128] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Layers className="w-5 h-5 text-[#58A6FF]" />
                  <h2 className="text-xl font-bold text-[#E6EDF3]">Strategies</h2>
                  <span className="px-2 py-1 bg-[#21262D] text-[#8B949E] text-sm rounded">
                    {strategies.length} Saved
                  </span>
                  {activeStrategyId && (
                    <span className="px-2 py-1 bg-[#A371F7]/20 text-[#A371F7] text-sm rounded">
                      Editing
                    </span>
                  )}
                  {(selectedLPPositions.size > 0 || selectedGMXTrades.size > 0) && (
                    <span className="px-2 py-1 bg-[#58A6FF]/20 text-[#58A6FF] text-sm rounded">
                      {selectedLPPositions.size + selectedGMXTrades.size} selected
                    </span>
                  )}
                </div>
                {expandedSections.has("strategies") ? (
                  <ChevronUp className="w-5 h-5 text-[#8B949E]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#8B949E]" />
                )}
              </button>

              {expandedSections.has("strategies") && (
                <div className="px-6 pb-6 border-t border-[#21262D]">

                  {/* Strategy Builder - Single unified section */}
                  <div className="bg-[#0D1117] rounded-xl border border-[#30363D] p-5 mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        {activeStrategyId ? (
                          <>
                            <Edit2 className="w-4 h-4 text-[#A371F7]" />
                            <h3 className="text-lg font-medium text-[#E6EDF3]">Editing Strategy</h3>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 text-[#58A6FF]" />
                            <h3 className="text-lg font-medium text-[#E6EDF3]">New Strategy</h3>
                          </>
                        )}
                      </div>
                      {activeStrategyId && (
                        <button
                          onClick={cancelEditing}
                          className="text-sm text-[#8B949E] hover:text-[#F85149] flex items-center gap-1"
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                      )}
                    </div>

                    {/* Strategy Name Input */}
                    <div className="mb-4">
                      <input
                        type="text"
                        value={newStrategyName}
                        onChange={(e) => setNewStrategyName(e.target.value)}
                        placeholder="Strategy name..."
                        className="w-full px-4 py-3 bg-[#161B22] border border-[#30363D] rounded-lg text-sm text-[#E6EDF3] placeholder-[#8B949E] focus:outline-none focus:ring-2 focus:ring-[#58A6FF]"
                      />
                    </div>

                    {/* Selected Items Count */}
                    <div className="text-sm text-[#8B949E] mb-4">
                      {selectedLPPositions.size + selectedGMXTrades.size > 0 ? (
                        <span>
                          <span className="text-[#58A6FF] font-medium">{selectedLPPositions.size}</span> LP positions,{" "}
                          <span className="text-[#58A6FF] font-medium">{selectedGMXTrades.size}</span> Perp trades
                        </span>
                      ) : (
                        <span>Select positions from the sections below to add to this strategy</span>
                      )}
                    </div>

                    {/* Selected Items Preview */}
                    {(selectedLPPositions.size > 0 || selectedGMXTrades.size > 0) && (
                      <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                        {/* Selected LP Positions */}
                        {Array.from(selectedLPPositions).map(posId => {
                          const pool = poolGroups.find(p => p.positions.some(pos => pos.position_id === posId));
                          if (!pool) return null;
                          return (
                            <div key={posId} className="flex items-center justify-between bg-[#161B22] p-3 rounded-lg text-sm">
                              <div className="flex items-center gap-3">
                                <span className="px-2 py-1 bg-[#58A6FF]/20 text-[#58A6FF] rounded text-xs font-medium">LP</span>
                                <span className="text-[#E6EDF3]">
                                  {pool.token0_symbol}/{pool.token1_symbol}
                                </span>
                                <span className="text-[#8B949E]">#{posId}</span>
                                <span className="text-[#8B949E]">{pool.fee_tier}</span>
                              </div>
                              <button
                                onClick={() => toggleLPSelection(posId)}
                                className="text-[#8B949E] hover:text-[#F85149] p-1"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}

                        {/* Selected GMX Trades */}
                        {Array.from(selectedGMXTrades).map(txHash => {
                          const trade = gmxTrades.find(t => t.tx_hash === txHash);
                          if (!trade) return null;
                          return (
                            <div key={txHash} className="flex items-center justify-between bg-[#161B22] p-3 rounded-lg text-sm">
                              <div className="flex items-center gap-3">
                                <span className="px-2 py-1 bg-[#A371F7]/20 text-[#A371F7] rounded text-xs font-medium">
                                  {trade.action}
                                </span>
                                <span className="text-[#E6EDF3]">{trade.market}</span>
                                <span className={`text-xs ${trade.is_long ? "text-[#3FB950]" : "text-[#F85149]"}`}>
                                  {trade.side}
                                </span>
                                <span className="text-[#8B949E]">{formatDate(trade.timestamp)}</span>
                                <span className="text-[#8B949E]">{formatUSD(trade.size_delta_usd)}</span>
                              </div>
                              <button
                                onClick={() => toggleGMXTradeSelection(txHash)}
                                className="text-[#8B949E] hover:text-[#F85149] p-1"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Save Button */}
                    <button
                      onClick={saveStrategy}
                      disabled={!newStrategyName.trim() || (selectedLPPositions.size === 0 && selectedGMXTrades.size === 0)}
                      className="w-full px-5 py-3 bg-[#238636] hover:bg-[#2EA043] disabled:bg-[#21262D] disabled:text-[#8B949E] text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {activeStrategyId ? "Save Changes" : "Save Strategy"}
                    </button>
                  </div>

                  {/* Saved Strategies List */}
                  {strategies.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-[#8B949E] mb-3">Saved Strategies</h3>
                      <div className="space-y-2">
                        {strategies.map((strategy) => (
                          <div
                            key={strategy.id}
                            className={`bg-[#0D1117] rounded-lg border p-4 ${
                              activeStrategyId === strategy.id
                                ? "border-[#A371F7]"
                                : "border-[#30363D]"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <h4 className="text-base font-bold text-[#E6EDF3]">{strategy.name}</h4>
                                <div className="flex items-center gap-3 text-xs text-[#8B949E]">
                                  <span>{strategy.items.filter(i => i.type === "lp").length} LP positions</span>
                                  <span>{strategy.items.filter(i => i.type === "gmx_trade").length} Perp trades</span>
                                </div>
                                {activeStrategyId === strategy.id && (
                                  <span className="px-2 py-1 bg-[#A371F7]/20 text-[#A371F7] text-xs rounded">
                                    Currently Editing
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => startEditingStrategy(strategy.id)}
                                  disabled={activeStrategyId === strategy.id}
                                  className="px-3 py-1.5 text-sm text-[#58A6FF] hover:bg-[#58A6FF]/10 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    // TODO: Navigate to ledger with strategy data
                                    console.log("Analyze strategy:", strategy);
                                  }}
                                  className="px-3 py-1.5 text-sm bg-[#58A6FF] hover:bg-[#79B8FF] text-white rounded transition-colors"
                                >
                                  Analyze
                                </button>
                                <button
                                  onClick={() => removeStrategy(strategy.id)}
                                  className="p-1.5 text-[#8B949E] hover:text-[#F85149] hover:bg-[#F85149]/10 rounded transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state when no strategies */}
                  {strategies.length === 0 && selectedLPPositions.size === 0 && selectedGMXTrades.size === 0 && (
                    <div className="mt-4 text-center py-6">
                      <Layers className="w-10 h-10 text-[#8B949E] mx-auto mb-3" />
                      <p className="text-[#8B949E]">
                        Select positions from the sections below to create a strategy
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ======================================== */}
            {/* SECTION 2: LP POSITIONS (Middle) */}
            {/* ======================================== */}
            <div className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden">
              {/* Section Header - Clickable to collapse */}
              <button
                onClick={() => toggleSection("lp")}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#1C2128] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-5 h-5 rounded-full bg-[#58A6FF]/20 flex items-center justify-center">
                    <span className="text-[#58A6FF] text-xs font-bold">LP</span>
                  </div>
                  <h2 className="text-xl font-bold text-[#E6EDF3]">LP Positions</h2>
                  <span className="px-2 py-1 bg-[#238636]/20 text-[#3FB950] text-sm rounded">
                    {activeLPPositions} Active
                  </span>
                  <span className="px-2 py-1 bg-[#21262D] text-[#8B949E] text-sm rounded">
                    {totalLPPositions} Total
                  </span>
                  <span className="px-2 py-1 bg-[#21262D] text-[#8B949E] text-sm rounded">
                    {poolGroups.length} Pools
                  </span>
                </div>
                {expandedSections.has("lp") ? (
                  <ChevronUp className="w-5 h-5 text-[#8B949E]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#8B949E]" />
                )}
              </button>

              {expandedSections.has("lp") && (
                <div className="border-t border-[#21262D]">
                  {poolGroups.length > 0 ? (
                    <div className="divide-y divide-[#21262D]">
                      {poolGroups.map((pool, idx) => {
                        const isPoolExpanded = expandedPools.has(pool.pool_address);
                        return (
                          <div key={idx}>
                            {/* Pool Header - Collapsible */}
                            <button
                              onClick={() => togglePool(pool.pool_address)}
                              className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#1C2128] transition-colors"
                            >
                              <div className="flex items-center gap-4">
                                {isPoolExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-[#8B949E]" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-[#8B949E]" />
                                )}
                                <h3 className="text-lg font-bold text-[#E6EDF3]">
                                  {pool.token0_symbol}/{pool.token1_symbol}
                                </h3>
                                <span className="px-2 py-1 bg-[#30363D] rounded text-[#8B949E] text-xs">
                                  {pool.fee_tier}
                                </span>
                                <span className="px-2 py-1 bg-[#21262D] rounded text-[#8B949E] text-xs">
                                  {pool.positions.length} position{pool.positions.length !== 1 ? "s" : ""}
                                </span>
                                <span className="px-2 py-1 bg-[#238636]/20 text-[#3FB950] text-xs rounded">
                                  {pool.positions.filter(p => p.status === "ACTIVE").length} active
                                </span>
                              </div>
                            </button>

                            {/* Pool Positions */}
                            {isPoolExpanded && (
                              <div className="bg-[#0D1117] px-6 pb-4">
                                <div className="space-y-3">
                                  {pool.positions.map((position) => {
                                    const isExpanded = expandedLPPositions.has(position.position_id);
                                    const isLoading = loadingLPPositions.has(position.position_id);
                                    const history = lpHistories[position.position_id];
                                    const isSelected = selectedLPPositions.has(position.position_id);
                                    const strategyNames = positionStrategyMap[position.position_id] || [];

                                    return (
                                      <div key={position.position_id} className="bg-[#161B22] rounded-lg border border-[#30363D] overflow-hidden">
                                        {/* Position Header */}
                                        <div className="px-4 py-3 flex items-center justify-between hover:bg-[#1C2128] transition-colors">
                                          <div className="flex items-center gap-4">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleLPSelection(position.position_id);
                                              }}
                                              className="flex-shrink-0"
                                            >
                                              {isSelected ? (
                                                <CheckSquare className="w-5 h-5 text-[#58A6FF]" />
                                              ) : (
                                                <Square className="w-5 h-5 text-[#8B949E] hover:text-[#58A6FF]" />
                                              )}
                                            </button>
                                            <button
                                              onClick={() => toggleLPPosition(position.position_id)}
                                              className="flex items-center gap-4 flex-1"
                                            >
                                              {isExpanded ? (
                                                <ChevronDown className="w-4 h-4 text-[#8B949E]" />
                                              ) : (
                                                <ChevronRight className="w-4 h-4 text-[#8B949E]" />
                                              )}
                                              <span className="text-[#E6EDF3] font-medium">
                                                Position #{position.position_id}
                                              </span>
                                              <span className={`text-xs px-2 py-1 rounded ${
                                                position.status === "ACTIVE"
                                                  ? "bg-[#238636]/20 text-[#3FB950]"
                                                  : "bg-[#21262D] text-[#8B949E]"
                                              }`}>
                                                {position.status}
                                              </span>
                                              <span className="text-sm text-[#8B949E]">
                                                Opened {formatDate(position.mint_timestamp)}
                                              </span>
                                              {/* Strategy badges */}
                                              {strategyNames.map((name) => (
                                                <span
                                                  key={name}
                                                  className="px-2 py-1 bg-[#A371F7]/20 text-[#A371F7] text-xs rounded flex items-center gap-1"
                                                >
                                                  <Layers className="w-3 h-3" />
                                                  {name}
                                                </span>
                                              ))}
                                            </button>
                                          </div>
                                          {isLoading && (
                                            <Loader2 className="w-4 h-4 animate-spin text-[#58A6FF]" />
                                          )}
                                        </div>

                                        {/* Expanded LP History - Full Width Table */}
                                        {isExpanded && history && (
                                          <div className="px-4 pb-4 bg-[#0D1117] border-t border-[#21262D]">
                                            {/* Summary Stats */}
                                            <div className="grid grid-cols-6 gap-4 my-4 p-4 bg-[#161B22] rounded-lg">
                                              <div>
                                                <div className="text-xs text-[#8B949E] mb-1">Deposited</div>
                                                <div className="text-[#3FB950] font-medium">
                                                  {formatUSD(history.summary.total_deposited_usd)}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-xs text-[#8B949E] mb-1">Withdrawn</div>
                                                <div className="text-[#F85149] font-medium">
                                                  {formatUSD(history.summary.total_withdrawn_usd)}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-xs text-[#8B949E] mb-1">Fees Collected</div>
                                                <div className="text-[#A371F7] font-medium">
                                                  {formatUSD(history.summary.total_fees_collected_usd)}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-xs text-[#8B949E] mb-1">Net Invested</div>
                                                <div className="text-[#E6EDF3] font-medium">
                                                  {formatUSD(history.summary.net_invested_usd)}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-xs text-[#8B949E] mb-1">Transactions</div>
                                                <div className="text-[#E6EDF3] font-medium">
                                                  {history.summary.total_transactions}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-xs text-[#8B949E] mb-1">Data Source</div>
                                                <div className="text-[#8B949E] text-sm">
                                                  {history.data_sources.amounts}
                                                </div>
                                              </div>
                                            </div>

                                            {/* Full-width Transaction Table */}
                                            <div className="overflow-x-auto">
                                              <table className="w-full text-sm">
                                                <thead className="bg-[#161B22]">
                                                  <tr className="text-[#8B949E]">
                                                    <th className="text-left py-3 px-4 font-medium">Date</th>
                                                    <th className="text-left py-3 px-4 font-medium">Action</th>
                                                    <th className="text-right py-3 px-4 font-medium">{history.pool.token0.symbol}</th>
                                                    <th className="text-right py-3 px-4 font-medium">{history.pool.token1.symbol}</th>
                                                    <th className="text-right py-3 px-4 font-medium">{history.pool.token0.symbol} Price</th>
                                                    <th className="text-right py-3 px-4 font-medium">{history.pool.token1.symbol} Price</th>
                                                    <th className="text-right py-3 px-4 font-medium">Total USD</th>
                                                    <th className="text-right py-3 px-4 font-medium">Source</th>
                                                    <th className="text-center py-3 px-4 font-medium">Tx</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#21262D]">
                                                  {[...history.transactions].reverse().map((tx, txIdx) => (
                                                    <tr key={txIdx} className="hover:bg-[#161B22]">
                                                      <td className="py-3 px-4 text-[#8B949E]">
                                                        {formatDate(tx.timestamp)}
                                                      </td>
                                                      <td className={`py-3 px-4 font-medium ${getLPActionColor(tx.action)}`}>
                                                        {tx.action}
                                                      </td>
                                                      <td className="py-3 px-4 text-right text-[#E6EDF3]">
                                                        {formatAmount(tx.token0_amount)}
                                                      </td>
                                                      <td className="py-3 px-4 text-right text-[#E6EDF3]">
                                                        {formatAmount(tx.token1_amount)}
                                                      </td>
                                                      <td className="py-3 px-4 text-right text-[#8B949E]">
                                                        {formatPrice(tx.token0_price_usd)}
                                                      </td>
                                                      <td className="py-3 px-4 text-right text-[#8B949E]">
                                                        {formatPrice(tx.token1_price_usd)}
                                                      </td>
                                                      <td className="py-3 px-4 text-right text-[#E6EDF3] font-medium">
                                                        {formatUSD(tx.total_value_usd)}
                                                      </td>
                                                      <td className="py-3 px-4 text-right">
                                                        <span className={`text-xs px-2 py-1 rounded ${
                                                          tx.amount_source === "debank"
                                                            ? "bg-[#238636]/20 text-[#3FB950]"
                                                            : "bg-[#21262D] text-[#8B949E]"
                                                        }`}>
                                                          {tx.amount_source}
                                                        </span>
                                                      </td>
                                                      <td className="py-3 px-4 text-center">
                                                        <a
                                                          href={`https://etherscan.io/tx/${tx.tx_hash}`}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="text-[#58A6FF] hover:underline"
                                                        >
                                                          <ExternalLink className="w-4 h-4 inline" />
                                                        </a>
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-[#8B949E]">No LP positions found</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ======================================== */}
            {/* SECTION 3: PERP TRADES (Bottom) - Flat Table */}
            {/* ======================================== */}
            <div className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden">
              {/* Section Header - Clickable to collapse */}
              <button
                onClick={() => toggleSection("perp")}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#1C2128] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <TrendingUp className="w-5 h-5 text-[#3FB950]" />
                  <h2 className="text-xl font-bold text-[#E6EDF3]">Perp Trades</h2>
                  <span className="px-2 py-1 bg-[#21262D] text-[#8B949E] text-sm rounded">
                    {totalGMXTrades} Trades
                  </span>
                  {gmxSummary && (
                    <span className="px-2 py-1 bg-[#21262D] text-[#8B949E] text-sm rounded">
                      {gmxSummary.unique_markets} Markets
                    </span>
                  )}
                  <span className={`px-2 py-1 text-sm rounded ${
                    totalGMXPnL >= 0
                      ? "bg-[#238636]/20 text-[#3FB950]"
                      : "bg-[#F85149]/20 text-[#F85149]"
                  }`}>
                    {totalGMXPnL >= 0 ? "+" : ""}{formatUSD(totalGMXPnL)} P&L
                  </span>
                </div>
                {expandedSections.has("perp") ? (
                  <ChevronUp className="w-5 h-5 text-[#8B949E]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#8B949E]" />
                )}
              </button>

              {expandedSections.has("perp") && (
                <div className="border-t border-[#21262D]">
                  {gmxTrades.length > 0 ? (
                    <div>
                      {/* Filters */}
                      <div className="px-6 py-4 bg-[#0D1117] border-b border-[#21262D] flex gap-4 flex-wrap items-center">
                        {/* Market Filter */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8B949E]">Market:</span>
                          <select
                            value={gmxMarketFilter}
                            onChange={(e) => setGMXMarketFilter(e.target.value)}
                            className="bg-[#161B22] border border-[#30363D] rounded px-2 py-1 text-sm text-[#E6EDF3] focus:outline-none focus:ring-1 focus:ring-[#58A6FF]"
                          >
                            <option value="all">All</option>
                            {uniqueMarkets.map(market => (
                              <option key={market} value={market}>{market}</option>
                            ))}
                          </select>
                        </div>

                        {/* Side Filter */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8B949E]">Side:</span>
                          <select
                            value={gmxSideFilter}
                            onChange={(e) => setGMXSideFilter(e.target.value)}
                            className="bg-[#161B22] border border-[#30363D] rounded px-2 py-1 text-sm text-[#E6EDF3] focus:outline-none focus:ring-1 focus:ring-[#58A6FF]"
                          >
                            <option value="all">All</option>
                            <option value="Long">Long</option>
                            <option value="Short">Short</option>
                          </select>
                        </div>

                        {/* Action Filter */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8B949E]">Action:</span>
                          <select
                            value={gmxActionFilter}
                            onChange={(e) => setGMXActionFilter(e.target.value)}
                            className="bg-[#161B22] border border-[#30363D] rounded px-2 py-1 text-sm text-[#E6EDF3] focus:outline-none focus:ring-1 focus:ring-[#58A6FF]"
                          >
                            <option value="all">All</option>
                            <option value="Open">Open</option>
                            <option value="Increase">Increase</option>
                            <option value="Decrease">Decrease</option>
                            <option value="Close">Close</option>
                          </select>
                        </div>

                        {/* Filtered count */}
                        <span className="text-xs text-[#8B949E] ml-auto">
                          Showing {filteredGMXTrades.length} of {gmxTrades.length} trades
                        </span>
                      </div>

                      {/* Flat Trade Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#161B22]">
                            <tr className="text-[#8B949E]">
                              <th className="text-left py-3 px-3 w-10"></th>
                              <th
                                className="text-left py-3 px-4 font-medium cursor-pointer hover:text-[#E6EDF3]"
                                onClick={() => toggleGMXSort("timestamp")}
                              >
                                Date {gmxSortField === "timestamp" && (gmxSortDir === "desc" ? "↓" : "↑")}
                              </th>
                              <th
                                className="text-left py-3 px-4 font-medium cursor-pointer hover:text-[#E6EDF3]"
                                onClick={() => toggleGMXSort("market")}
                              >
                                Market {gmxSortField === "market" && (gmxSortDir === "desc" ? "↓" : "↑")}
                              </th>
                              <th className="text-left py-3 px-4 font-medium">Side</th>
                              <th className="text-left py-3 px-4 font-medium">Action</th>
                              <th
                                className="text-right py-3 px-4 font-medium cursor-pointer hover:text-[#E6EDF3]"
                                onClick={() => toggleGMXSort("size")}
                              >
                                Size {gmxSortField === "size" && (gmxSortDir === "desc" ? "↓" : "↑")}
                              </th>
                              <th
                                className="text-right py-3 px-4 font-medium cursor-pointer hover:text-[#E6EDF3]"
                                onClick={() => toggleGMXSort("price")}
                              >
                                Price {gmxSortField === "price" && (gmxSortDir === "desc" ? "↓" : "↑")}
                              </th>
                              <th
                                className="text-right py-3 px-4 font-medium cursor-pointer hover:text-[#E6EDF3]"
                                onClick={() => toggleGMXSort("pnl")}
                              >
                                P&L {gmxSortField === "pnl" && (gmxSortDir === "desc" ? "↓" : "↑")}
                              </th>
                              <th className="text-center py-3 px-4 font-medium">Tx</th>
                              <th className="text-left py-3 px-4 font-medium">Strategy</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#21262D]">
                            {filteredGMXTrades.map((trade) => {
                              const isTradeSelected = selectedGMXTrades.has(trade.tx_hash);
                              const tradeStrategyNames = positionStrategyMap[trade.tx_hash] || [];
                              return (
                                <tr key={trade.tx_hash} className="hover:bg-[#1C2128]">
                                  <td className="py-3 px-3">
                                    <button
                                      onClick={() => toggleGMXTradeSelection(trade.tx_hash)}
                                      className="flex-shrink-0"
                                    >
                                      {isTradeSelected ? (
                                        <CheckSquare className="w-4 h-4 text-[#58A6FF]" />
                                      ) : (
                                        <Square className="w-4 h-4 text-[#8B949E] hover:text-[#58A6FF]" />
                                      )}
                                    </button>
                                  </td>
                                  <td className="py-3 px-4 text-[#8B949E]">
                                    {formatDate(trade.timestamp)}
                                  </td>
                                  <td className="py-3 px-4 text-[#E6EDF3] font-medium">
                                    {trade.market}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 w-fit ${
                                      trade.side === "Short"
                                        ? "bg-[#F85149]/20 text-[#F85149]"
                                        : "bg-[#3FB950]/20 text-[#3FB950]"
                                    }`}>
                                      {trade.side === "Short" ? (
                                        <TrendingDown className="w-3 h-3" />
                                      ) : (
                                        <TrendingUp className="w-3 h-3" />
                                      )}
                                      {trade.side}
                                    </span>
                                  </td>
                                  <td className={`py-3 px-4 font-medium ${getGMXActionColor(trade.action)}`}>
                                    {trade.action}
                                  </td>
                                  <td className="py-3 px-4 text-right text-[#E6EDF3]">
                                    {formatUSD(trade.size_delta_usd)}
                                  </td>
                                  <td className="py-3 px-4 text-right text-[#8B949E]">
                                    {formatPrice(trade.execution_price)}
                                  </td>
                                  <td className={`py-3 px-4 text-right font-medium ${
                                    trade.pnl_usd > 0 ? "text-[#3FB950]" : trade.pnl_usd < 0 ? "text-[#F85149]" : "text-[#8B949E]"
                                  }`}>
                                    {trade.pnl_usd !== 0 ? (trade.pnl_usd > 0 ? "+" : "") + formatUSD(trade.pnl_usd) : "-"}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <a
                                      href={`https://arbiscan.io/tx/${trade.tx_hash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#58A6FF] hover:underline"
                                    >
                                      <ExternalLink className="w-4 h-4 inline" />
                                    </a>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex gap-1 flex-wrap">
                                      {tradeStrategyNames.map((name) => (
                                        <span
                                          key={name}
                                          className="px-2 py-0.5 bg-[#A371F7]/20 text-[#A371F7] text-xs rounded flex items-center gap-1"
                                        >
                                          <Layers className="w-2.5 h-2.5" />
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-[#8B949E]">No GMX trades found</p>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Empty State */}
        {!loading && poolGroups.length === 0 && gmxTrades.length === 0 && walletAddress && !error && (
          <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-12 text-center">
            <p className="text-[#8B949E]">Click &quot;Load Positions&quot; to fetch LP and Perp positions</p>
          </div>
        )}
      </div>
    </div>
  );
}
