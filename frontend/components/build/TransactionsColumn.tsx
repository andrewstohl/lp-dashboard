"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

interface TokenInfo {
  symbol?: string;
  optimized_symbol?: string;
  name?: string;
  price?: number;
  logo_url?: string;
}

interface Transaction {
  id: string;
  chain: string;
  time_at: number;
  project_id?: string;
  cate_id?: string;
  tx?: {
    name?: string;
    hash?: string;
  };
  sends?: Array<{
    token_id: string;
    amount: number;
  }>;
  receives?: Array<{
    token_id: string;
    amount: number;
  }>;
  _category?: string;
}

interface TransactionsColumnProps {
  transactions: Transaction[];
  tokenDict: Record<string, TokenInfo>;
  projectDict: Record<string, { name: string; logo_url?: string }>;
  chainNames: Record<string, string>;
  isLoading?: boolean;
}

export function TransactionsColumn({
  transactions,
  tokenDict,
  projectDict,
  chainNames,
  isLoading = false,
}: TransactionsColumnProps) {
  const [expandedTxs, setExpandedTxs] = useState<Set<string>>(new Set());

  const toggleExpand = (txId: string) => {
    setExpandedTxs((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTokenSymbol = (tokenId: string) => {
    const token = tokenDict[tokenId];
    return token?.symbol || token?.optimized_symbol || tokenId.slice(0, 8) + "...";
  };

  const getTokenValue = (tokenId: string, amount: number) => {
    const token = tokenDict[tokenId];
    const price = token?.price || 0;
    return amount * price;
  };

  const getProjectName = (projectId: string) => {
    const project = projectDict[projectId];
    return project?.name || projectId?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Unknown";
  };

  const getChainName = (chainId: string) => {
    return chainNames[chainId] || chainId.toUpperCase();
  };

  const getExplorerUrl = (chain: string, hash: string) => {
    const explorers: Record<string, string> = {
      eth: "https://etherscan.io/tx/",
      arb: "https://arbiscan.io/tx/",
      op: "https://optimistic.etherscan.io/tx/",
      base: "https://basescan.org/tx/",
      bsc: "https://bscscan.com/tx/",
      matic: "https://polygonscan.com/tx/",
    };
    return (explorers[chain] || "https://etherscan.io/tx/") + hash;
  };

  // Group transactions by date for better organization
  const groupByDate = (txs: Transaction[]) => {
    const groups: Record<string, Transaction[]> = {};
    txs.forEach((tx) => {
      const date = new Date(tx.time_at * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(tx);
    });
    return groups;
  };

  const groupedTxs = groupByDate(transactions);

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
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#30363D]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Unmatched Transactions</h2>
            <p className="text-sm text-[#8B949E]">
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} not linked to positions
            </p>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto">
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8B949E] p-4">
            <p className="text-center">All transactions are linked to positions!</p>
            <p className="text-xs mt-1 text-center">Check the Positions column to see your portfolio</p>
          </div>
        ) : (
          Object.entries(groupedTxs).map(([date, txs]) => (
            <div key={date}>
              {/* Date Header */}
              <div className="px-4 py-2 bg-[#0D1117] text-xs font-medium text-[#8B949E] sticky top-0">
                {date}
              </div>
              {/* Transactions for this date */}
              {txs.map((tx) => {
                const isExpanded = expandedTxs.has(tx.id);
                const totalSendValue = (tx.sends || []).reduce(
                  (sum, s) => sum + getTokenValue(s.token_id, s.amount),
                  0
                );
                const totalReceiveValue = (tx.receives || []).reduce(
                  (sum, r) => sum + getTokenValue(r.token_id, r.amount),
                  0
                );

                return (
                  <div
                    key={tx.id}
                    className="border-b border-[#21262D] last:border-b-0"
                  >
                    {/* Main Row */}
                    <div
                      onClick={() => toggleExpand(tx.id)}
                      className="px-4 py-3 hover:bg-[#21262D] cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-[#8B949E] mt-0.5 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[#8B949E] mt-0.5 flex-shrink-0" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[#E6EDF3]">
                                {tx.tx?.name || tx.cate_id || "Transaction"}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-[#30363D] text-[#8B949E]">
                                {getChainName(tx.chain)}
                              </span>
                            </div>
                            <div className="text-xs text-[#8B949E] mt-0.5">
                              {getProjectName(tx.project_id || "")}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-[#8B949E]">
                            {formatDate(tx.time_at).split(",")[1]?.trim()}
                          </div>
                          {(totalSendValue > 0 || totalReceiveValue > 0) && (
                            <div className="text-xs mt-0.5">
                              {totalReceiveValue > 0 && (
                                <span className="text-[#3FB950]">
                                  +${totalReceiveValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                              )}
                              {totalSendValue > 0 && totalReceiveValue > 0 && " / "}
                              {totalSendValue > 0 && (
                                <span className="text-[#F85149]">
                                  -${totalSendValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-3 bg-[#0D1117]">
                        <div className="pl-6 space-y-2">
                          {/* Sends */}
                          {tx.sends && tx.sends.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-[#F85149] mb-1">Sent</div>
                              {tx.sends.map((s, i) => (
                                <div key={i} className="flex justify-between text-xs text-[#8B949E]">
                                  <span>{Number(s.amount).toFixed(6)} {getTokenSymbol(s.token_id)}</span>
                                  <span className="text-[#F85149]">
                                    ${getTokenValue(s.token_id, s.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Receives */}
                          {tx.receives && tx.receives.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-[#3FB950] mb-1">Received</div>
                              {tx.receives.map((r, i) => (
                                <div key={i} className="flex justify-between text-xs text-[#8B949E]">
                                  <span>{Number(r.amount).toFixed(6)} {getTokenSymbol(r.token_id)}</span>
                                  <span className="text-[#3FB950]">
                                    ${getTokenValue(r.token_id, r.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Explorer Link */}
                          {tx.tx?.hash && (
                            <a
                              href={getExplorerUrl(tx.chain, tx.tx.hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[#58A6FF] hover:underline mt-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View on Explorer
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
