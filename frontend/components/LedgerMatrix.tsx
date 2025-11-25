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

  const formatUsd = (value: number): string => {
    if (value < 0) return `-${formatCurrency(Math.abs(value))}`;
    return formatCurrency(value);
  };

  const formatAmount = (amount: number, decimals: number = 2): string => {
    if (amount < 0) return `-${Math.abs(amount).toFixed(decimals)}`;
    return amount.toFixed(decimals);
  };

  const getColor = (value: number): string => {
    if (value > 0) return "text-[#3FB950]";
    if (value < 0) return "text-[#F85149]";
    return "text-[#8B949E]";
  };

  const getStatusBadge = (hedgeRatio: number) => {
    if (hedgeRatio >= 90 && hedgeRatio <= 110) return { text: "HEDGED", color: "bg-[#238636]/20 text-[#3FB950] border border-[#238636]/30" };
    if (hedgeRatio >= 70) return { text: "PARTIAL", color: "bg-[#9e6a03]/20 text-[#F59E0B] border border-[#9e6a03]/30" };
    if (hedgeRatio > 0) return { text: "LOW HEDGE", color: "bg-[#da3633]/20 text-[#F85149] border border-[#da3633]/30" };
    return { text: "UNHEDGED", color: "bg-[#30363d] text-[#8B949E] border border-[#30363d]" };
  };

  // Calculate matched positions with all the data
  const matchedPositions: MatchedPosition[] = lpPositions.map((lp) => {
    const token0Symbol = lp.token0.symbol;
    const token1Symbol = lp.token1.symbol;
    
    const matchingPerps = perpPositions.filter((perp) => {
      const perpToken = perp.base_token.symbol;
      return perpToken === token0Symbol || perpToken === token1Symbol;
    });

    const token0Perp = matchingPerps.find((p) => p.base_token.symbol === token0Symbol);
    const token1Perp = matchingPerps.find((p) => p.base_token.symbol === token1Symbol);

    const initial0Amount = lp.initial_deposits?.token0?.amount ?? lp.token0.amount;
    const initial0Value = lp.initial_deposits?.token0?.value_usd ?? lp.token0.value_usd;
    const initial1Amount = lp.initial_deposits?.token1?.amount ?? lp.token1.amount;
    const initial1Value = lp.initial_deposits?.token1?.value_usd ?? lp.token1.value_usd;
    const totalInitialValue = initial0Value + initial1Value;

    const initial0Percent = totalInitialValue > 0 ? (initial0Value / totalInitialValue) * 100 : 50;
    const initial1Percent = totalInitialValue > 0 ? (initial1Value / totalInitialValue) * 100 : 50;
    const totalCurrentValue = lp.token0.value_usd + lp.token1.value_usd;
    const current0Percent = totalCurrentValue > 0 ? (lp.token0.value_usd / totalCurrentValue) * 100 : 50;
    const current1Percent = totalCurrentValue > 0 ? (lp.token1.value_usd / totalCurrentValue) * 100 : 50;

    const perp0Amount = token0Perp ? (token0Perp.side === "Short" ? -token0Perp.position_size : token0Perp.position_size) : 0;
    const perp0Value = token0Perp ? (token0Perp.side === "Short" ? -token0Perp.position_value_usd : token0Perp.position_value_usd) : 0;
    const perp1Amount = token1Perp ? (token1Perp.side === "Short" ? -token1Perp.position_size : token1Perp.position_size) : 0;
    const perp1Value = token1Perp ? (token1Perp.side === "Short" ? -token1Perp.position_value_usd : token1Perp.position_value_usd) : 0;

    const totalFeeValue = lp.token0.value_usd + lp.token1.value_usd;
    const fee0Portion = totalFeeValue > 0 ? lp.token0.value_usd / totalFeeValue : 0.5;
    const fee1Portion = totalFeeValue > 0 ? lp.token1.value_usd / totalFeeValue : 0.5;
    const unclaimed0 = lp.unclaimed_fees_usd * fee0Portion;
    const unclaimed1 = lp.unclaimed_fees_usd * fee1Portion;
    const claimed0 = lp.claimed_fees?.token0 ?? 0;
    const claimed1 = lp.claimed_fees?.token1 ?? 0;

    const perp0Pnl = token0Perp?.pnl_usd ?? 0;
    const perp1Pnl = token1Perp?.pnl_usd ?? 0;
    const perp0Margin = token0Perp?.initial_margin_usd ?? token0Perp?.margin_token?.value_usd ?? 0;
    const perp1Margin = token1Perp?.initial_margin_usd ?? token1Perp?.margin_token?.value_usd ?? 0;
    const perp0Funding = token0Perp?.funding_rewards_usd ?? 0;
    const perp1Funding = token1Perp?.funding_rewards_usd ?? 0;
    
    const totalMargin = perp0Margin + perp1Margin;
    const realizedPnl = perpHistory?.realized_pnl ?? 0;
    const perp0RealizedPnl = totalMargin > 0 ? realizedPnl * (perp0Margin / totalMargin) : 0;
    const perp1RealizedPnl = totalMargin > 0 ? realizedPnl * (perp1Margin / totalMargin) : 0;

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
      perpSubtotal: perp0Pnl + perp0RealizedPnl,
      totalPnl: (lp.token0.value_usd - initial0Value) + claimed0 + unclaimed0 + perp0Pnl + perp0RealizedPnl,
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
      perpSubtotal: perp1Pnl + perp1RealizedPnl,
      totalPnl: (lp.token1.value_usd - initial1Value) + claimed1 + unclaimed1 + perp1Pnl + perp1RealizedPnl,
    };

    const totalLpPnl = token0.lpPnl + token1.lpPnl;
    const totalPerpValue = perp0Value + perp1Value;
    const totalNetValue = totalCurrentValue + totalPerpValue;
    const totalPerpSubtotal = token0.perpSubtotal + token1.perpSubtotal;
    const gasFees = lp.gas_fees_usd ?? 0;
    const grandTotal = totalLpPnl + token0.feesSubtotal + token1.feesSubtotal + totalPerpSubtotal;
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

  const matchedPerpIndices = new Set(matchedPositions.flatMap((m) => m.perpPositions.map((p) => p.position_index)));
  const unmatchedPerps = perpPositions.filter((p) => !matchedPerpIndices.has(p.position_index));


  return (
    <div className="space-y-6">
      {matchedPositions.map((matched, index) => {
        const { lpPosition, token0, token1 } = matched;
        const isExpanded = expandedPositions.has(index);
        const status = getStatusBadge(matched.hedgeRatio);

        return (
          <div key={index} className="bg-[#0D1117] rounded-lg border border-[#30363d] overflow-hidden">
            {/* Header */}
            <div
              className="px-5 py-4 cursor-pointer hover:bg-[#161B22] transition-colors border-b border-[#30363d]"
              onClick={() => toggleExpanded(index)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[#8B949E]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#8B949E]" />
                  )}
                  <div>
                    <h3 className="text-base font-semibold text-[#E6EDF3]">{lpPosition.pool_name}</h3>
                    <p className="text-xs text-[#8B949E] mt-0.5">
                      Uniswap V3 · {lpPosition.chain.toUpperCase()} · {lpPosition.fee_tier ? `${lpPosition.fee_tier.toFixed(2)}%` : 'Unknown'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-xs text-[#8B949E] uppercase tracking-wide">Net Exposure</div>
                    <div className={`text-sm font-medium ${getColor(matched.totalNetValue)}`}>
                      {formatUsd(matched.totalNetValue)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[#8B949E] uppercase tracking-wide">Total P&L</div>
                    <div className={`text-sm font-medium ${getColor(matched.grandTotalPnl)}`}>
                      {formatUsd(matched.grandTotalPnl)}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded text-xs font-medium ${status.color}`}>
                    {status.text}
                  </span>
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="bg-[#161B22]">
                {/* POSITION ANALYSIS */}
                <div className="p-5">
                  <h4 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider mb-4">Position Analysis</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#30363d]">
                        <th className="pb-3 text-left text-xs font-medium text-[#8B949E] uppercase tracking-wide w-32"></th>
                        <th className="pb-3 text-right text-xs font-medium text-[#8B949E] uppercase tracking-wide">{token0.symbol}</th>
                        <th className="pb-3 text-right text-xs font-medium text-[#8B949E] uppercase tracking-wide">{token1.symbol}</th>
                        <th className="pb-3 text-right text-xs font-medium text-[#8B949E] uppercase tracking-wide">Total</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#E6EDF3]">
                      <tr className="border-b border-[#21262d]">
                        <td className="py-3 text-[#8B949E]">Initial LP</td>
                        <td className="py-3 text-right">
                          <div>{formatUsd(token0.initialLpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token0.initialLpAmount)} ({token0.initialLpPercent.toFixed(0)}%)</div>
                        </td>
                        <td className="py-3 text-right">
                          <div>{formatUsd(token1.initialLpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token1.initialLpAmount)} ({token1.initialLpPercent.toFixed(0)}%)</div>
                        </td>
                        <td className="py-3 text-right">{formatUsd(matched.totalInitialLpValue)}</td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-3 text-[#8B949E]">Current LP</td>
                        <td className="py-3 text-right">
                          <div>{formatUsd(token0.currentLpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token0.currentLpAmount)} ({token0.currentLpPercent.toFixed(0)}%)</div>
                        </td>
                        <td className="py-3 text-right">
                          <div>{formatUsd(token1.currentLpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token1.currentLpAmount)} ({token1.currentLpPercent.toFixed(0)}%)</div>
                        </td>
                        <td className="py-3 text-right">{formatUsd(matched.totalCurrentLpValue)}</td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-3 text-[#8B949E]">Position Drift</td>
                        <td className="py-3 text-right">
                          <span className={getColor(token0.positionDrift)}>{token0.positionDrift > 0 ? "+" : ""}{token0.positionDrift.toFixed(1)}%</span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={getColor(token1.positionDrift)}>{token1.positionDrift > 0 ? "+" : ""}{token1.positionDrift.toFixed(1)}%</span>
                        </td>
                        <td className="py-3 text-right text-[#8B949E]">—</td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-3 text-[#8B949E]">Perp Hedge</td>
                        <td className="py-3 text-right">
                          <div>{formatUsd(token0.perpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token0.perpAmount)}</div>
                        </td>
                        <td className="py-3 text-right">
                          <div>{formatUsd(token1.perpValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token1.perpAmount)}</div>
                        </td>
                        <td className="py-3 text-right">{formatUsd(matched.totalPerpValue)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 font-medium">Net Exposure</td>
                        <td className="py-3 text-right">
                          <div className={`font-medium ${getColor(token0.netValue)}`}>{formatUsd(token0.netValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token0.netAmount)}</div>
                        </td>
                        <td className="py-3 text-right">
                          <div className={`font-medium ${getColor(token1.netValue)}`}>{formatUsd(token1.netValue)}</div>
                          <div className="text-xs text-[#8B949E]">{formatAmount(token1.netAmount)}</div>
                        </td>
                        <td className="py-3 text-right">
                          <span className={`font-medium ${getColor(matched.totalNetValue)}`}>{formatUsd(matched.totalNetValue)}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* PERFORMANCE ANALYSIS */}
                <div className="p-5 border-t border-[#30363d]">
                  <h4 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider mb-4">Performance Analysis</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#30363d]">
                        <th className="pb-3 text-left text-xs font-medium text-[#8B949E] uppercase tracking-wide w-32"></th>
                        <th className="pb-3 text-right text-xs font-medium text-[#8B949E] uppercase tracking-wide">{token0.symbol}</th>
                        <th className="pb-3 text-right text-xs font-medium text-[#8B949E] uppercase tracking-wide">{token1.symbol}</th>
                        <th className="pb-3 text-right text-xs font-medium text-[#8B949E] uppercase tracking-wide">Total</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#E6EDF3]">
                      {/* LP POSITION */}
                      <tr className="border-b border-[#30363d]">
                        <td colSpan={4} className="py-2 text-xs font-semibold text-[#58A6FF] uppercase tracking-wide">LP Position</td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-2.5 text-[#8B949E] pl-3">Initial Value</td>
                        <td className="py-2.5 text-right">{formatUsd(token0.initialLpValue)}</td>
                        <td className="py-2.5 text-right">{formatUsd(token1.initialLpValue)}</td>
                        <td className="py-2.5 text-right">{formatUsd(matched.totalInitialLpValue)}</td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-2.5 text-[#8B949E] pl-3">Current Value</td>
                        <td className="py-2.5 text-right">{formatUsd(token0.currentLpValue)}</td>
                        <td className="py-2.5 text-right">{formatUsd(token1.currentLpValue)}</td>
                        <td className="py-2.5 text-right">{formatUsd(matched.totalCurrentLpValue)}</td>
                      </tr>
                      <tr className="border-b border-[#30363d]">
                        <td className="py-2.5 pl-3 font-medium">Subtotal</td>
                        <td className="py-2.5 text-right"><span className={getColor(token0.lpPnl)}>{formatUsd(token0.lpPnl)}</span></td>
                        <td className="py-2.5 text-right"><span className={getColor(token1.lpPnl)}>{formatUsd(token1.lpPnl)}</span></td>
                        <td className="py-2.5 text-right"><span className={`font-medium ${getColor(matched.totalLpPnl)}`}>{formatUsd(matched.totalLpPnl)}</span></td>
                      </tr>

                      {/* LP FEES */}
                      <tr className="border-b border-[#30363d]">
                        <td colSpan={4} className="py-2 text-xs font-semibold text-[#58A6FF] uppercase tracking-wide">LP Fees</td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-2.5 text-[#8B949E] pl-3">Claimed</td>
                        <td className="py-2.5 text-right">{formatUsd(token0.claimedFees)}</td>
                        <td className="py-2.5 text-right">{formatUsd(token1.claimedFees)}</td>
                        <td className="py-2.5 text-right">{formatUsd(matched.totalClaimedFees)}</td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-2.5 text-[#8B949E] pl-3">Unclaimed</td>
                        <td className="py-2.5 text-right">{formatUsd(token0.unclaimedFees)}</td>
                        <td className="py-2.5 text-right">{formatUsd(token1.unclaimedFees)}</td>
                        <td className="py-2.5 text-right">{formatUsd(matched.totalUnclaimedFees)}</td>
                      </tr>
                      <tr className="border-b border-[#30363d]">
                        <td className="py-2.5 pl-3 font-medium">Subtotal</td>
                        <td className="py-2.5 text-right"><span className={getColor(token0.feesSubtotal)}>{formatUsd(token0.feesSubtotal)}</span></td>
                        <td className="py-2.5 text-right"><span className={getColor(token1.feesSubtotal)}>{formatUsd(token1.feesSubtotal)}</span></td>
                        <td className="py-2.5 text-right"><span className={`font-medium ${getColor(matched.totalFeesSubtotal)}`}>{formatUsd(matched.totalFeesSubtotal)}</span></td>
                      </tr>

                      {/* PERP HEDGE */}
                      <tr className="border-b border-[#30363d]">
                        <td colSpan={4} className="py-2 text-xs font-semibold text-[#58A6FF] uppercase tracking-wide">Perp Hedge</td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-2.5 text-[#8B949E] pl-3">Unrealized P&L</td>
                        <td className="py-2.5 text-right"><span className={getColor(token0.perpUnrealizedPnl)}>{formatUsd(token0.perpUnrealizedPnl)}</span></td>
                        <td className="py-2.5 text-right"><span className={getColor(token1.perpUnrealizedPnl)}>{formatUsd(token1.perpUnrealizedPnl)}</span></td>
                        <td className="py-2.5 text-right"><span className={getColor(matched.totalPerpUnrealizedPnl)}>{formatUsd(matched.totalPerpUnrealizedPnl)}</span></td>
                      </tr>
                      <tr className="border-b border-[#21262d]">
                        <td className="py-2.5 text-[#8B949E] pl-3">Realized P&L</td>
                        <td className="py-2.5 text-right"><span className={getColor(token0.perpRealizedPnl)}>{formatUsd(token0.perpRealizedPnl)}</span></td>
                        <td className="py-2.5 text-right"><span className={getColor(token1.perpRealizedPnl)}>{formatUsd(token1.perpRealizedPnl)}</span></td>
                        <td className="py-2.5 text-right"><span className={getColor(matched.totalPerpRealizedPnl)}>{formatUsd(matched.totalPerpRealizedPnl)}</span></td>
                      </tr>
                      <tr className="border-b border-[#30363d]">
                        <td className="py-2.5 pl-3 font-medium">Subtotal</td>
                        <td className="py-2.5 text-right"><span className={getColor(token0.perpSubtotal)}>{formatUsd(token0.perpSubtotal)}</span></td>
                        <td className="py-2.5 text-right"><span className={getColor(token1.perpSubtotal)}>{formatUsd(token1.perpSubtotal)}</span></td>
                        <td className="py-2.5 text-right"><span className={`font-medium ${getColor(matched.totalPerpSubtotal)}`}>{formatUsd(matched.totalPerpSubtotal)}</span></td>
                      </tr>

                      {/* COSTS */}
                      <tr className="border-b border-[#30363d]">
                        <td colSpan={4} className="py-2 text-xs font-semibold text-[#58A6FF] uppercase tracking-wide">Costs</td>
                      </tr>
                      <tr className="border-b border-[#30363d]">
                        <td className="py-2.5 text-[#8B949E] pl-3">Gas Fees</td>
                        <td className="py-2.5 text-right text-[#8B949E]">—</td>
                        <td className="py-2.5 text-right text-[#8B949E]">—</td>
                        <td className="py-2.5 text-right text-[#8B949E]">$0.00</td>
                      </tr>

                      {/* TOTAL P&L */}
                      <tr>
                        <td className="py-4 font-semibold text-[#E6EDF3]">Total P&L</td>
                        <td className="py-4 text-right"><span className={`font-semibold ${getColor(token0.totalPnl)}`}>{formatUsd(token0.totalPnl)}</span></td>
                        <td className="py-4 text-right"><span className={`font-semibold ${getColor(token1.totalPnl)}`}>{formatUsd(token1.totalPnl)}</span></td>
                        <td className="py-4 text-right"><span className={`text-lg font-bold ${getColor(matched.grandTotalPnl)}`}>{formatUsd(matched.grandTotalPnl)}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Unmatched Perps */}
      {unmatchedPerps.length > 0 && (
        <div className="bg-[#0D1117] rounded-lg border border-[#30363d] p-5">
          <h4 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider mb-4">Unmatched Perpetual Positions</h4>
          <div className="space-y-3">
            {unmatchedPerps.map((perp, idx) => (
              <div key={idx} className="flex justify-between items-center py-2 border-b border-[#21262d] last:border-0">
                <div>
                  <span className="text-[#E6EDF3] font-medium">{perp.position_name}</span>
                  <span className="text-xs text-[#8B949E] ml-2">{perp.protocol}</span>
                </div>
                <div className="text-right">
                  <div className="text-[#E6EDF3]">{formatUsd(perp.position_value_usd)}</div>
                  <div className={`text-xs ${getColor(perp.pnl_usd)}`}>{formatUsd(perp.pnl_usd)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lpPositions.length === 0 && (
        <div className="text-center py-12 text-[#8B949E]">
          <p>No LP positions found</p>
        </div>
      )}
    </div>
  );
}
