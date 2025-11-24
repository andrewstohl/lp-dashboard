import { type LPPosition, type PerpetualPosition, formatCurrency, formatCompactCurrency } from "@/lib/api";

interface LedgerMatrixProps {
  lpPositions: LPPosition[];
  perpPositions: PerpetualPosition[];
}

interface TokenExposure {
  symbol: string;
  lpAmount: number;
  lpValue: number;
  perpAmount: number;
  perpValue: number;
  netAmount: number;
  netValue: number;
  lpFees: number;
  perpPnl: number;
  totalPnl: number;
}

interface MatchedPosition {
  lpPosition: LPPosition;
  perpPositions: PerpetualPosition[];
  token0Exposure: TokenExposure;
  token1Exposure: TokenExposure;
  totalLpValue: number;
  totalPerpValue: number;
  totalNetValue: number;
  totalFees: number;
  totalPerpPnl: number;
  grandTotalPnl: number;
  hedgeRatio: number;
}

export function LedgerMatrix({ lpPositions, perpPositions }: LedgerMatrixProps) {
  // Match LP positions with their perp hedges based on token symbols
  const matchedPositions: MatchedPosition[] = lpPositions.map((lp) => {
    const token0Symbol = lp.token0.symbol;
    const token1Symbol = lp.token1.symbol;
    
    const matchingPerps = perpPositions.filter((perp) => {
      const perpToken = perp.base_token.symbol;
      return perpToken === token0Symbol || perpToken === token1Symbol;
    });

    // Calculate token0 exposure
    const token0Perp = matchingPerps.find((p) => p.base_token.symbol === token0Symbol);
    const token0PerpAmount = token0Perp 
      ? (token0Perp.side === "Short" ? -token0Perp.position_size : token0Perp.position_size)
      : 0;
    const token0PerpValue = token0Perp
      ? (token0Perp.side === "Short" ? -token0Perp.position_value_usd : token0Perp.position_value_usd)
      : 0;

    // Calculate token1 exposure  
    const token1Perp = matchingPerps.find((p) => p.base_token.symbol === token1Symbol);
    const token1PerpAmount = token1Perp
      ? (token1Perp.side === "Short" ? -token1Perp.position_size : token1Perp.position_size)
      : 0;
    const token1PerpValue = token1Perp
      ? (token1Perp.side === "Short" ? -token1Perp.position_value_usd : token1Perp.position_value_usd)
      : 0;

    // Calculate per-token fees (split proportionally by token value)
    const totalTokenValue = lp.token0.value_usd + lp.token1.value_usd;
    const token0FeePortion = totalTokenValue > 0 ? lp.token0.value_usd / totalTokenValue : 0.5;
    const token1FeePortion = totalTokenValue > 0 ? lp.token1.value_usd / totalTokenValue : 0.5;
    const token0LpFees = lp.unclaimed_fees_usd * token0FeePortion;
    const token1LpFees = lp.unclaimed_fees_usd * token1FeePortion;

    // Calculate per-token perp P&L (split proportionally by absolute token value)
    const token0PerpPnl = token0Perp ? token0Perp.pnl_usd : 0;
    const token1PerpPnl = token1Perp ? token1Perp.pnl_usd : 0;

    const token0Exposure: TokenExposure = {
      symbol: token0Symbol,
      lpAmount: lp.token0.amount,
      lpValue: lp.token0.value_usd,
      perpAmount: token0PerpAmount,
      perpValue: token0PerpValue,
      netAmount: lp.token0.amount + token0PerpAmount,
      netValue: lp.token0.value_usd + token0PerpValue,
      lpFees: token0LpFees,
      perpPnl: token0PerpPnl,
      totalPnl: token0LpFees + token0PerpPnl,
    };

    const token1Exposure: TokenExposure = {
      symbol: token1Symbol,
      lpAmount: lp.token1.amount,
      lpValue: lp.token1.value_usd,
      perpAmount: token1PerpAmount,
      perpValue: token1PerpValue,
      netAmount: lp.token1.amount + token1PerpAmount,
      netValue: lp.token1.value_usd + token1PerpValue,
      lpFees: token1LpFees,
      perpPnl: token1PerpPnl,
      totalPnl: token1LpFees + token1PerpPnl,
    };

    const totalLpValue = lp.total_value_usd;
    const totalPerpValue = token0PerpValue + token1PerpValue;
    const totalNetValue = totalLpValue + totalPerpValue;
    const totalFees = lp.unclaimed_fees_usd;
    const totalPerpPnl = token0PerpPnl + token1PerpPnl;
    const grandTotalPnl = totalFees + totalPerpPnl;
    const hedgeRatio = totalLpValue > 0 ? Math.abs(totalPerpValue) / totalLpValue * 100 : 0;

    return {
      lpPosition: lp,
      perpPositions: matchingPerps,
      token0Exposure,
      token1Exposure,
      totalLpValue,
      totalPerpValue,
      totalNetValue,
      totalFees,
      totalPerpPnl,
      grandTotalPnl,
      hedgeRatio,
    };
  });

  // Find unmatched perps
  const matchedPerpIndices = new Set(
    matchedPositions.flatMap((m) => m.perpPositions.map((p) => p.position_index))
  );
  const unmatchedPerps = perpPositions.filter((p) => !matchedPerpIndices.has(p.position_index));

  // Format USD value - NO "+" signs, negative shows "-"
  const formatUsd = (value: number): string => {
    if (value < 0) {
      return `-${formatCurrency(Math.abs(value))}`;
    }
    return formatCurrency(value);
  };

  // Format token amount - NO "+" signs, negative shows "-"
  const formatAmount = (amount: number, decimals: number = 2): string => {
    if (amount < 0) {
      return `-${Math.abs(amount).toFixed(decimals)}`;
    }
    return amount.toFixed(decimals);
  };

  // Conditional color ONLY for NET amounts and TOTAL P&L
  const getNetColor = (value: number): string => {
    if (value > 0) return "text-[#3FB950]";
    if (value < 0) return "text-[#F85149]";
    return "text-[#8B949E]";
  };

  const getStatusBadge = (hedgeRatio: number) => {
    if (hedgeRatio >= 90 && hedgeRatio <= 110) {
      return { text: "🟢 HEDGED", textColor: "text-[#3FB950]" };
    } else if (hedgeRatio >= 70) {
      return { text: "🟡 PARTIAL", textColor: "text-[#F59E0B]" };
    } else if (hedgeRatio > 0) {
      return { text: "🔴 LOW HEDGE", textColor: "text-[#F85149]" };
    }
    return { text: "⚪ UNHEDGED", textColor: "text-[#8B949E]" };
  };

  return (
    <div className="space-y-6">
      {matchedPositions.map((matched, index) => {
        const { lpPosition, token0Exposure, token1Exposure } = matched;
        const status = getStatusBadge(matched.hedgeRatio);
        const pnlPercent = matched.totalLpValue > 0 
          ? (matched.grandTotalPnl / matched.totalLpValue) * 100 
          : 0;

        return (
          <div key={index} className="bg-[#161B22] rounded-xl border border-[#21262D] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#21262D] bg-[#1C2128]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <h3 className="text-xl font-bold text-[#E6EDF3]">{lpPosition.pool_name}</h3>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-[#8B949E]">
                    Total: <span className="text-[#E6EDF3] font-semibold">{formatCompactCurrency(matched.totalLpValue)}</span>
                  </span>
                  <span className="text-[#8B949E]">
                    P&L: <span className={`font-semibold ${getNetColor(matched.grandTotalPnl)}`}>
                      {formatUsd(matched.grandTotalPnl)} ({pnlPercent.toFixed(2)}%)
                    </span>
                  </span>
                  <span className="text-[#8B949E]">
                    Hedge: <span className="text-[#E6EDF3] font-semibold">{matched.hedgeRatio.toFixed(0)}%</span>
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${status.textColor}`}>{status.text}</span>
                </div>
              </div>
            </div>

            {/* Token Ledger Matrix */}
            <div className="p-6">
              <div className="bg-[#1C2128] rounded-lg border border-[#21262D] overflow-hidden">
                <div className="px-4 py-2 border-b border-[#21262D]">
                  <h4 className="text-sm font-semibold text-[#58A6FF]">TOKEN LEDGER</h4>
                </div>
                
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#21262D]">
                        <th className="px-4 py-3 text-left text-[#8B949E] font-medium w-28"></th>
                        <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">{token0Exposure.symbol}</th>
                        <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">{token1Exposure.symbol}</th>
                        <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* LP POSITION Row - USD on top (large/bold), token amount below (small/muted) */}
                      <tr className="border-b border-[#21262D]">
                        <td className="px-4 py-3 text-[#E6EDF3] font-medium">LP POSITION</td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token0Exposure.lpValue)}</div>
                          <div className="text-sm text-[#8B949E]">{formatAmount(token0Exposure.lpAmount)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token1Exposure.lpValue)}</div>
                          <div className="text-sm text-[#8B949E]">{formatAmount(token1Exposure.lpAmount)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(matched.totalLpValue)}</div>
                        </td>
                      </tr>
                      
                      {/* PERP HEDGE Row - USD on top, token amount below, NO conditional coloring */}
                      <tr className="border-b border-[#21262D]">
                        <td className="px-4 py-3 text-[#E6EDF3] font-medium">PERP HEDGE</td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token0Exposure.perpValue)}</div>
                          <div className="text-sm text-[#8B949E]">{formatAmount(token0Exposure.perpAmount)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token1Exposure.perpValue)}</div>
                          <div className="text-sm text-[#8B949E]">{formatAmount(token1Exposure.perpAmount)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(matched.totalPerpValue)}</div>
                        </td>
                      </tr>
                      
                      {/* NET Row - USD amounts and TOTAL get conditional coloring */}
                      <tr className="bg-[#21262D]">
                        <td className="px-4 py-3 text-[#A371F7] font-bold">NET</td>
                        <td className="px-4 py-3 text-right">
                          <div className={`text-lg font-bold ${getNetColor(token0Exposure.netValue)}`}>{formatUsd(token0Exposure.netValue)}</div>
                          <div className={`text-sm font-semibold ${getNetColor(token0Exposure.netAmount)}`}>
                            {formatAmount(token0Exposure.netAmount)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={`text-lg font-bold ${getNetColor(token1Exposure.netValue)}`}>{formatUsd(token1Exposure.netValue)}</div>
                          <div className={`text-sm font-semibold ${getNetColor(token1Exposure.netAmount)}`}>
                            {formatAmount(token1Exposure.netAmount)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={`text-lg font-bold ${getNetColor(matched.totalNetValue)}`}>{formatUsd(matched.totalNetValue)}</div>
                        </td>
                      </tr>
                      
                      {/* Divider */}
                      <tr><td colSpan={4} className="h-2"></td></tr>
                      
                      {/* FEES Row - per-token fees populated */}
                      <tr className="border-t border-[#21262D]">
                        <td className="px-4 py-3 text-[#8B949E] font-medium">FEES</td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token0Exposure.lpFees)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token1Exposure.lpFees)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(matched.totalFees)}</div>
                        </td>
                      </tr>
                      
                      {/* PERP P&L Row - per-token perp P&L populated */}
                      <tr>
                        <td className="px-4 py-3 text-[#8B949E] font-medium">PERP P&L</td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token0Exposure.perpPnl)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token1Exposure.perpPnl)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(matched.totalPerpPnl)}</div>
                        </td>
                      </tr>
                      
                      {/* TOTAL P&L Row - all amounts get conditional coloring */}
                      <tr className="bg-[#21262D]">
                        <td className="px-4 py-3 text-[#A371F7] font-bold">TOTAL P&L</td>
                        <td className="px-4 py-3 text-right">
                          <div className={`text-lg font-bold ${getNetColor(token0Exposure.totalPnl)}`}>{formatUsd(token0Exposure.totalPnl)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={`text-lg font-bold ${getNetColor(token1Exposure.totalPnl)}`}>{formatUsd(token1Exposure.totalPnl)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={`text-xl font-bold ${getNetColor(matched.grandTotalPnl)}`}>
                            {formatUsd(matched.grandTotalPnl)}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden p-4 space-y-4">
                  {/* Token 0 */}
                  <div className="bg-[#21262D] rounded-lg p-3">
                    <div className="text-sm font-semibold text-[#8B949E] mb-3">{token0Exposure.symbol}</div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[#8B949E] text-sm">LP</span>
                        <div className="text-right">
                          <div className="font-bold text-[#E6EDF3]">{formatUsd(token0Exposure.lpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token0Exposure.lpAmount)}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#8B949E] text-sm">Perp</span>
                        <div className="text-right">
                          <div className="font-bold text-[#E6EDF3]">{formatUsd(token0Exposure.perpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token0Exposure.perpAmount)}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-[#30363D]">
                        <span className="text-[#A371F7] font-bold text-sm">Net</span>
                        <div className="text-right">
                          <div className={`font-bold ${getNetColor(token0Exposure.netValue)}`}>{formatUsd(token0Exposure.netValue)}</div>
                          <div className={`text-xs font-semibold ${getNetColor(token0Exposure.netAmount)}`}>
                            {formatAmount(token0Exposure.netAmount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Token 1 */}
                  <div className="bg-[#21262D] rounded-lg p-3">
                    <div className="text-sm font-semibold text-[#8B949E] mb-3">{token1Exposure.symbol}</div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[#8B949E] text-sm">LP</span>
                        <div className="text-right">
                          <div className="font-bold text-[#E6EDF3]">{formatUsd(token1Exposure.lpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token1Exposure.lpAmount)}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#8B949E] text-sm">Perp</span>
                        <div className="text-right">
                          <div className="font-bold text-[#E6EDF3]">{formatUsd(token1Exposure.perpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token1Exposure.perpAmount)}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-[#30363D]">
                        <span className="text-[#A371F7] font-bold text-sm">Net</span>
                        <div className="text-right">
                          <div className={`font-bold ${getNetColor(token1Exposure.netValue)}`}>{formatUsd(token1Exposure.netValue)}</div>
                          <div className={`text-xs font-semibold ${getNetColor(token1Exposure.netAmount)}`}>
                            {formatAmount(token1Exposure.netAmount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* P&L Summary */}
                  <div className="bg-[#21262D] rounded-lg p-3">
                    <div className="text-sm font-semibold text-[#8B949E] mb-3">P&L Summary</div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[#8B949E] text-sm">Fees</span>
                        <span className="font-bold text-[#E6EDF3]">{formatUsd(matched.totalFees)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E] text-sm">Perp P&L</span>
                        <span className="font-bold text-[#E6EDF3]">{formatUsd(matched.totalPerpPnl)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-[#30363D]">
                        <span className="text-[#A371F7] font-bold text-sm">Total P&L</span>
                        <span className={`font-bold ${getNetColor(matched.grandTotalPnl)}`}>
                          {formatUsd(matched.grandTotalPnl)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Info */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[#8B949E]">
                <span>{lpPosition.chain.toUpperCase()}</span>
                <span>•</span>
                <span>{matched.perpPositions.length} hedge position{matched.perpPositions.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Unmatched Perps */}
      {unmatchedPerps.length > 0 && (
        <div className="bg-[#161B22] rounded-xl border border-[#21262D] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#21262D] bg-[#1C2128]">
            <h3 className="text-xl font-bold text-[#E6EDF3]">Standalone Perpetual Positions</h3>
            <p className="text-sm text-[#8B949E]">Not matched to any LP position</p>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {unmatchedPerps.map((perp, index) => (
                <div key={index} className="bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[#E6EDF3] font-medium">{perp.position_name}</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                        perp.side === "Long" ? "text-[#3FB950] bg-[#3FB950]/10" : "text-[#F85149] bg-[#F85149]/10"
                      }`}>
                        {perp.side}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${getNetColor(perp.pnl_usd)}`}>
                        {formatUsd(perp.pnl_usd)}
                      </div>
                      <div className="text-xs text-[#8B949E]">
                        {perp.leverage.toFixed(1)}x • {formatCurrency(perp.position_value_usd)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {matchedPositions.length === 0 && unmatchedPerps.length === 0 && (
        <div className="bg-[#161B22] rounded-xl border border-[#21262D] p-12 text-center">
          <div className="text-[#8B949E] text-lg">No positions to display in ledger view</div>
        </div>
      )}
    </div>
  );
}
