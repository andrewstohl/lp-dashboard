"use client";

import { type Transaction, type TokenMeta } from "@/lib/api";
import { getTxKey } from "@/lib/reconciliation/storage";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from "lucide-react";

interface ReconcileSummaryProps {
  transactions: Transaction[];
  tokenDict: Record<string, TokenMeta>;
  chainNames: Record<string, string>;
  hiddenTxKeys: Set<string>;
  // Future: reconciledTxKeys for tracking reconciliation status
}

// Chain colors for visual consistency
const CHAIN_COLORS: Record<string, string> = {
  eth: "#627EEA",
  arb: "#28A0F0",
  op: "#FF0420",
  base: "#0052FF",
  matic: "#8247E5",
  bsc: "#F0B90B",
  avax: "#E84142",
  ftm: "#1969FF",
};

export function ReconcileSummary({
  transactions,
  tokenDict,
  chainNames,
  hiddenTxKeys,
}: ReconcileSummaryProps) {
  
  // Filter out hidden transactions for calculations
  const visibleTransactions = transactions.filter(
    tx => !hiddenTxKeys.has(getTxKey(tx.chain, tx.id))
  );

  // Calculate total value in and out
  const calculateTotals = () => {
    let totalIn = 0;
    let totalOut = 0;
    
    for (const tx of visibleTransactions) {
      for (const recv of tx.receives) {
        const token = tokenDict[recv.token_id];
        if (token?.price) {
          totalIn += recv.amount * token.price;
        }
      }
      
      for (const send of tx.sends) {
        const token = tokenDict[send.token_id];
        if (token?.price) {
          totalOut += send.amount * token.price;
        }
      }
    }
    
    return { totalIn, totalOut, netFlow: totalIn - totalOut };
  };

  // Calculate by chain
  const calculateByChain = () => {
    const byChain: Record<string, { count: number; valueIn: number; valueOut: number }> = {};
    
    for (const tx of visibleTransactions) {
      if (!byChain[tx.chain]) {
        byChain[tx.chain] = { count: 0, valueIn: 0, valueOut: 0 };
      }
      
      byChain[tx.chain].count++;
      
      for (const recv of tx.receives) {
        const token = tokenDict[recv.token_id];
        if (token?.price) {
          byChain[tx.chain].valueIn += recv.amount * token.price;
        }
      }
      
      for (const send of tx.sends) {
        const token = tokenDict[send.token_id];
        if (token?.price) {
          byChain[tx.chain].valueOut += send.amount * token.price;
        }
      }
    }
    
    return byChain;
  };

  // Count unreconciled (for now, all visible are unreconciled)
  // Future: check against reconciledTxKeys
  const unreconciledCount = visibleTransactions.length;
  const reconciledCount = 0; // Placeholder for future
  
  const { totalIn, totalOut, netFlow } = calculateTotals();
  const byChain = calculateByChain();
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="space-y-4">
      {/* Main stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total In */}
        <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-[#3FB950]" />
            <p className="text-[#8B949E] text-sm">Total Received</p>
          </div>
          <p className="text-xl font-bold text-[#3FB950]">
            {formatCurrency(totalIn)}
          </p>
        </div>
        
        {/* Total Out */}
        <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-[#F85149]" />
            <p className="text-[#8B949E] text-sm">Total Sent</p>
          </div>
          <p className="text-xl font-bold text-[#F85149]">
            {formatCurrency(totalOut)}
          </p>
        </div>
        
        {/* Net Flow */}
        <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-4">
          <div className="flex items-center gap-2 mb-1">
            {netFlow >= 0 ? (
              <TrendingUp className="w-4 h-4 text-[#3FB950]" />
            ) : (
              <TrendingDown className="w-4 h-4 text-[#F85149]" />
            )}
            <p className="text-[#8B949E] text-sm">Net Flow</p>
          </div>
          <p className={`text-xl font-bold ${netFlow >= 0 ? 'text-[#3FB950]' : 'text-[#F85149]'}`}>
            {netFlow >= 0 ? '+' : ''}{formatCurrency(netFlow)}
          </p>
        </div>
        
        {/* Reconciliation Status */}
        <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-4">
          <div className="flex items-center gap-2 mb-1">
            {unreconciledCount > 0 ? (
              <AlertCircle className="w-4 h-4 text-[#D29922]" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#3FB950]" />
            )}
            <p className="text-[#8B949E] text-sm">Reconciliation</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-[#D29922]">
              {unreconciledCount}
            </p>
            <p className="text-sm text-[#8B949E]">
              unreconciled
            </p>
          </div>
          {reconciledCount > 0 && (
            <p className="text-xs text-[#3FB950] mt-1">
              {reconciledCount} reconciled
            </p>
          )}
        </div>
      </div>

      {/* By Chain breakdown */}
      {Object.keys(byChain).length > 0 && (
        <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-4">
          <p className="text-[#8B949E] text-sm mb-3">Value by Chain</p>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(byChain)
              .sort((a, b) => (b[1].valueIn + b[1].valueOut) - (a[1].valueIn + a[1].valueOut))
              .map(([chain, data]) => {
                const chainColor = CHAIN_COLORS[chain] || "#8B949E";
                const chainNet = data.valueIn - data.valueOut;
                
                return (
                  <div 
                    key={chain} 
                    className="bg-[#21262D] rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: chainColor }}
                      />
                      <span className="text-[#E6EDF3] text-sm font-medium">
                        {chainNames[chain] || chain}
                      </span>
                      <span className="text-[#8B949E] text-xs ml-auto">
                        {data.count} txns
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">In:</span>
                        <span className="text-[#3FB950]">{formatCurrency(data.valueIn)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Out:</span>
                        <span className="text-[#F85149]">{formatCurrency(data.valueOut)}</span>
                      </div>
                      <div className="flex justify-between border-t border-[#30363D] pt-1 mt-1">
                        <span className="text-[#8B949E]">Net:</span>
                        <span className={chainNet >= 0 ? 'text-[#3FB950]' : 'text-[#F85149]'}>
                          {chainNet >= 0 ? '+' : ''}{formatCurrency(chainNet)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
