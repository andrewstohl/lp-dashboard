"use client";

import { useState } from "react";
import { Wallet, Loader2, ChevronDown, ChevronRight, ExternalLink, TrendingUp, TrendingDown, Plus, X, Layers, CheckSquare, Square } from "lucide-react";
import { Navigation } from "@/components/Navigation";

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

// GMX Position Types
interface GMXTransaction {
  timestamp: number;
  block_number: number;
  tx_hash: string;
  action: string;
  size_delta_usd: number;
  size_after_usd: number;
  collateral_usd: number;
  execution_price: number;
  pnl_usd: number;
  borrowing_fee_usd: number;
  funding_fee_usd: number;
  position_fee_usd: number;
  total_fees_usd: number;
}

interface GMXPositionHistory {
  position_key: string;
  status: string;
  market: {
    address: string;
    name: string;
    index_symbol: string;
  };
  side: string;
  is_long: boolean;
  current_size_usd: number;
  transactions: GMXTransaction[];
  summary: {
    total_transactions: number;
    total_size_opened_usd: number;
    total_size_closed_usd: number;
    total_pnl_usd: number;
    total_fees_usd: number;
    net_pnl_usd: number;
  };
  data_sources: {
    structure: string;
    amounts: string;
    prices: string;
    fees: string;
  };
}

interface GMXPosition {
  position_key: string;
  market_address: string;
  market_name: string;
  index_symbol: string;
  side: string;
  is_long: boolean;
  status: string;
  current_size_usd: number;
  total_size_opened_usd: number;
  total_trades: number;
  total_pnl_usd: number;
  first_trade_timestamp: number;
  last_trade_timestamp: number;
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

interface StrategyGMXItem {
  type: "gmx";
  position_key: string;
  market_name: string;
  side: string;
  status: string;
  current_size_usd: number;
}

type StrategyItem = StrategyLPItem | StrategyGMXItem;

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

  // GMX State
  const [gmxPositions, setGMXPositions] = useState<GMXPosition[]>([]);
  const [expandedGMXPositions, setExpandedGMXPositions] = useState<Set<string>>(new Set());
  const [gmxHistories, setGMXHistories] = useState<Record<string, GMXPositionHistory>>({});
  const [loadingGMXPositions, setLoadingGMXPositions] = useState<Set<string>>(new Set());

  // Strategy State
  const [selectedLPPositions, setSelectedLPPositions] = useState<Set<string>>(new Set());
  const [selectedGMXPositions, setSelectedGMXPositions] = useState<Set<string>>(new Set());
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [newStrategyName, setNewStrategyName] = useState("");

  const handleLoad = async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);
    setPoolGroups([]);
    setGMXPositions([]);
    setExpandedLPPositions(new Set());
    setExpandedGMXPositions(new Set());
    setLPHistories({});
    setGMXHistories({});
    setSelectedLPPositions(new Set());
    setSelectedGMXPositions(new Set());

    try {
      // Fetch LP and GMX positions in parallel
      const [lpResponse, gmxResponse] = await Promise.all([
        fetch(`${API_URL}/api/v1/test/uniswap-lp?wallet=${walletAddress}`),
        fetch(`${API_URL}/api/v1/test/gmx-positions?wallet=${walletAddress}`)
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

      if (lpResult.status === "success") {
        setPoolGroups(lpResult.data.pools || []);
      }

      if (gmxResult.status === "success") {
        setGMXPositions(gmxResult.data.positions || []);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
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
            `${API_URL}/api/v1/test/position-history/${positionId}?wallet=${walletAddress}`
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

  const toggleGMXPosition = async (positionKey: string) => {
    const newExpanded = new Set(expandedGMXPositions);

    if (newExpanded.has(positionKey)) {
      newExpanded.delete(positionKey);
    } else {
      newExpanded.add(positionKey);

      if (!gmxHistories[positionKey]) {
        setLoadingGMXPositions(prev => new Set(prev).add(positionKey));

        try {
          const response = await fetch(
            `${API_URL}/api/v1/test/gmx-position-history/${positionKey}`
          );
          const result = await response.json();

          if (result.status === "success") {
            setGMXHistories(prev => ({ ...prev, [positionKey]: result.data }));
          }
        } catch (err) {
          console.error("Error fetching GMX position history:", err);
        } finally {
          setLoadingGMXPositions(prev => {
            const next = new Set(prev);
            next.delete(positionKey);
            return next;
          });
        }
      }
    }

    setExpandedGMXPositions(newExpanded);
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

  const toggleGMXSelection = (positionKey: string) => {
    const newSelected = new Set(selectedGMXPositions);
    if (newSelected.has(positionKey)) {
      newSelected.delete(positionKey);
    } else {
      newSelected.add(positionKey);
    }
    setSelectedGMXPositions(newSelected);
  };

  const createStrategy = () => {
    if (!newStrategyName.trim()) return;
    if (selectedLPPositions.size === 0 && selectedGMXPositions.size === 0) return;

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

    // Add selected GMX positions
    for (const pos of gmxPositions) {
      if (selectedGMXPositions.has(pos.position_key)) {
        items.push({
          type: "gmx",
          position_key: pos.position_key,
          market_name: pos.market_name,
          side: pos.side,
          status: pos.status,
          current_size_usd: pos.current_size_usd,
        });
      }
    }

    const newStrategy: Strategy = {
      id: `strategy-${Date.now()}`,
      name: newStrategyName.trim(),
      items,
      created_at: Date.now(),
    };

    setStrategies(prev => [...prev, newStrategy]);
    setNewStrategyName("");
    setSelectedLPPositions(new Set());
    setSelectedGMXPositions(new Set());
  };

  const removeStrategy = (strategyId: string) => {
    setStrategies(prev => prev.filter(s => s.id !== strategyId));
  };

  const removeItemFromStrategy = (strategyId: string, itemIndex: number) => {
    setStrategies(prev => prev.map(s => {
      if (s.id !== strategyId) return s;
      const newItems = [...s.items];
      newItems.splice(itemIndex, 1);
      return { ...s, items: newItems };
    }));
  };

  // Stats
  const totalLPPositions = poolGroups.reduce((sum, pool) => sum + pool.positions.length, 0);
  const activeLPPositions = poolGroups.reduce(
    (sum, pool) => sum + pool.positions.filter(p => p.status === "ACTIVE").length,
    0
  );
  const activeGMXPositions = gmxPositions.filter(p => p.status === "ACTIVE").length;
  const totalGMXPnL = gmxPositions.reduce((sum, p) => sum + p.total_pnl_usd, 0);

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <Navigation />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#E6EDF3] mb-2">
            Position Tracker
          </h1>
          <p className="text-[#8B949E]">
            View LP positions (Uniswap V3) and Perp positions (GMX V2) with complete transaction history
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
            <div className="flex items-end">
              <button
                onClick={handleLoad}
                disabled={loading || !walletAddress}
                className="px-6 py-2 bg-[#238636] hover:bg-[#2EA043] disabled:bg-[#21262D] disabled:text-[#8B949E] text-white font-medium rounded-lg transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Load Positions"
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

        {/* Three Column Layout */}
        {(poolGroups.length > 0 || gmxPositions.length > 0) && (
          <div className="grid grid-cols-3 gap-6">
            {/* LEFT COLUMN: LP Positions */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-bold text-[#E6EDF3]">LP Positions</h2>
                <span className="px-2 py-1 bg-[#238636]/20 text-[#3FB950] text-sm rounded">
                  {activeLPPositions} Active
                </span>
                <span className="px-2 py-1 bg-[#21262D] text-[#8B949E] text-sm rounded">
                  {totalLPPositions} Total
                </span>
              </div>

              <div className="space-y-4">
                {poolGroups.map((pool, idx) => (
                  <div
                    key={idx}
                    className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden"
                  >
                    {/* Pool Header */}
                    <div className="p-4 border-b border-[#21262D]">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-[#E6EDF3]">
                          {pool.token0_symbol}/{pool.token1_symbol}
                        </h3>
                        <div className="flex gap-2 text-xs">
                          <span className="px-2 py-1 bg-[#30363D] rounded text-[#8B949E]">
                            {pool.fee_tier}
                          </span>
                          <span className="px-2 py-1 bg-[#21262D] rounded text-[#8B949E]">
                            {pool.positions.length} pos
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Positions List */}
                    <div className="divide-y divide-[#21262D]">
                      {pool.positions.map((position) => {
                        const isExpanded = expandedLPPositions.has(position.position_id);
                        const isLoading = loadingLPPositions.has(position.position_id);
                        const history = lpHistories[position.position_id];

                        const isSelected = selectedLPPositions.has(position.position_id);

                        return (
                          <div key={position.position_id}>
                            <div className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1C2128] transition-colors">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLPSelection(position.position_id);
                                  }}
                                  className="flex-shrink-0"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-[#58A6FF]" />
                                  ) : (
                                    <Square className="w-4 h-4 text-[#8B949E] hover:text-[#58A6FF]" />
                                  )}
                                </button>
                                <button
                                  onClick={() => toggleLPPosition(position.position_id)}
                                  className="flex items-center gap-3 flex-1"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-[#8B949E]" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-[#8B949E]" />
                                  )}
                                  <div className="text-left">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[#E6EDF3] font-medium text-sm">
                                        #{position.position_id}
                                      </span>
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                                        position.status === "ACTIVE"
                                          ? "bg-[#238636]/20 text-[#3FB950]"
                                          : "bg-[#21262D] text-[#8B949E]"
                                      }`}>
                                        {position.status}
                                      </span>
                                    </div>
                                    <div className="text-xs text-[#8B949E]">
                                      {formatDate(position.mint_timestamp)}
                                    </div>
                                  </div>
                                </button>
                              </div>
                              {isLoading && (
                                <Loader2 className="w-4 h-4 animate-spin text-[#58A6FF]" />
                              )}
                            </div>

                            {/* Expanded LP History */}
                            {isExpanded && history && (
                              <div className="px-4 pb-4 bg-[#0D1117]">
                                <div className="grid grid-cols-4 gap-2 mb-3 p-3 bg-[#161B22] rounded-lg text-xs">
                                  <div>
                                    <div className="text-[#8B949E]">Deposited</div>
                                    <div className="text-[#3FB950] font-medium">
                                      {formatUSD(history.summary.total_deposited_usd)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[#8B949E]">Withdrawn</div>
                                    <div className="text-[#F85149] font-medium">
                                      {formatUSD(history.summary.total_withdrawn_usd)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[#8B949E]">Fees</div>
                                    <div className="text-[#A371F7] font-medium">
                                      {formatUSD(history.summary.total_fees_collected_usd)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[#8B949E]">Net</div>
                                    <div className="text-[#E6EDF3] font-medium">
                                      {formatUSD(history.summary.net_invested_usd)}
                                    </div>
                                  </div>
                                </div>

                                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-[#0D1117]">
                                      <tr className="text-[#8B949E]">
                                        <th className="text-left py-1 px-2">Date</th>
                                        <th className="text-left py-1 px-2">Action</th>
                                        <th className="text-right py-1 px-2">USD</th>
                                        <th className="text-right py-1 px-2">Tx</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#21262D]">
                                      {history.transactions.map((tx, txIdx) => (
                                        <tr key={txIdx} className="hover:bg-[#161B22]">
                                          <td className="py-2 px-2 text-[#8B949E]">
                                            {formatDate(tx.timestamp)}
                                          </td>
                                          <td className={`py-2 px-2 font-medium ${getLPActionColor(tx.action)}`}>
                                            {tx.action}
                                          </td>
                                          <td className="py-2 px-2 text-right text-[#E6EDF3]">
                                            {formatUSD(tx.total_value_usd)}
                                          </td>
                                          <td className="py-2 px-2 text-right">
                                            <a
                                              href={`https://etherscan.io/tx/${tx.tx_hash}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-[#58A6FF] hover:underline"
                                            >
                                              <ExternalLink className="w-3 h-3 inline" />
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
                ))}
              </div>

              {poolGroups.length === 0 && !loading && (
                <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-8 text-center">
                  <p className="text-[#8B949E]">No LP positions found</p>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: GMX Perp Positions */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-bold text-[#E6EDF3]">Perp Positions</h2>
                <span className="px-2 py-1 bg-[#238636]/20 text-[#3FB950] text-sm rounded">
                  {activeGMXPositions} Active
                </span>
                <span className={`px-2 py-1 text-sm rounded ${
                  totalGMXPnL >= 0
                    ? "bg-[#238636]/20 text-[#3FB950]"
                    : "bg-[#F85149]/20 text-[#F85149]"
                }`}>
                  {totalGMXPnL >= 0 ? "+" : ""}{formatUSD(totalGMXPnL)} P&L
                </span>
              </div>

              <div className="space-y-4">
                {gmxPositions.map((position) => {
                  const isExpanded = expandedGMXPositions.has(position.position_key);
                  const isLoading = loadingGMXPositions.has(position.position_key);
                  const history = gmxHistories[position.position_key];
                  const isSelected = selectedGMXPositions.has(position.position_key);

                  return (
                    <div
                      key={position.position_key}
                      className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden"
                    >
                      {/* Position Header - Clickable */}
                      <div className="w-full p-4 flex items-center justify-between hover:bg-[#1C2128] transition-colors">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGMXSelection(position.position_key);
                            }}
                            className="flex-shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#58A6FF]" />
                            ) : (
                              <Square className="w-4 h-4 text-[#8B949E] hover:text-[#58A6FF]" />
                            )}
                          </button>
                          <button
                            onClick={() => toggleGMXPosition(position.position_key)}
                            className="flex items-center gap-3 flex-1"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#8B949E]" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-[#8B949E]" />
                            )}
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-[#E6EDF3]">
                                  {position.market_name}
                                </span>
                                <span className={`text-sm px-2 py-0.5 rounded ${
                                  position.side === "Short"
                                    ? "bg-[#F85149]/20 text-[#F85149]"
                                    : "bg-[#3FB950]/20 text-[#3FB950]"
                                }`}>
                                  {position.side === "Short" ? (
                                    <TrendingDown className="w-3 h-3 inline mr-1" />
                                  ) : (
                                    <TrendingUp className="w-3 h-3 inline mr-1" />
                                  )}
                                  {position.side}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  position.status === "ACTIVE"
                                    ? "bg-[#238636]/20 text-[#3FB950]"
                                    : "bg-[#21262D] text-[#8B949E]"
                                }`}>
                                  {position.status}
                                </span>
                              </div>
                              <div className="flex gap-3 text-xs text-[#8B949E] mt-1">
                                <span>{position.total_trades} trades</span>
                                <span className={position.total_pnl_usd >= 0 ? "text-[#3FB950]" : "text-[#F85149]"}>
                                  {position.total_pnl_usd >= 0 ? "+" : ""}{formatUSD(position.total_pnl_usd)} P&L
                                </span>
                                {position.status === "ACTIVE" && (
                                  <span>Size: {formatUSD(position.current_size_usd)}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        </div>
                        {isLoading && (
                          <Loader2 className="w-4 h-4 animate-spin text-[#58A6FF]" />
                        )}
                      </div>

                      {/* Expanded GMX History */}
                      {isExpanded && history && (
                        <div className="px-4 pb-4 bg-[#0D1117] border-t border-[#21262D]">
                          <div className="grid grid-cols-4 gap-2 my-3 p-3 bg-[#161B22] rounded-lg text-xs">
                            <div>
                              <div className="text-[#8B949E]">Size Opened</div>
                              <div className="text-[#E6EDF3] font-medium">
                                {formatUSD(history.summary.total_size_opened_usd)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[#8B949E]">Total P&L</div>
                              <div className={`font-medium ${
                                history.summary.total_pnl_usd >= 0 ? "text-[#3FB950]" : "text-[#F85149]"
                              }`}>
                                {history.summary.total_pnl_usd >= 0 ? "+" : ""}{formatUSD(history.summary.total_pnl_usd)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[#8B949E]">Total Fees</div>
                              <div className="text-[#F85149] font-medium">
                                -{formatUSD(history.summary.total_fees_usd)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[#8B949E]">Net P&L</div>
                              <div className={`font-medium ${
                                history.summary.net_pnl_usd >= 0 ? "text-[#3FB950]" : "text-[#F85149]"
                              }`}>
                                {history.summary.net_pnl_usd >= 0 ? "+" : ""}{formatUSD(history.summary.net_pnl_usd)}
                              </div>
                            </div>
                          </div>

                          <div className="overflow-x-auto max-h-60 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-[#0D1117]">
                                <tr className="text-[#8B949E]">
                                  <th className="text-left py-1 px-2">Date</th>
                                  <th className="text-left py-1 px-2">Action</th>
                                  <th className="text-right py-1 px-2">Size Δ</th>
                                  <th className="text-right py-1 px-2">Price</th>
                                  <th className="text-right py-1 px-2">P&L</th>
                                  <th className="text-right py-1 px-2">Tx</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#21262D]">
                                {history.transactions.map((tx, txIdx) => (
                                  <tr key={txIdx} className="hover:bg-[#161B22]">
                                    <td className="py-2 px-2 text-[#8B949E]">
                                      {formatDate(tx.timestamp)}
                                    </td>
                                    <td className={`py-2 px-2 font-medium ${getGMXActionColor(tx.action)}`}>
                                      {tx.action}
                                    </td>
                                    <td className="py-2 px-2 text-right text-[#E6EDF3]">
                                      {formatUSD(tx.size_delta_usd)}
                                    </td>
                                    <td className="py-2 px-2 text-right text-[#8B949E]">
                                      {formatPrice(tx.execution_price)}
                                    </td>
                                    <td className={`py-2 px-2 text-right font-medium ${
                                      tx.pnl_usd > 0 ? "text-[#3FB950]" : tx.pnl_usd < 0 ? "text-[#F85149]" : "text-[#8B949E]"
                                    }`}>
                                      {tx.pnl_usd !== 0 ? (tx.pnl_usd > 0 ? "+" : "") + formatUSD(tx.pnl_usd) : "-"}
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                      <a
                                        href={`https://arbiscan.io/tx/${tx.tx_hash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[#58A6FF] hover:underline"
                                      >
                                        <ExternalLink className="w-3 h-3 inline" />
                                      </a>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Data Pipeline Info */}
                          <div className="mt-3 p-2 bg-[#161B22] rounded-lg border border-[#30363D]">
                            <div className="text-xs text-[#8B949E]">
                              Data: GMX Subgraph (self-contained)
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {gmxPositions.length === 0 && !loading && (
                <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-8 text-center">
                  <p className="text-[#8B949E]">No GMX positions found</p>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Strategies */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-bold text-[#E6EDF3]">Strategies</h2>
                <span className="px-2 py-1 bg-[#21262D] text-[#8B949E] text-sm rounded">
                  {strategies.length} Saved
                </span>
              </div>

              {/* Strategy Builder */}
              <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-[#58A6FF]" />
                  <h3 className="text-sm font-medium text-[#E6EDF3]">Build Strategy</h3>
                </div>

                {/* Selected Items Count */}
                <div className="text-xs text-[#8B949E] mb-3">
                  {selectedLPPositions.size + selectedGMXPositions.size > 0 ? (
                    <span>
                      <span className="text-[#58A6FF]">{selectedLPPositions.size}</span> LP +{" "}
                      <span className="text-[#58A6FF]">{selectedGMXPositions.size}</span> Perp selected
                    </span>
                  ) : (
                    <span>Select positions from LP and Perp columns</span>
                  )}
                </div>

                {/* Selected Items Preview */}
                {(selectedLPPositions.size > 0 || selectedGMXPositions.size > 0) && (
                  <div className="space-y-2 mb-3">
                    {/* Selected LP Positions */}
                    {Array.from(selectedLPPositions).map(posId => {
                      const pool = poolGroups.find(p => p.positions.some(pos => pos.position_id === posId));
                      if (!pool) return null;
                      return (
                        <div key={posId} className="flex items-center justify-between bg-[#0D1117] p-2 rounded text-xs">
                          <span className="text-[#E6EDF3]">
                            {pool.token0_symbol}/{pool.token1_symbol} #{posId}
                          </span>
                          <button
                            onClick={() => toggleLPSelection(posId)}
                            className="text-[#8B949E] hover:text-[#F85149]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}

                    {/* Selected GMX Positions */}
                    {Array.from(selectedGMXPositions).map(posKey => {
                      const pos = gmxPositions.find(p => p.position_key === posKey);
                      if (!pos) return null;
                      return (
                        <div key={posKey} className="flex items-center justify-between bg-[#0D1117] p-2 rounded text-xs">
                          <span className="text-[#E6EDF3]">
                            {pos.market_name} {pos.side}
                          </span>
                          <button
                            onClick={() => toggleGMXSelection(posKey)}
                            className="text-[#8B949E] hover:text-[#F85149]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Strategy Name Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newStrategyName}
                    onChange={(e) => setNewStrategyName(e.target.value)}
                    placeholder="Strategy name..."
                    className="flex-1 px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-sm text-[#E6EDF3] placeholder-[#8B949E] focus:outline-none focus:ring-2 focus:ring-[#58A6FF]"
                  />
                  <button
                    onClick={createStrategy}
                    disabled={!newStrategyName.trim() || (selectedLPPositions.size === 0 && selectedGMXPositions.size === 0)}
                    className="px-3 py-2 bg-[#238636] hover:bg-[#2EA043] disabled:bg-[#21262D] disabled:text-[#8B949E] text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Create
                  </button>
                </div>
              </div>

              {/* Saved Strategies */}
              <div className="space-y-3">
                {strategies.map((strategy) => (
                  <div
                    key={strategy.id}
                    className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden"
                  >
                    <div className="p-4 border-b border-[#21262D]">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-[#E6EDF3]">{strategy.name}</h3>
                        <button
                          onClick={() => removeStrategy(strategy.id)}
                          className="text-[#8B949E] hover:text-[#F85149]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-xs text-[#8B949E] mt-1">
                        {strategy.items.filter(i => i.type === "lp").length} LP +{" "}
                        {strategy.items.filter(i => i.type === "gmx").length} Perp positions
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      {strategy.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-[#0D1117] p-2 rounded text-xs"
                        >
                          {item.type === "lp" ? (
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-[#58A6FF]/20 text-[#58A6FF] rounded">LP</span>
                              <span className="text-[#E6EDF3]">
                                {item.token0_symbol}/{item.token1_symbol}
                              </span>
                              <span className="text-[#8B949E]">#{item.position_id}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded ${
                                item.side === "Short"
                                  ? "bg-[#F85149]/20 text-[#F85149]"
                                  : "bg-[#3FB950]/20 text-[#3FB950]"
                              }`}>
                                {item.side}
                              </span>
                              <span className="text-[#E6EDF3]">{item.market_name}</span>
                            </div>
                          )}
                          <button
                            onClick={() => removeItemFromStrategy(strategy.id, idx)}
                            className="text-[#8B949E] hover:text-[#F85149]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 border-t border-[#21262D]">
                      <button
                        className="w-full px-4 py-2 bg-[#58A6FF] hover:bg-[#79B8FF] text-white text-sm font-medium rounded-lg transition-colors"
                        onClick={() => {
                          // TODO: Navigate to ledger with strategy data
                          console.log("Analyze strategy:", strategy);
                        }}
                      >
                        Analyze Strategy
                      </button>
                    </div>
                  </div>
                ))}

                {strategies.length === 0 && (
                  <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-8 text-center">
                    <Layers className="w-8 h-8 text-[#8B949E] mx-auto mb-3" />
                    <p className="text-[#8B949E] text-sm">
                      No strategies yet. Select LP and Perp positions to create a hedged strategy.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && poolGroups.length === 0 && gmxPositions.length === 0 && walletAddress && !error && (
          <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-12 text-center">
            <p className="text-[#8B949E]">Click &quot;Load Positions&quot; to fetch LP and Perp positions</p>
          </div>
        )}
      </div>
    </div>
  );
}
