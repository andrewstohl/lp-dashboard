"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, MoreHorizontal, EyeOff, Plus } from "lucide-react";

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
  _hidden?: boolean;
}

interface Position {
  id: string;
  displayName?: string;
  name: string;
}

interface TransactionsColumnProps {
  transactions: Transaction[];
  tokenDict: Record<string, TokenInfo>;
  projectDict: Record<string, { name: string; logo_url?: string }>;
  chainNames: Record<string, string>;
  positions?: Position[];
  hiddenTxIds?: Set<string>;
  showHidden?: boolean;
  isLoading?: boolean;
  onHideTransaction?: (txId: string) => void;
  onUnhideTransaction?: (txId: string) => void;
  onAddToPosition?: (txId: string, positionId: string) => void;
  onToggleShowHidden?: () => void;
}

export function TransactionsColumn({
  transactions,
  tokenDict,
  projectDict,
  chainNames,
  positions = [],
  hiddenTxIds = new Set(),
  showHidden = false,
  isLoading = false,
  onHideTransaction,
  onUnhideTransaction,
  onAddToPosition,
  onToggleShowHidden,
}: TransactionsColumnProps) {
  const [expandedTxs, setExpandedTxs] = useState<Set<string>>(new Set());
  const [menuOpenTx, setMenuOpenTx] = useState<string | null>(null);
  const [addToPositionTx, setAddToPositionTx] = useState<string | null>(null);

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

  // Filter transactions based on hidden state
  const visibleTransactions = showHidden 
    ? transactions 
    : transactions.filter(tx => !hiddenTxIds.has(tx.id));
  
  const hiddenCount = transactions.filter(tx => hiddenTxIds.has(tx.id)).length;

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

  const groupedTxs = groupByDate(visibleTransactions);

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
              {visibleTransactions.length} transaction{visibleTransactions.length !== 1 ? "s" : ""}
              {hiddenCount > 0 && !showHidden && ` (${hiddenCount} hidden)`}
            </p>
          </div>
          {hiddenCount > 0 && onToggleShowHidden && (
            <button
              onClick={onToggleShowHidden}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                showHidden 
                  ? "bg-[#F0883E] text-white" 
                  : "bg-[#21262D] text-[#8B949E] hover:bg-[#30363D]"
              }`}
            >
              {showHidden ? "Hide Hidden" : "Show Hidden"}
            </button>
          )}
        </div>
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto">
        {visibleTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8B949E] p-4">
            <p className="text-center">
              {hiddenCount > 0 
                ? `All transactions are hidden (${hiddenCount})`
                : "All transactions are linked to positions!"}
            </p>
            <p className="text-xs mt-1 text-center">
              {hiddenCount > 0 
                ? "Click 'Show Hidden' to see them"
                : "Check the Positions column to see your portfolio"}
            </p>
          </div>
        ) : (
          Object.entries(groupedTxs).map(([date, txs]) => (
            <div key={date}>
              {/* Date Header */}
              <div className="px-4 py-2 bg-[#0D1117] text-xs font-medium text-[#8B949E] sticky top-0 z-10">
                {date}
              </div>
              {/* Transactions for this date */}
              {txs.map((tx) => {
                const isExpanded = expandedTxs.has(tx.id);
                const isHidden = hiddenTxIds.has(tx.id);
                const isMenuOpen = menuOpenTx === tx.id;
                const isAddingToPosition = addToPositionTx === tx.id;
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
                    className={`border-b border-[#21262D] last:border-b-0 ${isHidden ? "opacity-50" : ""}`}
                  >
                    {/* Main Row */}
                    <div className="px-4 py-3 hover:bg-[#21262D] transition-colors">
                      <div className="flex items-start justify-between">
                        <div 
                          className="flex items-start gap-2 flex-1 cursor-pointer"
                          onClick={() => toggleExpand(tx.id)}
                        >
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
                              {isHidden && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-[#F0883E] text-white">
                                  Hidden
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#8B949E] mt-0.5">
                              {getProjectName(tx.project_id || "")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
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
                          {/* Action Menu Button */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenTx(isMenuOpen ? null : tx.id);
                                setAddToPositionTx(null);
                              }}
                              className="p-1 hover:bg-[#30363D] rounded transition-colors"
                            >
                              <MoreHorizontal className="w-4 h-4 text-[#8B949E]" />
                            </button>
                            
                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                              <div className="absolute right-0 top-6 z-20 bg-[#161B22] border border-[#30363D] rounded-lg shadow-lg min-w-[160px]">
                                {tx.tx?.hash && (
                                  <a
                                    href={getExplorerUrl(tx.chain, tx.tx.hash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#E6EDF3] hover:bg-[#21262D]"
                                    onClick={() => setMenuOpenTx(null)}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    View on Explorer
                                  </a>
                                )}
                                {onAddToPosition && positions.length > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAddToPositionTx(tx.id);
                                      setMenuOpenTx(null);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#E6EDF3] hover:bg-[#21262D] w-full text-left"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Add to Position
                                  </button>
                                )}
                                {isHidden ? (
                                  onUnhideTransaction && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUnhideTransaction(tx.id);
                                        setMenuOpenTx(null);
                                      }}
                                      className="flex items-center gap-2 px-3 py-2 text-sm text-[#3FB950] hover:bg-[#21262D] w-full text-left"
                                    >
                                      <EyeOff className="w-4 h-4" />
                                      Unhide
                                    </button>
                                  )
                                ) : (
                                  onHideTransaction && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onHideTransaction(tx.id);
                                        setMenuOpenTx(null);
                                      }}
                                      className="flex items-center gap-2 px-3 py-2 text-sm text-[#F0883E] hover:bg-[#21262D] w-full text-left"
                                    >
                                      <EyeOff className="w-4 h-4" />
                                      Hide
                                    </button>
                                  )
                                )}
                              </div>
                            )}
                            
                            {/* Add to Position Dropdown */}
                            {isAddingToPosition && (
                              <div className="absolute right-0 top-6 z-20 bg-[#161B22] border border-[#30363D] rounded-lg shadow-lg min-w-[200px] max-h-[300px] overflow-y-auto">
                                <div className="px-3 py-2 text-xs font-medium text-[#8B949E] border-b border-[#30363D]">
                                  Select Position
                                </div>
                                {positions.map((pos) => (
                                  <button
                                    key={pos.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAddToPosition?.(tx.id, pos.id);
                                      setAddToPositionTx(null);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#E6EDF3] hover:bg-[#21262D] w-full text-left"
                                  >
                                    {pos.displayName || pos.name}
                                  </button>
                                ))}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAddToPositionTx(null);
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-[#8B949E] hover:bg-[#21262D] w-full text-left border-t border-[#30363D]"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
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

                          {/* Explorer Link in expanded view */}
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
      
      {/* Click outside to close menus */}
      {(menuOpenTx || addToPositionTx) && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => {
            setMenuOpenTx(null);
            setAddToPositionTx(null);
          }}
        />
      )}
    </div>
  );
}
