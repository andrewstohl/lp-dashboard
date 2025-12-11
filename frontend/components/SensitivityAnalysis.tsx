"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, Activity } from "lucide-react";

interface PriceRatioDataPoint {
  timestamp: number;
  price1: number;
  price2: number;
  ratio: number;
  deviation_pct: number;
}

interface ThresholdAnalysis {
  threshold: number;
  breaches: {
    start_timestamp: number;
    end_timestamp: number;
    direction: string;
    ongoing?: boolean;
  }[];
  breach_count: number;
  upper_bound: number;
  lower_bound: number;
}

interface Statistics {
  initial_ratio: number;
  current_ratio: number;
  mean_ratio: number;
  std_ratio: number;
  min_ratio: number;
  max_ratio: number;
  total_change_pct: number;
  volatility_pct: number;
}

interface SensitivityAnalysisProps {
  symbol1: string;  // e.g., "LINK"
  symbol2: string;  // e.g., "ETH"
  positionMintTimestamp: number;  // Unix timestamp of position creation
  currentThreshold?: number;  // Current threshold in BPS (e.g., 800)
  // Tick range for concentrated liquidity bounds
  tickLower?: number;
  tickUpper?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Convert Uniswap V3 tick to price ratio
// Tick represents token1/token0 price (e.g., WETH/LINK)
// Our chart shows token0_price/token1_price which equals token1/token0 pool price
const tickToPrice = (tick: number): number => {
  return Math.pow(1.0001, tick);
};

export function SensitivityAnalysis({
  symbol1,
  symbol2,
  positionMintTimestamp,
  currentThreshold = 800,
  tickLower,
  tickUpper,
}: SensitivityAnalysisProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PriceRatioDataPoint[]>([]);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [thresholdAnalysis, setThresholdAnalysis] = useState<ThresholdAnalysis | null>(null);
  const [threshold, setThreshold] = useState(currentThreshold / 10000);  // Convert BPS to decimal
  const [intervalHours, setIntervalHours] = useState(4);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/build/price-ratio-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol1,
          symbol2,
          from_timestamp: positionMintTimestamp,
          to_timestamp: Math.floor(Date.now() / 1000),
          interval_hours: intervalHours,
          threshold: threshold,
        }),
      });

      const result = await response.json();

      if (result.status === "success") {
        setData(result.data.time_series);
        setStats(result.data.statistics);
        setThresholdAnalysis(result.data.threshold_analysis);
      } else {
        setError(result.detail?.error || "Failed to fetch data");
      }
    } catch (err) {
      setError("Network error - please try again");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (positionMintTimestamp > 0) {
      fetchData();
    }
  }, [positionMintTimestamp, intervalHours, threshold]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRatio = (ratio: number) => ratio.toFixed(6);

  const getColor = (value: number): string => {
    if (value > 0) return "text-[#3FB950]";
    if (value < 0) return "text-[#F85149]";
    return "text-[#8B949E]";
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: number }) => {
    if (!active || !payload || !payload.length || label === undefined) return null;

    const point = data.find(d => d.timestamp === label);
    if (!point) return null;

    return (
      <div className="bg-[#161B22] border border-[#30363d] rounded-lg p-3 shadow-lg">
        <div className="text-xs text-[#8B949E] mb-2">{formatDateTime(point.timestamp)}</div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[#8B949E]">{symbol1} Price:</span>
            <span className="text-[#E6EDF3] font-mono">${point.price1.toFixed(4)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[#8B949E]">{symbol2} Price:</span>
            <span className="text-[#E6EDF3] font-mono">${point.price2.toFixed(2)}</span>
          </div>
          <div className="border-t border-[#30363d] pt-1 mt-1">
            <div className="flex justify-between gap-4">
              <span className="text-[#8B949E]">Ratio:</span>
              <span className="text-[#58A6FF] font-mono">{formatRatio(point.ratio)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#8B949E]">Deviation:</span>
              <span className={`font-mono ${getColor(point.deviation_pct)}`}>
                {point.deviation_pct > 0 ? "+" : ""}{point.deviation_pct.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="m-4 mt-0 bg-[#161B22] rounded-lg border border-[#30363d]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[#E6EDF3]">Sensitivity Analysis</h4>
          <p className="text-xs text-[#8B949E] mt-0.5">
            {symbol1}/{symbol2} price ratio over time
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#8B949E]">Interval</label>
            <select
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-[#0D1117] border border-[#30363d] rounded text-[#E6EDF3]"
            >
              <option value={1}>1H</option>
              <option value={4}>4H</option>
              <option value={24}>1D</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#8B949E]">Threshold</label>
            <input
              type="number"
              value={(threshold * 100).toFixed(1)}
              onChange={(e) => setThreshold(Number(e.target.value) / 100)}
              className="w-16 px-2 py-1 text-xs bg-[#0D1117] border border-[#30363d] rounded text-[#E6EDF3] text-right"
              step={0.5}
              min={0}
              max={50}
            />
            <span className="text-xs text-[#8B949E]">%</span>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#238636] hover:bg-[#2ea043] text-white rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className="text-center py-8 text-[#F85149]">
            <p>{error}</p>
            <button
              onClick={fetchData}
              className="mt-2 text-xs text-[#58A6FF] hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {loading && !data.length && (
          <div className="text-center py-12 text-[#8B949E]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p>Loading price data...</p>
          </div>
        )}

        {data.length > 0 && (
          <>
            {/* Statistics Cards */}
            {stats && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-[#0D1117] rounded-lg p-3 border border-[#30363d]">
                  <div className="text-xs text-[#8B949E] mb-1">Initial Ratio</div>
                  <div className="text-lg font-mono text-[#E6EDF3]">{formatRatio(stats.initial_ratio)}</div>
                </div>
                <div className="bg-[#0D1117] rounded-lg p-3 border border-[#30363d]">
                  <div className="text-xs text-[#8B949E] mb-1">Current Ratio</div>
                  <div className="text-lg font-mono text-[#E6EDF3]">{formatRatio(stats.current_ratio)}</div>
                  <div className={`text-xs mt-1 ${getColor(stats.total_change_pct)}`}>
                    {stats.total_change_pct > 0 ? "+" : ""}{stats.total_change_pct.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-[#0D1117] rounded-lg p-3 border border-[#30363d]">
                  <div className="text-xs text-[#8B949E] mb-1">Volatility</div>
                  <div className="text-lg font-mono text-[#E6EDF3]">{stats.volatility_pct.toFixed(1)}%</div>
                  <div className="text-xs text-[#8B949E] mt-1">Std Dev / Mean</div>
                </div>
                <div className="bg-[#0D1117] rounded-lg p-3 border border-[#30363d]">
                  <div className="text-xs text-[#8B949E] mb-1">Range</div>
                  <div className="text-sm font-mono text-[#E6EDF3]">
                    {formatRatio(stats.min_ratio)} - {formatRatio(stats.max_ratio)}
                  </div>
                  <div className="text-xs text-[#8B949E] mt-1">
                    {(((stats.max_ratio - stats.min_ratio) / stats.mean_ratio) * 100).toFixed(1)}% spread
                  </div>
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="bg-[#0D1117] rounded-lg p-4 border border-[#30363d]">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatDate}
                    stroke="#8B949E"
                    fontSize={11}
                    tickMargin={10}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => v.toFixed(5)}
                    stroke="#8B949E"
                    fontSize={11}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip />} />

                  {/* Concentrated Liquidity Range Bounds */}
                  {tickLower !== undefined && tickUpper !== undefined && (
                    <>
                      <ReferenceLine
                        y={tickToPrice(tickLower)}
                        stroke="#A855F7"
                        strokeWidth={2}
                        label={{ value: "Range Low", fill: "#A855F7", fontSize: 10, position: "left" }}
                      />
                      <ReferenceLine
                        y={tickToPrice(tickUpper)}
                        stroke="#A855F7"
                        strokeWidth={2}
                        label={{ value: "Range High", fill: "#A855F7", fontSize: 10, position: "left" }}
                      />
                    </>
                  )}

                  {/* Threshold bands */}
                  {thresholdAnalysis && (
                    <>
                      <ReferenceLine
                        y={thresholdAnalysis.upper_bound}
                        stroke="#F59E0B"
                        strokeDasharray="5 5"
                        label={{ value: `+${(threshold * 100).toFixed(0)}%`, fill: "#F59E0B", fontSize: 10 }}
                      />
                      <ReferenceLine
                        y={thresholdAnalysis.lower_bound}
                        stroke="#F59E0B"
                        strokeDasharray="5 5"
                        label={{ value: `-${(threshold * 100).toFixed(0)}%`, fill: "#F59E0B", fontSize: 10 }}
                      />
                      <ReferenceLine
                        y={stats?.initial_ratio}
                        stroke="#8B949E"
                        strokeDasharray="3 3"
                        label={{ value: "Initial", fill: "#8B949E", fontSize: 10 }}
                      />

                      {/* Breach areas */}
                      {thresholdAnalysis.breaches.map((breach, i) => (
                        <ReferenceArea
                          key={i}
                          x1={breach.start_timestamp}
                          x2={breach.end_timestamp}
                          fill={breach.direction === "above" ? "#F8514930" : "#3FB95030"}
                          fillOpacity={0.5}
                        />
                      ))}
                    </>
                  )}

                  <Line
                    type="monotone"
                    dataKey="ratio"
                    stroke="#58A6FF"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#58A6FF" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Threshold Breach Summary */}
            {thresholdAnalysis && thresholdAnalysis.breach_count > 0 && (
              <div className="mt-4 bg-[#9e6a03]/10 rounded-lg p-4 border border-[#9e6a03]/30">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-[#F59E0B]" />
                  <h5 className="text-sm font-semibold text-[#F59E0B]">
                    {thresholdAnalysis.breach_count} Threshold Breach{thresholdAnalysis.breach_count !== 1 ? "es" : ""}
                  </h5>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {thresholdAnalysis.breaches.slice(0, 4).map((breach, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 px-3 bg-[#0D1117] rounded border border-[#30363d]"
                    >
                      <div className="flex items-center gap-2">
                        {breach.direction === "above" ? (
                          <TrendingUp className="w-4 h-4 text-[#F85149]" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-[#3FB950]" />
                        )}
                        <span className="text-xs text-[#E6EDF3]">
                          {formatDateTime(breach.start_timestamp)}
                        </span>
                      </div>
                      <div className="text-xs text-[#8B949E]">
                        {breach.ongoing ? (
                          <span className="text-[#F59E0B]">Ongoing</span>
                        ) : (
                          `→ ${formatDateTime(breach.end_timestamp)}`
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {thresholdAnalysis.breach_count > 4 && (
                  <p className="text-xs text-[#8B949E] mt-2 text-center">
                    And {thresholdAnalysis.breach_count - 4} more...
                  </p>
                )}
              </div>
            )}

            {/* Insights */}
            {stats && (
              <div className="mt-4 p-4 bg-[#0D1117] rounded-lg border border-[#30363d]">
                <h5 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wide mb-3">
                  Analysis Insights
                </h5>
                <div className="space-y-2 text-sm">
                  <p className="text-[#E6EDF3]">
                    The {symbol1}/{symbol2} ratio has moved{" "}
                    <span className={getColor(stats.total_change_pct)}>
                      {stats.total_change_pct > 0 ? "+" : ""}{stats.total_change_pct.toFixed(2)}%
                    </span>{" "}
                    since position opened.
                  </p>
                  <p className="text-[#8B949E]">
                    With {stats.volatility_pct.toFixed(1)}% volatility and your{" "}
                    {(threshold * 100).toFixed(0)}% threshold, the ratio has breached{" "}
                    {thresholdAnalysis?.breach_count || 0} times.
                  </p>
                  {thresholdAnalysis && thresholdAnalysis.breach_count > 0 && (
                    <p className="text-[#F59E0B]">
                      Consider adjusting your threshold to{" "}
                      {Math.ceil(stats.volatility_pct * 1.5)}% for fewer false triggers,
                      or {Math.ceil(stats.volatility_pct * 0.75)}% for more aggressive rebalancing.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !error && data.length === 0 && positionMintTimestamp > 0 && (
          <div className="text-center py-12 text-[#8B949E]">
            <p>No price data available for this time range</p>
          </div>
        )}
      </div>
    </div>
  );
}
