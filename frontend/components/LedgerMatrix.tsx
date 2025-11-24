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
}

interface MatchedPosition {
  lpPosition: LPPosition;
  perpPositions: PerpetualPosition[];
  token0Exposure: TokenExposure;
  token1Exposure: TokenExposure;
  totalLpValue: number;
  totalPerpValue: number;
  totalNetValue: number;
  fees: number;
  perpPnl: number;
  totalPnl: number;
  hedgeRatio: number;
}

export function LedgerMatrix({ lpPositions, perpPositions }: LedgerMatrixProps) {
  // Match LP positions with their perp hedges based on token symbols
  const matchedPositions: MatchedPosition[] = lpPositions.map((lp) => {
    // Find perps that match either token in the LP
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

    const token0Exposure: TokenExposure = {
      symbol: token0Symbol,
      lpAmount: lp.token0.amount,
      lpValue: lp.token0.value_usd,
      perpAmount: token0PerpAmount,
      perpValue: token0PerpValue,
      netAmount: lp.token0.amount + token0PerpAmount,
      netValue: lp.token0.value_usd + token0PerpValue,
    };

    const token1Exposure: TokenExposure = {
      symbol: token1Symbol,
      lpAmount: lp.token1.amount,
      lpValue: lp.token1.value_usd,
      perpAmount: token1PerpAmount,
      perpValue: token1PerpValue,
      netAmount: lp.token1.amount + token1PerpAmount,
      netValue: lp.token1.value_usd + token1PerpValue,
    };

    const totalLpValue = lp.total_value_usd;
    const totalPerpValue = token0PerpValue + token1PerpValue;
    const totalNetValue = totalLpValue + totalPerpValue;
    const fees = lp.unclaimed_fees_usd;
    const perpPnl = matchingPerps.reduce((sum, p) => sum + p.pnl_usd, 0);
    const totalPnl = fees + perpPnl;
    const hedgeRatio = totalLpValue > 0 ? Math.abs(totalPerpValue) / totalLpValue * 100 : 0;

    return {
      lpPosition: lp,
      perpPositions: matchingPerps,
      token0Exposure,
      token1Exposure,
      totalLpValue,
      totalPerpValue,
      totalNetValue,
      fees,
      perpPnl,
      totalPnl,
      hedgeRatio,
    };
  });

  // Find unmatched perps (not hedging any LP)
  const matchedPerpIndices = new Set(
    matchedPositions.flatMap((m) => m.perpPositions.map((p) => p.position_index))
  );
  const unmatchedPerps = perpPositions.filter((p) => !matchedPerpIndices.has(p.position_index));

  const formatValue = (value: number, showSign: boolean = true) => {
    const formatted = formatCurrency(Math.abs(value));
    if (!showSign) return formatted;
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  };

  const formatAmount = (amount: number, decimals: number = 4, showSign: boolean = true) => {
    const formatted = Math.abs(amount).toFixed(decimals);
    if (!showSign) return formatted;
    if (amount > 0) return `+${formatted}`;
    if (amount < 0) return `-${formatted}`;
    return formatted;
  };

  const getValueColor = (value: number) => {
    if (value > 0) return "text-[#3FB950]";
    if (value < 0) return "text-[#F85149]";
    return "text-[#8B949E]";
  };

  const getStatusBadge = (hedgeRatio: number, netValue: number) => {
    if (hedgeRatio >= 90 && hedgeRatio <= 110) {
      return { color: "bg-[#3FB950]", text: "🟢 HEDGED", textColor: "text-[#3FB950]" };
    } else if (hedgeRatio >= 70) {
      return { color: "bg-[#F59E0B]", text: "🟡 PARTIAL", textColor: "text-[#F59E0B]" };
    } else if (hedgeRatio > 0) {
      return { color: "bg-[#F85149]", text: "🔴 LOW HEDGE", textColor: "text-[#F85149]" };
    }
    return { color: "bg-[#8B949E]", text: "⚪ UNHEDGED", textColor: "text-[#8B949E]" };
  };

  return (
    <div className="space-y-6">
      {/* Matched Positions */}
      {matchedPositions.map((matched, index) => {
        const { lpPosition, token0Exposure, token1Exposure } = matched;
        const status = getStatusBadge(matched.hedgeRatio, matched.totalNetValue);
        const pnlPercent = matched.totalLpValue > 0 
          ? (matched.totalPnl / matched.totalLpValue) * 100 
          : 0;

        return (
          <div 
            key={index} 
            className="bg-[#161B22] rounded-xl border border-[#21262D] overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#21262D] bg-[#1C2128]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <h3 className="text-xl font-bold text-[#E6EDF3]">
                  {lpPosition.pool_name}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-[#8B949E]">
                    Total: <span className="text-[#E6EDF3] font-semibold">{formatCompactCurrency(matched.totalLpValue)}</span>
                  </span>
                  <span className="text-[#8B949E]">
                    P&L: <span className={`font-semibold ${getValueColor(matched.totalPnl)}`}>
                      {formatValue(matched.totalPnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                    </span>
                  </span>
                  <span className="text-[#8B949E]">
                    Hedge: <span className="text-[#E6EDF3] font-semibold">{matched.hedgeRatio.toFixed(0)}%</span>
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${status.textColor}`}>
                    {status.text}
                  </span>
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
                        <th className="px-4 py-3 text-left text-[#8B949E] font-medium w-24"></th>
                        <th className="px-4 py-3 text-right text-[#8B949E] font-medium">{token0Exposure.symbol}</th>
                        <th className="px-4 py-3 text-right text-[#8B949E] font-medium">{token1Exposure.symbol}</th>
                        <th className="px-4 py-3 text-right text-[#8B949E] font-medium">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* LP Row */}
                      <tr className="border-b border-[#21262D]">
                        <td className="px-4 py-2 text-[#E6EDF3] font-medium">LP</td>
                        <td className="px-4 py-2 text-right">
                          <span className="text-[#3FB950]">{formatAmount(token0Exposure.lpAmount)}</span>
                          <span className="text-[#8B949E] text-xs block">{formatValue(token0Exposure.lpValue)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="text-[#3FB950]">{formatAmount(token1Exposure.lpAmount)}</span>
                          <span className="text-[#8B949E] text-xs block">{formatValue(token1Exposure.lpValue)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="text-[#3FB950] font-semibold">{formatValue(matched.totalLpValue)}</span>
                        </td>
                      </tr>
                      
                      {/* Perp Row */}
                      <tr className="border-b border-[#21262D]">
                        <td className="px-4 py-2 text-[#E6EDF3] font-medium">Perp</td>
                        <td className="px-4 py-2 text-right">
                          <span className={getValueColor(token0Exposure.perpAmount)}>{formatAmount(token0Exposure.perpAmount)}</span>
                          <span className="text-[#8B949E] text-xs block">{formatValue(token0Exposure.perpValue)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={getValueColor(token1Exposure.perpAmount)}>{formatAmount(token1Exposure.perpAmount)}</span>
                          <span className="text-[#8B949E] text-xs block">{formatValue(token1Exposure.perpValue)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-semibold ${getValueColor(matched.totalPerpValue)}`}>{formatValue(matched.totalPerpValue)}</span>
                        </td>
                      </tr>
                      
                      {/* NET Row */}
                      <tr className="bg-[#21262D]">
                        <td className="px-4 py-2 text-[#A371F7] font-bold">NET</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-bold ${getValueColor(token0Exposure.netAmount)}`}>{formatAmount(token0Exposure.netAmount)}</span>
                          <span className={`text-xs block ${getValueColor(token0Exposure.netValue)}`}>{formatValue(token0Exposure.netValue)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-bold ${getValueColor(token1Exposure.netAmount)}`}>{formatAmount(token1Exposure.netAmount)}</span>
                          <span className={`text-xs block ${getValueColor(token1Exposure.netValue)}`}>{formatValue(token1Exposure.netValue)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-bold ${getValueColor(matched.totalNetValue)}`}>{formatValue(matched.totalNetValue)}</span>
                        </td>
                      </tr>
                      
                      {/* Divider */}
                      <tr><td colSpan={4} className="h-2"></td></tr>
                      
                      {/* P&L Section */}
                      <tr className="border-t border-[#21262D]">
                        <td className="px-4 py-2 text-[#8B949E]">Fees</td>
                        <td className="px-4 py-2 text-right text-[#3FB950]">—</td>
                        <td className="px-4 py-2 text-right text-[#3FB950]">—</td>
                        <td className="px-4 py-2 text-right text-[#3FB950]">{formatValue(matched.fees)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-[#8B949E]">Perp P&L</td>
                        <td className="px-4 py-2 text-right">—</td>
                        <td className="px-4 py-2 text-right">—</td>
                        <td className={`px-4 py-2 text-right ${getValueColor(matched.perpPnl)}`}>{formatValue(matched.perpPnl)}</td>
                      </tr>
                      <tr className="bg-[#21262D]">
                        <td className="px-4 py-2 text-[#A371F7] font-bold">Total P&L</td>
                        <td className="px-4 py-2 text-right">—</td>
                        <td className="px-4 py-2 text-right">—</td>
                        <td className={`px-4 py-2 text-right font-bold ${getValueColor(matched.totalPnl)}`}>{formatValue(matched.totalPnl)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden p-4 space-y-4">
                  {/* Token 0 */}
                  <div className="bg-[#21262D] rounded-lg p-3">
                    <div className="text-sm text-[#8B949E] mb-2">{token0Exposure.symbol}</div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-[#8B949E] text-xs">LP</div>
                        <div className="text-[#3FB950]">{formatAmount(token0Exposure.lpAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[#8B949E] text-xs">Perp</div>
                        <div className={getValueColor(token0Exposure.perpAmount)}>{formatAmount(token0Exposure.perpAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[#8B949E] text-xs">Net</div>
                        <div className={`font-bold ${getValueColor(token0Exposure.netAmount)}`}>{formatAmount(token0Exposure.netAmount)}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Token 1 */}
                  <div className="bg-[#21262D] rounded-lg p-3">
                    <div className="text-sm text-[#8B949E] mb-2">{token1Exposure.symbol}</div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-[#8B949E] text-xs">LP</div>
                        <div className="text-[#3FB950]">{formatAmount(token1Exposure.lpAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[#8B949E] text-xs">Perp</div>
                        <div className={getValueColor(token1Exposure.perpAmount)}>{formatAmount(token1Exposure.perpAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[#8B949E] text-xs">Net</div>
                        <div className={`font-bold ${getValueColor(token1Exposure.netAmount)}`}>{formatAmount(token1Exposure.netAmount)}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* P&L Summary */}
                  <div className="bg-[#21262D] rounded-lg p-3">
                    <div className="text-sm text-[#8B949E] mb-2">P&L Summary</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Fees</span>
                        <span className="text-[#3FB950]">{formatValue(matched.fees)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Perp P&L</span>
                        <span className={getValueColor(matched.perpPnl)}>{formatValue(matched.perpPnl)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-[#30363D]">
                        <span className="text-[#A371F7] font-bold">Total</span>
                        <span className={`font-bold ${getValueColor(matched.totalPnl)}`}>{formatValue(matched.totalPnl)}</span>
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
            <h3 className="text-xl font-bold text-[#E6EDF3]">
              Standalone Perpetual Positions
            </h3>
            <p className="text-sm text-[#8B949E]">
              Not matched to any LP position
            </p>
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
                      <div className={`font-semibold ${getValueColor(perp.pnl_usd)}`}>
                        {formatValue(perp.pnl_usd)}
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
          <div className="text-[#8B949E] text-lg">
            No positions to display in ledger view
          </div>
        </div>
      )}
    </div>
  );
}
