"use client";

import { useState } from "react";
import { type Transaction, type TokenMeta, type ProjectMeta, formatCurrency } from "@/lib/api";
import { MoreHorizontal, ExternalLink, Plus, FolderPlus, EyeOff, Eye } from "lucide-react";

interface TransactionRowCompactProps {
  transaction: Transaction;
  tokenDict: Record<string, TokenMeta>;
  projectDict: Record<string, ProjectMeta>;
  chainNames: Record<string, string>;
  isHidden?: boolean;
  onHide?: (chain: string, txHash: string) => void;
  onUnhide?: (chain: string, txHash: string) => void;
}

// Chain explorer URLs
const EXPLORER_URLS: Record<string, string> = {
  eth: "https://etherscan.io/tx/",
  arb: "https://arbiscan.io/tx/",
  op: "https://optimistic.etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  matic: "https://polygonscan.com/tx/",
  bsc: "https://bscscan.com/tx/",
  avax: "https://snowtrace.io/tx/",
  ftm: "https://ftmscan.com/tx/",
};

// Chain badge colors
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

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function TransactionRowCompact({ 
  transaction, 
  tokenDict, 
  projectDict,
  chainNames,
  isHidden = false,
  onHide,
  onUnhide
}: TransactionRowCompactProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  
  const tx = transaction.tx;
  const chain = transaction.chain;
  const chainName = chainNames[chain] || chain.toUpperCase();
  const chainColor = CHAIN_COLORS[chain] || "#8B949E";
  const explorerUrl = EXPLORER_URLS[chain] || "https://etherscan.io/tx/";
  
  // Get project info
  const project = transaction.project_id ? projectDict[transaction.project_id] : null;
  const projectName = project?.name || transaction.project_id || "-";
  
  // Get action type
  const actionType = transaction.cate_id || tx?.name || "unknown";

  // Build compact token summary
  const buildTokenSummary = () => {
    const parts: string[] = [];
    
    for (const recv of transaction.receives || []) {
      const token = tokenDict[recv.token_id];
      const symbol = token?.symbol || recv.token_id?.slice(0, 6) || "?";
      if (recv.amount > 0.0001) {
        parts.push(`+${recv.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`);
      }
    }
    
    for (const send of transaction.sends || []) {
      const token = tokenDict[send.token_id];
      const symbol = token?.symbol || send.token_id?.slice(0, 6) || "?";
      if (send.amount > 0.0001) {
        parts.push(`-${send.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`);
      }
    }
    
    if (parts.length === 0) return tx?.name || "Contract call";
    if (parts.length > 2) return `${parts.slice(0, 2).join(", ")} +${parts.length - 2} more`;
    return parts.join(", ");
  };
  
  // Calculate USD value
  const calculateUsdValue = () => {
    let total = 0;
    for (const recv of transaction.receives || []) {
      const token = tokenDict[recv.token_id];
      if (token?.price) total += recv.amount * token.price;
    }
    for (const send of transaction.sends || []) {
      const token = tokenDict[send.token_id];
      if (token?.price) total -= send.amount * token.price;
    }
    return total;
  };
  
  const tokenSummary = buildTokenSummary();
  const usdValue = calculateUsdValue();
  const hasValue = Math.abs(usdValue) > 0.01;
  const isPositive = usdValue >= 0;


  return (
    <div className={`flex items-center gap-4 px-4 py-2 hover:bg-[#1C2128] transition-colors ${isHidden ? 'opacity-50' : ''}`}>
      {/* Date - w-24 */}
      <div className="w-24 flex-shrink-0">
        <span className="text-[#E6EDF3] text-sm">{formatDate(transaction.time_at)}</span>
      </div>
      
      {/* Chain - w-20 */}
      <div className="w-20 flex-shrink-0">
        <span 
          className="text-xs font-medium px-2 py-0.5 rounded-full inline-block"
          style={{ 
            backgroundColor: `${chainColor}20`,
            color: chainColor 
          }}
        >
          {chainName}
        </span>
      </div>
      
      {/* Type - w-28 */}
      <div className="w-28 flex-shrink-0">
        <span className="text-[#E6EDF3] text-sm truncate block">{actionType}</span>
      </div>
      
      {/* Protocol - w-28 */}
      <div className="w-28 flex-shrink-0">
        <span className="text-[#58A6FF] text-sm truncate block">{projectName}</span>
      </div>
      
      {/* Details - flex-1 */}
      <div className="flex-1 min-w-0">
        <span className="text-[#8B949E] text-sm truncate block" title={tokenSummary}>
          {tokenSummary}
        </span>
      </div>
      
      {/* Amount - w-24 */}
      <div className="w-24 flex-shrink-0 text-right">
        {hasValue ? (
          <span className={`text-sm font-medium ${isPositive ? "text-[#3FB950]" : "text-[#F85149]"}`}>
            {isPositive ? "+" : ""}{formatCurrency(usdValue)}
          </span>
        ) : (
          <span className="text-[#484F58] text-sm">-</span>
        )}
      </div>

      {/* Actions - w-10 */}
      <div className="w-10 flex-shrink-0 relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1 rounded hover:bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        
        {/* Dropdown menu */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-6 z-20 bg-[#161B22] border border-[#30363D] rounded-lg shadow-lg py-1 min-w-[180px]">
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full px-3 py-1.5 text-left text-sm text-[#E6EDF3] hover:bg-[#21262D] flex items-center gap-2"
              >
                <Plus className="w-3 h-3" />
                Create Position
              </button>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full px-3 py-1.5 text-left text-sm text-[#E6EDF3] hover:bg-[#21262D] flex items-center gap-2"
              >
                <FolderPlus className="w-3 h-3" />
                Create Strategy
              </button>
              <div className="border-t border-[#30363D] my-1" />
              {isHidden ? (
                <button
                  onClick={() => { setMenuOpen(false); onUnhide?.(transaction.chain, transaction.id); }}
                  className="w-full px-3 py-1.5 text-left text-sm text-[#3FB950] hover:bg-[#21262D] flex items-center gap-2"
                >
                  <Eye className="w-3 h-3" />
                  Unhide
                </button>
              ) : (
                <button
                  onClick={() => { setMenuOpen(false); onHide?.(transaction.chain, transaction.id); }}
                  className="w-full px-3 py-1.5 text-left text-sm text-[#8B949E] hover:bg-[#21262D] flex items-center gap-2"
                >
                  <EyeOff className="w-3 h-3" />
                  Hide
                </button>
              )}
              <a
                href={`${explorerUrl}${transaction.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-1.5 text-left text-sm text-[#8B949E] hover:bg-[#21262D] flex items-center gap-2"
                onClick={() => setMenuOpen(false)}
              >
                <ExternalLink className="w-3 h-3" />
                View on Explorer
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
