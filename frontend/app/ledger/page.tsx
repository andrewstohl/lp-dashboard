"use client";

import { useState, useEffect } from "react";
import {
  type LPPosition,
  type PerpetualPosition,
  type GMXRewards,
  type PerpHistory
} from "@/lib/api";
import { FileText, Search, RefreshCw, ChevronDown } from "lucide-react";
import { LedgerMatrix } from "@/components/LedgerMatrix";
import { Navigation } from "@/components/Navigation";
import { ProfessionalLoading, ProfessionalEmptyState, ProfessionalErrorState } from "@/components/ProfessionalStates";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8004";
const STRATEGIES_KEY = "lp_dashboard_strategies";

// Strategy types matching test page
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
  position_key: string;
  market: string;
  market_address: string;
  side: string;
  action: string;
  size_delta_usd: number;
  collateral_usd: number;
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

export default function LedgerPage() {
  // Strategy state
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("");

  // Position state
  const [lpPositions, setLpPositions] = useState<LPPosition[]>([]);
  const [perpPositions, setPerpPositions] = useState<PerpetualPosition[]>([]);
  const [gmxRewards, setGmxRewards] = useState<GMXRewards | undefined>();
  const [perpHistory, setPerpHistory] = useState<PerpHistory | undefined>();
  const [totalGasFees, setTotalGasFees] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load strategies from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STRATEGIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setStrategies(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to load strategies:", e);
    }
  }, []);

  // Load and enrich strategy data
  const handleLoadStrategy = async (strategyId: string) => {
    const strategy = strategies.find((s) => s.id === strategyId);
    if (!strategy) {
      setError("Strategy not found");
      return;
    }

    // Separate LP and GMX items
    const lpItems = strategy.items.filter((item): item is StrategyLPItem => item.type === "lp");
    const gmxItems = strategy.items.filter((item): item is StrategyGMXTradeItem => item.type === "gmx_trade");

    if (lpItems.length === 0 && gmxItems.length === 0) {
      setError("Strategy has no items to analyze");
      return;
    }

    // Get wallet from localStorage for enrichment
    const wallet = localStorage.getItem('lastWalletAddress') || '0x23b50a703d3076b73584df48251931ebf5937ba2';

    setLoading(true);
    setError(null);

    const requestBody = {
      wallet,
      lp_items: lpItems,
      gmx_items: gmxItems,
    };

    try {
      const response = await fetch(`${API_BASE}/api/v1/build/strategy/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Strategy load error response:", response.status, errorText);
        let errorData: { detail?: string } = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // ignore parse error
        }
        throw new Error(errorData.detail || `API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      // Map response to state - backend now returns perpHistory
      setLpPositions(result.data.lp_positions || []);
      setPerpPositions(result.data.perp_positions || []);
      setGmxRewards(result.data.gmx_rewards);
      setPerpHistory(result.data.perp_history);
      setTotalGasFees(result.data.total_gas_fees_usd || 0);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load strategy");
      setLpPositions([]);
      setPerpPositions([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle strategy selection
  const handleStrategyChange = (strategyId: string) => {
    setSelectedStrategyId(strategyId);
    if (strategyId) {
      handleLoadStrategy(strategyId);
    }
  };

  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId);
  const hasPositions = lpPositions.length > 0 || perpPositions.length > 0;

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Header */}
      <header className="bg-[#161B22] border-b border-[#21262D] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-[#58A6FF]" />
              <h1 className="text-2xl font-bold text-[#E6EDF3]">Strategy Ledger</h1>
            </div>
            <Navigation />
          </div>

          {/* Strategy Selector */}
          <div className="max-w-2xl mx-auto">
            {strategies.length === 0 ? (
              <div className="text-center py-8 bg-[#1C2128] rounded-lg border border-[#30363D]">
                <FileText className="w-12 h-12 mx-auto text-[#8B949E] mb-3" />
                <p className="text-[#8B949E] mb-2">No strategies saved</p>
                <p className="text-sm text-[#6E7681]">
                  Create strategies on the Test page to analyze them here
                </p>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <select
                    value={selectedStrategyId}
                    onChange={(e) => handleStrategyChange(e.target.value)}
                    className="w-full px-4 py-3 bg-[#1C2128] border border-[#30363D] text-[#E6EDF3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#58A6FF] focus:border-transparent appearance-none cursor-pointer"
                  >
                    <option value="">Select a strategy...</option>
                    {strategies.map((strategy) => {
                      const lpCount = strategy.items.filter((i) => i.type === "lp").length;
                      const gmxCount = strategy.items.filter((i) => i.type === "gmx_trade").length;
                      return (
                        <option key={strategy.id} value={strategy.id}>
                          {strategy.name} ({lpCount} LP, {gmxCount} trades)
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E] pointer-events-none" />
                </div>
                <button
                  onClick={() => selectedStrategyId && handleLoadStrategy(selectedStrategyId)}
                  disabled={loading || !selectedStrategyId}
                  className="px-6 py-3 bg-[#58A6FF] text-[#0D1117] font-semibold rounded-lg hover:bg-[#79B8FF] disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  Analyze
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#E6EDF3]">
            {selectedStrategy ? `Strategy: ${selectedStrategy.name}` : "Position & Performance Ledger"}
          </h2>
          <p className="text-[#8B949E]">
            {selectedStrategy
              ? "Analyzing selected LP positions and GMX trades"
              : "Select a strategy to view comprehensive P&L analysis"}
          </p>
          {lastUpdated && (
            <p className="text-xs text-[#8B949E] mt-1">Last updated: {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>

        {loading && (
          <ProfessionalLoading message="Loading strategy positions..." />
        )}

        {error && (
          <ProfessionalErrorState
            error={error}
            retryAction={() => selectedStrategyId && handleLoadStrategy(selectedStrategyId)}
          />
        )}

        {!loading && !error && !selectedStrategyId && strategies.length > 0 && (
          <ProfessionalEmptyState
            title="Select a Strategy"
            message="Choose a strategy from the dropdown above to analyze its positions and performance."
            icon="info"
          />
        )}

        {!loading && !error && selectedStrategyId && !hasPositions && (
          <ProfessionalEmptyState
            title="No Positions Found"
            message="This strategy doesn't have any LP or perpetual positions to display."
            icon="wallet"
          />
        )}

        {!loading && !error && hasPositions && (
          <LedgerMatrix
            lpPositions={lpPositions}
            perpPositions={perpPositions}
            gmxRewards={gmxRewards}
            perpHistory={perpHistory}
            totalGasFees={totalGasFees}
          />
        )}
      </main>
    </div>
  );
}
