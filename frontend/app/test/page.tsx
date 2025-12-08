"use client";

import { useState } from "react";
import { Wallet, Loader2, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Navigation } from "@/components/Navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8004";

interface Transaction {
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

interface PositionHistory {
  position_id: string;
  status: string;
  pool: {
    address: string;
    fee_tier: number;
    token0: { address: string; symbol: string; decimals: number };
    token1: { address: string; symbol: string; decimals: number };
  };
  transactions: Transaction[];
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

interface Position {
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
  positions: Position[];
}

export default function TestPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poolGroups, setPoolGroups] = useState<PoolGroup[]>([]);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const [positionHistories, setPositionHistories] = useState<Record<string, PositionHistory>>({});
  const [loadingPositions, setLoadingPositions] = useState<Set<string>>(new Set());

  const handleLoad = async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);
    setPoolGroups([]);
    setExpandedPositions(new Set());
    setPositionHistories({});

    try {
      const response = await fetch(
        `${API_URL}/api/v1/test/uniswap-lp?wallet=${walletAddress}`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      if (result.status === "success") {
        setPoolGroups(result.data.pools || []);
      } else {
        throw new Error(result.detail?.error || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const togglePosition = async (positionId: string) => {
    const newExpanded = new Set(expandedPositions);

    if (newExpanded.has(positionId)) {
      newExpanded.delete(positionId);
    } else {
      newExpanded.add(positionId);

      // Fetch position history if not already loaded
      if (!positionHistories[positionId]) {
        setLoadingPositions(prev => new Set(prev).add(positionId));

        try {
          // Pass wallet address for DeBank fee enrichment
          const response = await fetch(
            `${API_URL}/api/v1/test/position-history/${positionId}?wallet=${walletAddress}`
          );
          const result = await response.json();

          if (result.status === "success") {
            setPositionHistories(prev => ({
              ...prev,
              [positionId]: result.data
            }));
          }
        } catch (err) {
          console.error("Error fetching position history:", err);
        } finally {
          setLoadingPositions(prev => {
            const next = new Set(prev);
            next.delete(positionId);
            return next;
          });
        }
      }
    }

    setExpandedPositions(newExpanded);
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
    if (value < 0.0001) return "<0.0001";
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    });
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "Deposit": return "text-[#3FB950]";
      case "Withdraw": return "text-[#F85149]";
      case "Collect": return "text-[#A371F7]";
      default: return "text-[#8B949E]";
    }
  };

  const totalPositions = poolGroups.reduce((sum, pool) => sum + pool.positions.length, 0);
  const activePositions = poolGroups.reduce(
    (sum, pool) => sum + pool.positions.filter(p => p.status === "ACTIVE").length,
    0
  );

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <Navigation />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#E6EDF3] mb-2">
            Uniswap V3 Position Tracker
          </h1>
          <p className="text-[#8B949E]">
            View all LP positions with complete transaction history and USD values
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
                  "Load"
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

        {/* Summary Stats */}
        {poolGroups.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-4">
              <div className="text-2xl font-bold text-[#E6EDF3]">{poolGroups.length}</div>
              <div className="text-sm text-[#8B949E]">Pools</div>
            </div>
            <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-4">
              <div className="text-2xl font-bold text-[#E6EDF3]">{totalPositions}</div>
              <div className="text-sm text-[#8B949E]">Total Positions</div>
            </div>
            <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-4">
              <div className="text-2xl font-bold text-[#3FB950]">{activePositions}</div>
              <div className="text-sm text-[#8B949E]">Active Positions</div>
            </div>
          </div>
        )}

        {/* Results */}
        {poolGroups.length > 0 && (
          <div className="space-y-4">
            {poolGroups.map((pool, idx) => (
              <div
                key={idx}
                className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden"
              >
                {/* Pool Header */}
                <div className="p-6 border-b border-[#21262D]">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-[#E6EDF3] mb-2">
                        {pool.token0_symbol}/{pool.token1_symbol}
                      </h3>
                      <div className="flex gap-3 text-sm">
                        <span className="px-2 py-1 bg-[#30363D] rounded text-[#8B949E]">
                          {pool.chain_name}
                        </span>
                        <span className="px-2 py-1 bg-[#30363D] rounded text-[#8B949E]">
                          Fee: {pool.fee_tier}
                        </span>
                        <span className="px-2 py-1 bg-[#21262D] rounded text-[#8B949E]">
                          {pool.positions.length} position{pool.positions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Positions List */}
                <div className="divide-y divide-[#21262D]">
                  {pool.positions.map((position) => {
                    const isExpanded = expandedPositions.has(position.position_id);
                    const isLoading = loadingPositions.has(position.position_id);
                    const history = positionHistories[position.position_id];

                    return (
                      <div key={position.position_id}>
                        {/* Position Header - Clickable */}
                        <button
                          onClick={() => togglePosition(position.position_id)}
                          className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#1C2128] transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-[#8B949E]" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-[#8B949E]" />
                            )}
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <span className="text-[#E6EDF3] font-medium">
                                  Position #{position.position_id}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  position.status === "ACTIVE"
                                    ? "bg-[#238636]/20 text-[#3FB950]"
                                    : "bg-[#21262D] text-[#8B949E]"
                                }`}>
                                  {position.status}
                                </span>
                              </div>
                              <div className="text-xs text-[#8B949E] mt-1">
                                Opened: {formatDate(position.mint_timestamp)}
                              </div>
                            </div>
                          </div>
                          {isLoading && (
                            <Loader2 className="w-4 h-4 animate-spin text-[#58A6FF]" />
                          )}
                        </button>

                        {/* Expanded Transaction History */}
                        {isExpanded && history && (
                          <div className="px-6 pb-6 bg-[#0D1117]">
                            {/* Summary Row */}
                            <div className="grid grid-cols-4 gap-4 mb-4 p-4 bg-[#161B22] rounded-lg">
                              <div>
                                <div className="text-xs text-[#8B949E]">Total Deposited</div>
                                <div className="text-[#3FB950] font-medium">
                                  {formatUSD(history.summary.total_deposited_usd)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-[#8B949E]">Total Withdrawn</div>
                                <div className="text-[#F85149] font-medium">
                                  {formatUSD(history.summary.total_withdrawn_usd)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-[#8B949E]">Fees Collected</div>
                                <div className="text-[#A371F7] font-medium">
                                  {formatUSD(history.summary.total_fees_collected_usd)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-[#8B949E]">Net Invested</div>
                                <div className="text-[#E6EDF3] font-medium">
                                  {formatUSD(history.summary.net_invested_usd)}
                                </div>
                              </div>
                            </div>

                            {/* Transactions Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-[#8B949E] text-xs uppercase">
                                    <th className="text-left py-2 px-3">Date</th>
                                    <th className="text-left py-2 px-3">Action</th>
                                    <th className="text-right py-2 px-3">{history.pool.token0.symbol}</th>
                                    <th className="text-right py-2 px-3">{history.pool.token1.symbol}</th>
                                    <th className="text-right py-2 px-3">Total USD</th>
                                    <th className="text-right py-2 px-3">Tx</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#21262D]">
                                  {history.transactions.map((tx, txIdx) => (
                                    <tr key={txIdx} className="hover:bg-[#161B22]">
                                      <td className="py-3 px-3 text-[#8B949E]">
                                        {formatDate(tx.timestamp)}
                                      </td>
                                      <td className={`py-3 px-3 font-medium ${getActionColor(tx.action)}`}>
                                        {tx.action}
                                      </td>
                                      <td className="py-3 px-3 text-right text-[#E6EDF3]">
                                        {formatAmount(tx.token0_amount)}
                                      </td>
                                      <td className="py-3 px-3 text-right text-[#E6EDF3]">
                                        {formatAmount(tx.token1_amount)}
                                      </td>
                                      <td className="py-3 px-3 text-right text-[#E6EDF3] font-medium">
                                        {formatUSD(tx.total_value_usd)}
                                      </td>
                                      <td className="py-3 px-3 text-right">
                                        <a
                                          href={`https://etherscan.io/tx/${tx.tx_hash}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[#58A6FF] hover:underline"
                                        >
                                          <span className="font-mono text-xs">
                                            {tx.tx_hash.slice(0, 8)}...
                                          </span>
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Data Pipeline Info */}
                            <div className="mt-4 p-3 bg-[#161B22] rounded-lg border border-[#30363D]">
                              <div className="text-xs font-medium text-[#8B949E] mb-2">Data Pipeline</div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-[#8B949E]">Structure:</span>
                                  <span className="text-[#58A6FF]">{history.data_sources?.structure || 'subgraph'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#8B949E]">Amounts:</span>
                                  <span className="text-[#3FB950]">{history.data_sources?.amounts || 'debank'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#8B949E]">Prices:</span>
                                  <span className="text-[#58A6FF]">{history.data_sources?.prices || 'subgraph'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#8B949E]">Coverage:</span>
                                  <span className="text-[#E6EDF3]">{history.data_sources?.debank_coverage || 'N/A'}</span>
                                </div>
                              </div>
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
        )}

        {/* Empty State */}
        {!loading && poolGroups.length === 0 && walletAddress && !error && (
          <div className="bg-[#161B22] rounded-xl border border-[#30363D] p-12 text-center">
            <p className="text-[#8B949E]">No Uniswap LP positions found</p>
          </div>
        )}
      </div>
    </div>
  );
}
