"use client";

import { useState } from "react";
import { 
  ChevronDown, ChevronRight, ExternalLink, 
  TrendingUp, TrendingDown, Minus, 
  GripVertical, Circle
} from "lucide-react";

interface TokenInfo {
  symbol?: string;
  optimized_symbol?: string;
  price?: number;
}

interface Transaction {
  id: string;
  chain: string;
  time_at: number;
  tx?: { name?: string; hash?: string };
  sends?: Array<{ token_id: string; amount: number }>;
  receives?: Array<{ token_id: string; amount: number }>;
  _flowDirection?: "INCREASE" | "DECREASE" | "OVERHEAD";
  _netValue?: number;
  _totalIn?: number;
  _totalOut?: number;
}

interface TransactionGroup {
  groupKey: string;
  chain: string;
  protocol: string;
  protocolName: string;
  positionType: string;
  tokens: string[];
  tokensDisplay: string;
  transactions: Transaction[];
  transactionCount: number;
  totalIn: number;
  totalOut: number;
  netValue: number;
  latestActivity: number;
  isOpen?: boolean;
}

interface TransactionsColumnProps {
  groups: TransactionGroup[];
  tokenDict: Record<string, TokenInfo>;
  chainNames: Record<string, string>;
  isLoading?: boolean;
  onDragStart?: (txId: string, groupKey: string) => void;
}

const CHAIN_NAMES: Record<string, string> = {
  eth: "Ethereum", arb: "Arbitrum", op: "Optimism",
  base: "Base", bsc: "BNB Chain", matic: "Polygon",
};

const EXPLORER_URLS: Record<string, string> = {
  eth: "https://etherscan.io/tx/",
  arb: "https://arbiscan.io/tx/",
  op: "https://optimistic.etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  bsc: "https://bscscan.com/tx/",
  matic: "https://polygonscan.com/tx/",
};

export function TransactionsColumn({
  groups,
  tokenDict,
  chainNames = CHAIN_NAMES,
  isLoading = false,
  onDragStart,
}: TransactionsColumnProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const formatDate = (ts: number) => 
    new Date(ts * 1000).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });

  const getFlowIcon = (direction?: string) => {
    if (direction === "INCREASE") return <TrendingDown className="w-3 h-3 text-[#F85149]" />;
    if (direction === "DECREASE") return <TrendingUp className="w-3 h-3 text-[#3FB950]" />;
    return <Minus className="w-3 h-3 text-[#8B949E]" />;
  };

  const getFlowColor = (direction?: string) => {
    if (direction === "INCREASE") return "text-[#F85149]";
    if (direction === "DECREASE") return "text-[#3FB950]";
    return "text-[#8B949E]";
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "lp": return "bg-[#238636]";
      case "perpetual": return "bg-[#A371F7]";
      case "yield": return "bg-[#58A6FF]";
      default: return "bg-[#30363D]";
    }
  };

  const totalTxs = groups.reduce((sum, g) => sum + g.transactionCount, 0);

  if (isLoading) {
    return (
      <div className="bg-[#161B22] rounded-xl border border-[#30363D] flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[#30363D]">
          <h2 className="text-lg font-semibold text-[#E6EDF3]">Transactions</h2>
          <p className="text-sm text-[#8B949E]">Loading...</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-[#8B949E]">Fetching transactions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#161B22] rounded-xl border border-[#30363D] flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[#30363D]">
        <h2 className="text-lg font-semibold text-[#E6EDF3]">Transactions</h2>
        <p className="text-sm text-[#8B949E]">
          {groups.length} groups · {totalTxs} transactions
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8B949E] p-4">
            <p>No transactions found</p>
          </div>
        ) : (
          groups.map((group) => {
            const isExpanded = expandedGroups.has(group.groupKey);
            
            return (
              <div key={group.groupKey} className="border-b border-[#21262D]">
                {/* Group Header */}
                <div
                  onClick={() => toggleGroup(group.groupKey)}
                  className="px-4 py-3 hover:bg-[#21262D] cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#8B949E] mt-0.5" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#8B949E] mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#E6EDF3]">
                            {group.protocolName}
                          </span>
                          <span className="text-xs text-[#8B949E]">
                            {group.tokensDisplay}
                          </span>
                          {group.isOpen && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[#238636] text-white">
                              open
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[#30363D] text-[#8B949E]">
                            {chainNames[group.chain] || group.chain.toUpperCase()}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded text-white ${getTypeColor(group.positionType)}`}>
                            {group.positionType}
                          </span>
                          <span className="text-xs text-[#8B949E]">
                            {group.transactionCount} txs
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${group.netValue >= 0 ? "text-[#3FB950]" : "text-[#F85149]"}`}>
                        {group.netValue >= 0 ? "+" : ""}${Math.abs(group.netValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-xs text-[#8B949E]">
                        {formatDate(group.latestActivity).split(",")[0]}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Transactions */}
                {isExpanded && (
                  <div className="bg-[#0D1117] border-t border-[#21262D]">
                    {group.transactions.map((tx) => (
                      <div
                        key={tx.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("transactionId", tx.id);
                          e.dataTransfer.setData("groupKey", group.groupKey);
                          onDragStart?.(tx.id, group.groupKey);
                        }}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-[#161B22] border-b border-[#21262D] last:border-b-0 cursor-grab"
                      >
                        <GripVertical className="w-3 h-3 text-[#30363D]" />
                        {getFlowIcon(tx._flowDirection)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[#E6EDF3] truncate">
                              {tx.tx?.name || "Transaction"}
                            </span>
                            <span className="text-xs text-[#8B949E]">
                              {formatDate(tx.time_at)}
                            </span>
                          </div>
                        </div>
                        <div className={`text-xs font-medium ${getFlowColor(tx._flowDirection)}`}>
                          {tx._flowDirection === "DECREASE" && "+"}
                          {tx._flowDirection === "INCREASE" && "-"}
                          ${Math.abs(tx._netValue || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        {tx.tx?.hash && (
                          <a
                            href={`${EXPLORER_URLS[tx.chain] || EXPLORER_URLS.eth}${tx.tx.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#58A6FF] hover:text-[#79C0FF]"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
