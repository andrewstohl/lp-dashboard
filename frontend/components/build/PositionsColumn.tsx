"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Circle, MoreHorizontal, X, Edit2, ExternalLink, Plus } from "lucide-react";

interface TokenInfo {
  symbol?: string;
  optimized_symbol?: string;
  name?: string;
  price?: number;
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
  sends?: Array<{ token_id: string; amount: number }>;
  receives?: Array<{ token_id: string; amount: number }>;
  _category?: string;
  _totalIn?: number;
  _totalOut?: number;
}

interface PositionToken {
  symbol: string;
  address: string;
  amount: number;
  price: number;
  valueUsd: number;
}

interface Position {
  id: string;
  protocol: string;
  protocolName: string;
  chain: string;
  type: string;
  name: string;
  displayName?: string;
  positionIndex?: string;
  valueUsd: number;
  status: "open" | "closed";
  transactionCount: number;
  transactions?: Transaction[];
  side?: string;
  leverage?: number;
  pnlUsd?: number;
  tokens?: PositionToken[];
  totalRewardsUsd?: number;
  openedAt?: number;
  closedAt?: number;
}

interface PositionsColumnProps {
  positions: Position[];
  tokenDict: Record<string, TokenInfo>;
  chainNames: Record<string, string>;
  filter?: "all" | "open" | "closed";
  onFilterChange?: (filter: "all" | "open" | "closed") => void;
  onRemoveTransaction?: (positionId: string, txId: string) => void;
  onRenamePosition?: (positionId: string, newName: string) => void;
  onCreatePosition?: () => void;
  onDropTransaction?: (positionId: string, transactionId: string) => void;
  isLoading?: boolean;
}

export function PositionsColumn({
  positions,
  tokenDict,
  chainNames,
  filter = "all",
  onFilterChange,
  onRemoveTransaction,
  onRenamePosition,
  onCreatePosition,
  onDropTransaction,
  isLoading = false,
}: PositionsColumnProps) {
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOverPosition, setDragOverPosition] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, positionId: string) => {
    e.preventDefault();
    setDragOverPosition(positionId);
  };

  const handleDragLeave = () => {
    setDragOverPosition(null);
  };

  const handleDrop = (e: React.DragEvent, positionId: string) => {
    e.preventDefault();
    setDragOverPosition(null);
    const transactionId = e.dataTransfer.getData("transactionId");
    if (transactionId && onDropTransaction) {
      onDropTransaction(positionId, transactionId);
    }
  };

  const toggleExpand = (posId: string) => {
    setExpandedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(posId)) {
        next.delete(posId);
      } else {
        next.add(posId);
      }
      return next;
    });
  };

  const startEditing = (pos: Position) => {
    setEditingPosition(pos.id);
    setEditName(pos.displayName || pos.name);
  };

  const saveEdit = () => {
    if (editingPosition && editName.trim() && onRenamePosition) {
      onRenamePosition(editingPosition, editName.trim());
    }
    setEditingPosition(null);
    setEditName("");
  };

  const cancelEdit = () => {
    setEditingPosition(null);
    setEditName("");
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

  const getTypeIcon = (type: string, side?: string) => {
    if (type === "perpetual") {
      return side === "long" ? (
        <TrendingUp className="w-4 h-4 text-[#3FB950]" />
      ) : (
        <TrendingDown className="w-4 h-4 text-[#F85149]" />
      );
    }
    return <Circle className="w-4 h-4 text-[#58A6FF]" />;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "lp":
        return "bg-[#238636] text-white";
      case "perpetual":
        return "bg-[#A371F7] text-white";
      case "yield":
      case "lending":
        return "bg-[#58A6FF] text-white";
      default:
        return "bg-[#30363D] text-[#8B949E]";
    }
  };

  const filteredPositions = positions.filter((pos) => {
    if (filter === "all") return true;
    return pos.status === filter;
  });

  const openPositions = filteredPositions.filter((p) => p.status === "open");
  const closedPositions = filteredPositions.filter((p) => p.status === "closed");

  if (isLoading) {
    return (
      <div className="bg-[#161B22] rounded-xl border border-[#30363D] flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[#30363D]">
          <h2 className="text-lg font-semibold text-[#E6EDF3]">Positions</h2>
          <p className="text-sm text-[#8B949E]">Loading...</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-[#8B949E]">Fetching positions...</div>
        </div>
      </div>
    );
  }

  const totalValue = positions.reduce((sum, p) => sum + (p.valueUsd || 0), 0);

  return (
    <div className="bg-[#161B22] rounded-xl border border-[#30363D] flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#30363D]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Positions</h2>
            <p className="text-sm text-[#8B949E]">
              {positions.length} position{positions.length !== 1 ? "s" : ""} · ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          {onCreatePosition && (
            <button
              onClick={onCreatePosition}
              className="flex items-center gap-1 px-2 py-1 bg-[#238636] hover:bg-[#2EA043] text-white text-xs font-medium rounded transition-colors"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          )}
        </div>
        {onFilterChange && (
          <div className="flex gap-2 mt-2">
            {(["all", "open", "closed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  filter === f
                    ? "bg-[#58A6FF] text-white"
                    : "bg-[#21262D] text-[#8B949E] hover:bg-[#30363D]"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "open" && ` (${openPositions.length})`}
                {f === "closed" && ` (${closedPositions.length})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Position List */}
      <div className="flex-1 overflow-y-auto">
        {filteredPositions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8B949E] p-4">
            <p>No {filter !== "all" ? filter : ""} positions found</p>
          </div>
        ) : (
          <>
            {(filter === "all" || filter === "open") && openPositions.length > 0 && (
              <div>
                {filter === "all" && (
                  <div className="px-4 py-2 bg-[#0D1117] text-xs font-medium text-[#3FB950] sticky top-0 z-10">
                    Open Positions ({openPositions.length})
                  </div>
                )}
                {openPositions.map((pos) => (
                  <PositionCard
                    key={pos.id}
                    position={pos}
                    isExpanded={expandedPositions.has(pos.id)}
                    isEditing={editingPosition === pos.id}
                    editName={editName}
                    isDragOver={dragOverPosition === pos.id}
                    onDragOver={(e) => handleDragOver(e, pos.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, pos.id)}
                    onToggle={() => toggleExpand(pos.id)}
                    onStartEdit={() => startEditing(pos)}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onEditNameChange={setEditName}
                    onRemoveTransaction={onRemoveTransaction}
                    tokenDict={tokenDict}
                    formatDate={formatDate}
                    getTokenSymbol={getTokenSymbol}
                    getChainName={getChainName}
                    getExplorerUrl={getExplorerUrl}
                    getTypeIcon={getTypeIcon}
                    getTypeColor={getTypeColor}
                  />
                ))}
              </div>
            )}

            {(filter === "all" || filter === "closed") && closedPositions.length > 0 && (
              <div>
                {filter === "all" && (
                  <div className="px-4 py-2 bg-[#0D1117] text-xs font-medium text-[#8B949E] sticky top-0 z-10">
                    Closed Positions ({closedPositions.length})
                  </div>
                )}
                {closedPositions.map((pos) => (
                  <PositionCard
                    key={pos.id}
                    position={pos}
                    isExpanded={expandedPositions.has(pos.id)}
                    isEditing={editingPosition === pos.id}
                    editName={editName}
                    isDragOver={dragOverPosition === pos.id}
                    onDragOver={(e) => handleDragOver(e, pos.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, pos.id)}
                    onToggle={() => toggleExpand(pos.id)}
                    onStartEdit={() => startEditing(pos)}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onEditNameChange={setEditName}
                    onRemoveTransaction={onRemoveTransaction}
                    tokenDict={tokenDict}
                    formatDate={formatDate}
                    getTokenSymbol={getTokenSymbol}
                    getChainName={getChainName}
                    getExplorerUrl={getExplorerUrl}
                    getTypeIcon={getTypeIcon}
                    getTypeColor={getTypeColor}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PositionCard({
  position,
  isExpanded,
  isEditing,
  editName,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onToggle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditNameChange,
  onRemoveTransaction,
  tokenDict,
  formatDate,
  getTokenSymbol,
  getChainName,
  getExplorerUrl,
  getTypeIcon,
  getTypeColor,
}: {
  position: Position;
  isExpanded: boolean;
  isEditing: boolean;
  editName: string;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onToggle: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditNameChange: (name: string) => void;
  onRemoveTransaction?: (positionId: string, txId: string) => void;
  tokenDict: Record<string, TokenInfo>;
  formatDate: (ts: number) => string;
  getTokenSymbol: (id: string) => string;
  getChainName: (id: string) => string;
  getExplorerUrl: (chain: string, hash: string) => string;
  getTypeIcon: (type: string, side?: string) => React.ReactNode;
  getTypeColor: (type: string) => string;
}) {
  return (
    <div 
      className={`border-b border-[#21262D] last:border-b-0 transition-colors ${isDragOver ? 'bg-[#388bfd33] border-[#58A6FF]' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Main Row */}
      <div className="px-4 py-3 hover:bg-[#21262D] transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2 flex-1 cursor-pointer" onClick={onToggle}>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#8B949E] mt-0.5 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8B949E] mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              {isEditing ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => onEditNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSaveEdit();
                      if (e.key === "Escape") onCancelEdit();
                    }}
                    className="flex-1 px-2 py-1 bg-[#0D1117] border border-[#30363D] rounded text-sm text-[#E6EDF3] focus:outline-none focus:border-[#58A6FF]"
                    autoFocus
                  />
                  <button
                    onClick={onSaveEdit}
                    className="px-2 py-1 bg-[#238636] text-white text-xs rounded hover:bg-[#2EA043]"
                  >
                    Save
                  </button>
                  <button
                    onClick={onCancelEdit}
                    className="px-2 py-1 bg-[#21262D] text-[#8B949E] text-xs rounded hover:bg-[#30363D]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {getTypeIcon(position.type, position.side)}
                    <span className="text-sm font-medium text-[#E6EDF3]">
                      {position.displayName || position.name}
                    </span>
                    {onRemoveTransaction && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartEdit();
                        }}
                        className="p-0.5 hover:bg-[#30363D] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Edit position name"
                      >
                        <Edit2 className="w-3 h-3 text-[#8B949E]" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#30363D] text-[#8B949E]">
                      {getChainName(position.chain)}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeColor(position.type)}`}>
                      {position.type}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      position.status === "open" ? "bg-[#238636] text-white" : "bg-[#30363D] text-[#8B949E]"
                    }`}>
                      {position.status}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            {position.valueUsd > 0 && (
              <div className="text-sm font-medium text-[#E6EDF3]">
                ${position.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            )}
            {position.pnlUsd !== undefined && position.pnlUsd !== 0 && (
              <div className={`text-xs ${position.pnlUsd >= 0 ? "text-[#3FB950]" : "text-[#F85149]"}`}>
                {position.pnlUsd >= 0 ? "+" : ""}${position.pnlUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            )}
            <div className="text-xs text-[#8B949E]">
              {position.transactionCount} tx{position.transactionCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-3 bg-[#0D1117]">
          <div className="pl-6 space-y-3">
            {/* Position Tokens */}
            {position.tokens && position.tokens.length > 0 && (
              <div>
                <div className="text-xs font-medium text-[#8B949E] mb-1">Tokens</div>
                {position.tokens.map((token, i) => (
                  <div key={i} className="flex justify-between text-xs text-[#E6EDF3]">
                    <span>{token.amount.toFixed(4)} {token.symbol}</span>
                    <span>${token.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Perpetual-specific */}
            {position.type === "perpetual" && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {position.leverage && (
                  <div>
                    <span className="text-[#8B949E]">Leverage: </span>
                    <span className="text-[#E6EDF3]">{position.leverage}x</span>
                  </div>
                )}
                {position.side && (
                  <div>
                    <span className="text-[#8B949E]">Side: </span>
                    <span className={position.side === "long" ? "text-[#3FB950]" : "text-[#F85149]"}>
                      {position.side.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Transactions */}
            {position.transactions && position.transactions.length > 0 && (
              <div>
                <div className="text-xs font-medium text-[#8B949E] mb-2">
                  Transactions ({position.transactions.length})
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {position.transactions.map((tx) => {
                    // Use pre-calculated historical values from backend
                    // These are calculated with price_usd (historical) not tokenDict.price (current)
                    const totalIn = tx._totalIn || 0;
                    const totalOut = tx._totalOut || 0;

                    return (
                      <div
                        key={tx.id}
                        className="flex justify-between items-center text-xs py-1.5 px-2 bg-[#161B22] rounded group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[#E6EDF3]">{tx.tx?.name || tx.cate_id || "Tx"}</span>
                          <span className="text-[#8B949E]">{formatDate(tx.time_at)}</span>
                          {tx.tx?.hash && (
                            <a
                              href={getExplorerUrl(tx.chain, tx.tx.hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#58A6FF] hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div>
                            {totalIn > 0 && (
                              <span className="text-[#3FB950]">+${totalIn.toFixed(2)}</span>
                            )}
                            {totalOut > 0 && (
                              <span className="text-[#F85149] ml-1">-${totalOut.toFixed(2)}</span>
                            )}
                          </div>
                          {onRemoveTransaction && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveTransaction(position.id, tx.id);
                              }}
                              className="p-0.5 hover:bg-[#F8514933] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove from position"
                            >
                              <X className="w-3 h-3 text-[#F85149]" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
