"use client";

import { useState } from "react";
import { type Transaction, type TokenMeta, type ProjectMeta, formatCurrency } from "@/lib/api";
import { MoreHorizontal, ExternalLink, Plus, FolderPlus } from "lucide-react";

interface TransactionRowProps {
  transaction: Transaction;
  tokenDict: Record<string, TokenMeta>;
  projectDict: Record<string, ProjectMeta>;
  chainNames: Record<string, string>;
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
    year: "numeric",
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function TransactionRow({ 
  transaction, 
  tokenDict, 
  projectDict,
  chainNames 
}: TransactionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  
  const tx = transaction.tx;
  const chain = transaction.chain;
  const chainName = chainNames[chain] || chain.toUpperCase();
  const chainColor = CHAIN_COLORS[chain] || "#8B949E";
  const explorerUrl = EXPLORER_URLS[chain] || "https://etherscan.io/tx/";
  
  // Get project info
  const project = transaction.project_id ? projectDict[transaction.project_id] : null;
  const projectName = project?.name || transaction.cate_id || "Unknown";
  
  // Build token summary from sends and receives
  const buildTokenSummary = () => {
    const parts: string[] = [];
    
    // Receives (tokens coming in)
    for (const recv of transaction.receives) {
      const token = tokenDict[recv.token_id];
      const symbol = token?.symbol || shortenAddress(recv.token_id);
      const amount = recv.amount;
      if (amount > 0.0001) {
        parts.push(`+${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`);
      }
    }
    
    // Sends (tokens going out)
    for (const send of transaction.sends) {
      const token = tokenDict[send.token_id];
      const symbol = token?.symbol || shortenAddress(send.token_id);
      const amount = send.amount;
      if (amount > 0.0001) {
        parts.push(`-${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`);
      }
    }
    
    return parts.length > 0 ? parts.join(", ") : tx.name || "Contract Interaction";
  };
  
  // Calculate approximate USD value
  const calculateUsdValue = () => {
    let total = 0;
    
    for (const recv of transaction.receives) {
      const token = tokenDict[recv.token_id];
      if (token?.price) {
        total += recv.amount * token.price;
      }
    }
    
    for (const send of transaction.sends) {
      const token = tokenDict[send.token_id];
      if (token?.price) {
        total -= send.amount * token.price;
      }
    }
    
    return total;
  };
  
  const tokenSummary = buildTokenSummary();
  const usdValue = calculateUsdValue();
  const hasValue = Math.abs(usdValue) > 0.01;
  const isPositive = usdValue >= 0;
  
  // Determine action type for display
  const actionName = tx.name || transaction.cate_id || "Transaction";
  
  return (
    <div className="px-4 py-3 hover:bg-[#1C2128] transition-colors relative">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Date, Chain, Action, Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* Date */}
            <span className="text-[#8B949E] text-sm">
              {formatDate(transaction.time_at)}
            </span>
            <span className="text-[#30363D]">•</span>
            {/* Chain badge */}
            <span 
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ 
                backgroundColor: `${chainColor}20`,
                color: chainColor 
              }}
            >
              {chainName}
            </span>
            {/* Action badge */}
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#21262D] text-[#E6EDF3]">
              {actionName}
            </span>
          </div>
          
          {/* Token summary */}
          <p className="text-[#E6EDF3] font-medium truncate">
            {tokenSummary}
          </p>
          
          {/* Project and hash */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {project && (
              <>
                <span className="text-[#58A6FF] text-xs">{projectName}</span>
                <span className="text-[#30363D]">•</span>
              </>
            )}
            <span className="text-[#8B949E] text-xs font-mono">
              {shortenHash(transaction.id)}
            </span>
            {transaction.other_addr && (
              <>
                <span className="text-[#30363D]">•</span>
                <span className="text-[#8B949E] text-xs">
                  → {shortenAddress(transaction.other_addr)}
                </span>
              </>
            )}
          </div>
        </div>
        
        {/* Right: Value and menu */}
        <div className="flex items-center gap-3">
          {/* USD Value */}
          {hasValue && (
            <div className="text-right">
              <p className={`font-semibold ${isPositive ? "text-[#3FB950]" : "text-[#F85149]"}`}>
                {isPositive ? "+" : ""}{formatCurrency(usdValue)}
              </p>
            </div>
          )}
          
          {/* Actions menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg hover:bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Dropdown menu */}
      {menuOpen && (
        <>
          {/* Backdrop to close menu */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setMenuOpen(false)} 
          />
          
          {/* Menu */}
          <div className="absolute right-4 top-12 z-20 bg-[#161B22] border border-[#30363D] rounded-lg shadow-lg py-1 min-w-[200px]">
            <button
              onClick={() => { setMenuOpen(false); /* TODO: Step 13 */ }}
              className="w-full px-4 py-2 text-left text-[#E6EDF3] hover:bg-[#21262D] flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Position
            </button>
            <button
              onClick={() => { setMenuOpen(false); /* TODO: Step 14 */ }}
              className="w-full px-4 py-2 text-left text-[#E6EDF3] hover:bg-[#21262D] flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              Create Strategy
            </button>
            <div className="border-t border-[#30363D] my-1" />
            <a
              href={`${explorerUrl}${transaction.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2 text-left text-[#8B949E] hover:bg-[#21262D] flex items-center gap-2"
              onClick={() => setMenuOpen(false)}
            >
              <ExternalLink className="w-4 h-4" />
              View on {chainName} Explorer
            </a>
          </div>
        </>
      )}
    </div>
  );
}
