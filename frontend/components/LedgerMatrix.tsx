"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { 
  type LPPosition, 
  type PerpetualPosition, 
  type GMXRewards,
  type PerpHistory,
  formatCurrency, 
  formatCompactCurrency 
} from "@/lib/api";

interface LedgerMatrixProps {
  lpPositions: LPPosition[];
  perpPositions: PerpetualPosition[];
  gmxRewards?: GMXRewards;
  perpHistory?: PerpHistory;
  totalGasFees?: number;
}

interface TokenExposure {
  symbol: string;
  // Position Analysis
  initialLpAmount: number;
  initialLpValue: number;
  initialLpPercent: number;
  currentLpAmount: number;
  currentLpValue: number;
  currentLpPercent: number;
  positionDrift: number;
  perpAmount: number;
  perpValue: number;
  netAmount: number;
  netValue: number;
  // Performance Analysis
  lpPnl: number;
  claimedFees: number;
  unclaimedFees: number;
  feesSubtotal: number;
  perpInitialMargin: number;
  perpUnrealizedPnl: number;
  perpRealizedPnl: number;
  perpFunding: number;
  perpSubtotal: number;
  totalPnl: number;
}

interface MatchedPosition {
  lpPosition: LPPosition;
  perpPositions: PerpetualPosition[];
  token0: TokenExposure;
  token1: TokenExposure;
  // Totals
  totalInitialLpValue: number;
  totalCurrentLpValue: number;
  totalLpPnl: number;
  totalPerpValue: number;
  totalNetValue: number;
  totalClaimedFees: number;
  totalUnclaimedFees: number;
  totalFeesSubtotal: number;
  totalPerpInitialMargin: number;
  totalPerpUnrealizedPnl: number;
  totalPerpRealizedPnl: number;
  totalPerpFunding: number;
  totalPerpSubtotal: number;
  totalGasFees: number;
  grandTotalPnl: number;
  hedgeRatio: number;
}

export function LedgerMatrix({ lpPositions, perpPositions, gmxRewards, perpHistory, totalGasFees = 0 }: LedgerMatrixProps) {
  const [expandedPositions, setExpandedPositions] = useState<Set<number>>(new Set());

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedPositions);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedPositions(newExpanded);
  };

  // Format USD - no "+" signs, negative shows "-"
  const formatUsd = (value: number): string => {
    if (value < 0) return `-${formatCurrency(Math.abs(value))}`;
    return formatCurrency(value);
  };

  // Format token amount
  const formatAmount = (amount: number, decimals: number = 2): string => {
    if (amount < 0) return `-${Math.abs(amount).toFixed(decimals)}`;
    return amount.toFixed(decimals);
  };

  // Conditional color for NET and P&L values
  const getColor = (value: number): string => {
    if (value > 0) return "text-[#3FB950]";
    if (value < 0) return "text-[#F85149]";
    return "text-[#8B949E]";
  };

  // Status badge based on hedge ratio
  const getStatusBadge = (hedgeRatio: number) => {
    if (hedgeRatio >= 90 && hedgeRatio <= 110) return { text: "🟢 HEDGED", color: "text-[#3FB950]" };
    if (hedgeRatio >= 70) return { text: "🟡 PARTIAL", color: "text-[#F59E0B]" };
    if (hedgeRatio > 0) return { text: "🔴 LOW HEDGE", color: "text-[#F85149]" };
    return { text: "⚪ UNHEDGED", color: "text-[#8B949E]" };
  };

  // Calculate matched positions with all the data
  const matchedPositions: MatchedPosition[] = lpPositions.map((lp) => {
    const token0Symbol = lp.token0.symbol;
    const token1Symbol = lp.token1.symbol;
    
    // Find matching perps
    const matchingPerps = perpPositions.filter((perp) => {
      const perpToken = perp.base_token.symbol;
      return perpToken === token0Symbol || perpToken === token1Symbol;
    });

    const token0Perp = matchingPerps.find((p) => p.base_token.symbol === token0Symbol);
    const token1Perp = matchingPerps.find((p) => p.base_token.symbol === token1Symbol);

    // Initial values (from enriched data or fallback to current)
    const initial0Amount = lp.initial_deposits?.token0?.amount ?? lp.token0.amount;
    const initial0Value = lp.initial_deposits?.token0?.value_usd ?? lp.token0.value_usd;
    const initial1Amount = lp.initial_deposits?.token1?.amount ?? lp.token1.amount;
    const initial1Value = lp.initial_deposits?.token1?.value_usd ?? lp.token1.value_usd;
    const totalInitialValue = initial0Value + initial1Value;

    // Calculate percentages
    const initial0Percent = totalInitialValue > 0 ? (initial0Value / totalInitialValue) * 100 : 50;
    const initial1Percent = totalInitialValue > 0 ? (initial1Value / totalInitialValue) * 100 : 50;
    const totalCurrentValue = lp.token0.value_usd + lp.token1.value_usd;
    const current0Percent = totalCurrentValue > 0 ? (lp.token0.value_usd / totalCurrentValue) * 100 : 50;
    const current1Percent = totalCurrentValue > 0 ? (lp.token1.value_usd / totalCurrentValue) * 100 : 50;

    // Perp values
    const perp0Amount = token0Perp ? (token0Perp.side === "Short" ? -token0Perp.position_size : token0Perp.position_size) : 0;
    const perp0Value = token0Perp ? (token0Perp.side === "Short" ? -token0Perp.position_value_usd : token0Perp.position_value_usd) : 0;
    const perp1Amount = token1Perp ? (token1Perp.side === "Short" ? -token1Perp.position_size : token1Perp.position_size) : 0;
    const perp1Value = token1Perp ? (token1Perp.side === "Short" ? -token1Perp.position_value_usd : token1Perp.position_value_usd) : 0;

    // Fee calculations
    const totalFeeValue = lp.token0.value_usd + lp.token1.value_usd;
    const fee0Portion = totalFeeValue > 0 ? lp.token0.value_usd / totalFeeValue : 0.5;
    const fee1Portion = totalFeeValue > 0 ? lp.token1.value_usd / totalFeeValue : 0.5;
    const unclaimed0 = lp.unclaimed_fees_usd * fee0Portion;
    const unclaimed1 = lp.unclaimed_fees_usd * fee1Portion;
    const claimed0 = lp.claimed_fees?.token0 ?? 0;
    const claimed1 = lp.claimed_fees?.token1 ?? 0;

    // Perp P&L and funding
    const perp0Pnl = token0Perp?.pnl_usd ?? 0;
    const perp1Pnl = token1Perp?.pnl_usd ?? 0;
    const perp0Margin = token0Perp?.initial_margin_usd ?? token0Perp?.margin_token?.value_usd ?? 0;
    const perp1Margin = token1Perp?.initial_margin_usd ?? token1Perp?.margin_token?.value_usd ?? 0;
    const perp0Funding = token0Perp?.funding_rewards_usd ?? 0;
    const perp1Funding = token1Perp?.funding_rewards_usd ?? 0;
    
    // Allocate realized P&L proportionally based on margin values
    const totalMargin = perp0Margin + perp1Margin;
    const realizedPnl = perpHistory?.realized_pnl ?? 0;
    const perp0RealizedPnl = totalMargin > 0 ? realizedPnl * (perp0Margin / totalMargin) : 0;
    const perp1RealizedPnl = totalMargin > 0 ? realizedPnl * (perp1Margin / totalMargin) : 0;

    // Build token exposures
    const token0: TokenExposure = {
      symbol: token0Symbol,
      initialLpAmount: initial0Amount,
      initialLpValue: initial0Value,
      initialLpPercent: initial0Percent,
      currentLpAmount: lp.token0.amount,
      currentLpValue: lp.token0.value_usd,
      currentLpPercent: current0Percent,
      positionDrift: current0Percent - initial0Percent,
      perpAmount: perp0Amount,
      perpValue: perp0Value,
      netAmount: lp.token0.amount + perp0Amount,
      netValue: lp.token0.value_usd + perp0Value,
      lpPnl: lp.token0.value_usd - initial0Value,
      claimedFees: claimed0,
      unclaimedFees: unclaimed0,
      feesSubtotal: claimed0 + unclaimed0,
      perpInitialMargin: perp0Margin,
      perpUnrealizedPnl: perp0Pnl,
      perpRealizedPnl: perp0RealizedPnl,
      perpFunding: perp0Funding,
      perpSubtotal: perp0Pnl + perp0RealizedPnl + perp0Funding,
      totalPnl: (lp.token0.value_usd - initial0Value) + claimed0 + unclaimed0 + perp0Pnl + perp0RealizedPnl + perp0Funding,
    };

    const token1: TokenExposure = {
      symbol: token1Symbol,
      initialLpAmount: initial1Amount,
      initialLpValue: initial1Value,
      initialLpPercent: initial1Percent,
      currentLpAmount: lp.token1.amount,
      currentLpValue: lp.token1.value_usd,
      currentLpPercent: current1Percent,
      positionDrift: current1Percent - initial1Percent,
      perpAmount: perp1Amount,
      perpValue: perp1Value,
      netAmount: lp.token1.amount + perp1Amount,
      netValue: lp.token1.value_usd + perp1Value,
      lpPnl: lp.token1.value_usd - initial1Value,
      claimedFees: claimed1,
      unclaimedFees: unclaimed1,
      feesSubtotal: claimed1 + unclaimed1,
      perpInitialMargin: perp1Margin,
      perpUnrealizedPnl: perp1Pnl,
      perpRealizedPnl: perp1RealizedPnl,
      perpFunding: perp1Funding,
      perpSubtotal: perp1Pnl + perp1RealizedPnl + perp1Funding,
      totalPnl: (lp.token1.value_usd - initial1Value) + claimed1 + unclaimed1 + perp1Pnl + perp1RealizedPnl + perp1Funding,
    };

    // Calculate totals
    const totalLpPnl = token0.lpPnl + token1.lpPnl;
    const totalPerpValue = perp0Value + perp1Value;
    const totalNetValue = totalCurrentValue + totalPerpValue;
    const totalPerpSubtotal = token0.perpSubtotal + token1.perpSubtotal;
    const gasFees = lp.gas_fees_usd ?? 0;
    const grandTotal = totalLpPnl + token0.feesSubtotal + token1.feesSubtotal + totalPerpSubtotal - gasFees;
    const hedgeRatio = totalCurrentValue > 0 ? (Math.abs(totalPerpValue) / totalCurrentValue) * 100 : 0;

    return {
      lpPosition: lp,
      perpPositions: matchingPerps,
      token0,
      token1,
      totalInitialLpValue: totalInitialValue,
      totalCurrentLpValue: totalCurrentValue,
      totalLpPnl,
      totalPerpValue,
      totalNetValue,
      totalClaimedFees: claimed0 + claimed1,
      totalUnclaimedFees: lp.unclaimed_fees_usd,
      totalFeesSubtotal: token0.feesSubtotal + token1.feesSubtotal,
      totalPerpInitialMargin: perp0Margin + perp1Margin,
      totalPerpUnrealizedPnl: perp0Pnl + perp1Pnl,
      totalPerpRealizedPnl: perp0RealizedPnl + perp1RealizedPnl,
      totalPerpFunding: perp0Funding + perp1Funding,
      totalPerpSubtotal,
      totalGasFees: gasFees,
      grandTotalPnl: grandTotal,
      hedgeRatio,
    };
  });

  // Find unmatched perps
  const matchedPerpIndices = new Set(matchedPositions.flatMap((m) => m.perpPositions.map((p) => p.position_index)));
  const unmatchedPerps = perpPositions.filter((p) => !matchedPerpIndices.has(p.position_index));

  return (
    <div className="space-y-4">
      {matchedPositions.map((matched, index) => {
        const { lpPosition, token0, token1 } = matched;
        const isExpanded = expandedPositions.has(index);
        const status = getStatusBadge(matched.hedgeRatio);

        return (
          <div key={index} className="bg-[#161B22] rounded-xl border border-[#21262D] overflow-hidden">
            {/* Collapsed Header - Always Visible */}
            <div
              className="px-6 py-4 cursor-pointer hover:bg-[#1C2128] transition-colors"
              onClick={() => toggleExpanded(index)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-[#8B949E]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-[#8B949E]" />
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-[#E6EDF3]">{lpPosition.pool_name}</h3>
                    <p className="text-sm text-[#8B949E]">
                      Uniswap V3 · {lpPosition.chain.toUpperCase()} · {lpPosition.fee_tier ? `${(lpPosition.fee_tier * 100).toFixed(2)}%` : 'Unknown'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <div className="text-[#8B949E]">Net Exposure</div>
                    <div className={`font-bold ${getColor(matched.totalNetValue)}`}>
                      {formatUsd(matched.totalNetValue)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#8B949E]">Total P&L</div>
                    <div className={`font-bold ${getColor(matched.grandTotalPnl)}`}>
                      {formatUsd(matched.grandTotalPnl)}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${status.color}`}>
                    {status.text}
                  </span>
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-[#21262D]">
                {/* POSITION ANALYSIS */}
                <div className="p-6 border-b border-[#21262D]">
                  <h4 className="text-sm font-bold text-[#58A6FF] mb-4">POSITION ANALYSIS</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#21262D]">
                          <th className="px-4 py-3 text-left text-[#8B949E] font-medium w-36"></th>
                          <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">{token0.symbol}</th>
                          <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">{token1.symbol}</th>
                          <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Initial LP */}
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-3 text-[#E6EDF3] font-medium">Initial LP</td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token0.initialLpValue)}</div>
                            <div className="text-sm text-[#8B949E]">{formatAmount(token0.initialLpAmount)} ({token0.initialLpPercent.toFixed(0)}%)</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token1.initialLpValue)}</div>
                            <div className="text-sm text-[#8B949E]">{formatAmount(token1.initialLpAmount)} ({token1.initialLpPercent.toFixed(0)}%)</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(matched.totalInitialLpValue)}</div>
                          </td>
                        </tr>
                        {/* Current LP */}
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-3 text-[#E6EDF3] font-medium">Current LP</td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token0.currentLpValue)}</div>
                            <div className="text-sm text-[#8B949E]">{formatAmount(token0.currentLpAmount)} ({token0.currentLpPercent.toFixed(0)}%)</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token1.currentLpValue)}</div>
                            <div className="text-sm text-[#8B949E]">{formatAmount(token1.currentLpAmount)} ({token1.currentLpPercent.toFixed(0)}%)</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(matched.totalCurrentLpValue)}</div>
                          </td>
                        </tr>
                        {/* Position Drift */}
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-3 text-[#8B949E] font-medium">Position Drift</td>
                          <td className="px-4 py-3 text-right">
                            <div className={`text-lg font-bold ${getColor(token0.positionDrift)}`}>
                              {token0.positionDrift > 0 ? "+" : ""}{token0.positionDrift.toFixed(0)}%
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className={`text-lg font-bold ${getColor(token1.positionDrift)}`}>
                              {token1.positionDrift > 0 ? "+" : ""}{token1.positionDrift.toFixed(0)}%
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-[#8B949E]">—</td>
                        </tr>
                        {/* Perp Hedge */}
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-3 text-[#E6EDF3] font-medium">Perp Hedge</td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token0.perpValue)}</div>
                            <div className="text-sm text-[#8B949E]">{formatAmount(token0.perpAmount)}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(token1.perpValue)}</div>
                            <div className="text-sm text-[#8B949E]">{formatAmount(token1.perpAmount)}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="text-lg font-bold text-[#E6EDF3]">{formatUsd(matched.totalPerpValue)}</div>
                          </td>
                        </tr>
                        {/* Net Exposure */}
                        <tr className="bg-[#21262D]">
                          <td className="px-4 py-3 text-[#A371F7] font-bold">Net Exposure</td>
                          <td className="px-4 py-3 text-right">
                            <div className={`text-lg font-bold ${getColor(token0.netValue)}`}>{formatUsd(token0.netValue)}</div>
                            <div className="text-sm text-[#8B949E]">{formatAmount(token0.netAmount)}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className={`text-lg font-bold ${getColor(token1.netValue)}`}>{formatUsd(token1.netValue)}</div>
                            <div className="text-sm text-[#8B949E]">{formatAmount(token1.netAmount)}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className={`text-lg font-bold ${getColor(matched.totalNetValue)}`}>{formatUsd(matched.totalNetValue)}</div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* PERFORMANCE ANALYSIS */}
                <div className="p-6">
                  <h4 className="text-sm font-bold text-[#58A6FF] mb-4">PERFORMANCE ANALYSIS</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#21262D]">
                          <th className="px-4 py-3 text-left text-[#8B949E] font-medium w-36"></th>
                          <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">{token0.symbol}</th>
                          <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">{token1.symbol}</th>
                          <th className="px-4 py-3 text-right text-lg font-bold text-[#E6EDF3]">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* LP POSITION Section */}
                        <tr className="border-b border-[#21262D]">
                          <td colSpan={4} className="px-4 py-2 text-[#8B949E] font-semibold bg-[#1C2128]">LP POSITION</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Initial Value</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token0.initialLpValue)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token1.initialLpValue)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(matched.totalInitialLpValue)}</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Current Value</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token0.currentLpValue)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token1.currentLpValue)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(matched.totalCurrentLpValue)}</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#E6EDF3] font-medium pl-8">Subtotal</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(token0.lpPnl)}`}>{formatUsd(token0.lpPnl)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(token1.lpPnl)}`}>{formatUsd(token1.lpPnl)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(matched.totalLpPnl)}`}>{formatUsd(matched.totalLpPnl)}</span>
                          </td>
                        </tr>

                        {/* LP FEES Section */}
                        <tr className="border-b border-[#21262D]">
                          <td colSpan={4} className="px-4 py-2 text-[#8B949E] font-semibold bg-[#1C2128]">LP FEES</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Claimed</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token0.claimedFees)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token1.claimedFees)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(matched.totalClaimedFees)}</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Unclaimed</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token0.unclaimedFees)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token1.unclaimedFees)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(matched.totalUnclaimedFees)}</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#E6EDF3] font-medium pl-8">Subtotal</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(token0.feesSubtotal)}`}>{formatUsd(token0.feesSubtotal)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(token1.feesSubtotal)}`}>{formatUsd(token1.feesSubtotal)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(matched.totalFeesSubtotal)}`}>{formatUsd(matched.totalFeesSubtotal)}</span>
                          </td>
                        </tr>

                        {/* PERP HEDGE Section */}
                        <tr className="border-b border-[#21262D]">
                          <td colSpan={4} className="px-4 py-2 text-[#8B949E] font-semibold bg-[#1C2128]">PERP HEDGE</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Initial Margin</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token0.perpInitialMargin)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token1.perpInitialMargin)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(matched.totalPerpInitialMargin)}</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Unrealized P&L</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token0.perpUnrealizedPnl)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token1.perpUnrealizedPnl)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(matched.totalPerpUnrealizedPnl)}</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Realized P&L</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`${getColor(token0.perpRealizedPnl)}`}>{formatUsd(token0.perpRealizedPnl)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`${getColor(token1.perpRealizedPnl)}`}>{formatUsd(token1.perpRealizedPnl)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`${getColor(matched.totalPerpRealizedPnl)}`}>{formatUsd(matched.totalPerpRealizedPnl)}</span>
                          </td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Funding</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token0.perpFunding)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(token1.perpFunding)}</td>
                          <td className="px-4 py-2 text-right text-[#E6EDF3]">{formatUsd(matched.totalPerpFunding)}</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#E6EDF3] font-medium pl-8">Subtotal</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(token0.perpSubtotal)}`}>{formatUsd(token0.perpSubtotal)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(token1.perpSubtotal)}`}>{formatUsd(token1.perpSubtotal)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-bold ${getColor(matched.totalPerpSubtotal)}`}>{formatUsd(matched.totalPerpSubtotal)}</span>
                          </td>
                        </tr>

                        {/* COSTS Section */}
                        <tr className="border-b border-[#21262D]">
                          <td colSpan={4} className="px-4 py-2 text-[#8B949E] font-semibold bg-[#1C2128]">COSTS</td>
                        </tr>
                        <tr className="border-b border-[#21262D]">
                          <td className="px-4 py-2 text-[#8B949E] pl-8">Gas Fees</td>
                          <td className="px-4 py-2 text-right text-[#8B949E]">—</td>
                          <td className="px-4 py-2 text-right text-[#8B949E]">—</td>
                          <td className="px-4 py-2 text-right text-[#F85149]">{formatUsd(-matched.totalGasFees)}</td>
                        </tr>

                        {/* TOTAL P&L */}
                        <tr className="bg-[#21262D]">
                          <td className="px-4 py-3 text-[#A371F7] font-bold">TOTAL P&L</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-lg font-bold ${getColor(token0.totalPnl)}`}>{formatUsd(token0.totalPnl)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-lg font-bold ${getColor(token1.totalPnl)}`}>{formatUsd(token1.totalPnl)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xl font-bold ${getColor(matched.grandTotalPnl)}`}>{formatUsd(matched.grandTotalPnl)}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Unmatched Perps */}
      {unmatchedPerps.length > 0 && (
        <div className="bg-[#161B22] rounded-xl border border-[#21262D] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#21262D] bg-[#1C2128]">
            <h3 className="text-lg font-bold text-[#E6EDF3]">Standalone Perpetual Positions</h3>
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
                      <div className={`font-semibold ${getColor(perp.pnl_usd)}`}>
                        {formatUsd(perp.pnl_usd)}
                      </div>
                      <div className="text-xs text-[#8B949E]">
                        {perp.leverage.toFixed(1)}x · {formatCompactCurrency(perp.position_value_usd)}
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
          <div className="text-[#8B949E] text-lg">No positions to display</div>
        </div>
      )}
    </div>
  );
}
