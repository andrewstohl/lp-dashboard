"use client";

import { useState } from "react";
import { type Transaction, formatCurrency } from "@/lib/api";
import { MoreHorizontal, ExternalLink, Plus, FolderPlus } from "lucide-react";

interface TransactionRowProps {
  transaction: Transaction;
}

// Protocol display names
const PROTOCOL_NAMES: Record<string, string> = {
  uniswap_v3: "Uniswap V3",
  gmx_v2: "GMX V2",
  aave: "AAVE",
  euler: "Euler",
};

// Transaction type display names and colors
const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  lp_mint: { label: "Add Liquidity", color: "#3FB950" },
  lp_burn: { label: "Remove Liquidity", color: "#F85149" },
  lp_collect: { label: "Collect Fees", color: "#A371F7" },
  perp_open: { label: "Open Position", color: "#3FB950" },
  perp_increase: { label: "Increase", color: "#58A6FF" },
  perp_decrease: { label: "Decrease", color: "#F0883E" },
  perp_close: { label: "Close Position", color: "#F85149" },
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

export function TransactionRow({ transaction }: TransactionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  
  const typeConfig = TYPE_CONFIG[transaction.type] || { 
    label: transaction.type, 
    color: "#8B949E" 
  };
  
  const protocolName = PROTOCOL_NAMES[transaction.protocol] || transaction.protocol;
  
  // Build token summary string
  const tokenSummary = transaction.tokens
    .map(t => `${t.amount.toFixed(2)} ${t.symbol}`)
    .join(" + ");

  // Determine if this is a "positive" or "negative" value transaction
  const isPositive = ["lp_mint", "perp_open", "perp_increase", "lp_collect"].includes(transaction.type);

  return (
    <div className="px-4 py-3 hover:bg-[#1C2128] transition-colors relative">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Date, Type, Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Date */}
            <span className="text-[#8B949E] text-sm">
              {formatDate(transaction.timestamp)}
            </span>
            <span className="text-[#30363D]">•</span>
            {/* Type badge */}
            <span 
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ 
                backgroundColor: `${typeConfig.color}20`,
                color: typeConfig.color 
              }}
            >
              {typeConfig.label}
            </span>
          </div>
          
          {/* Token summary */}
          <p className="text-[#E6EDF3] font-medium truncate">
            {tokenSummary || "—"}
          </p>
          
          {/* Protocol and hash */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[#8B949E] text-xs">{protocolName}</span>
            <span className="text-[#30363D]">•</span>
            <span className="text-[#8B949E] text-xs font-mono">
              {shortenHash(transaction.txHash)}
            </span>
          </div>
        </div>
        
        {/* Right: Value and menu */}
        <div className="flex items-center gap-3">
          {/* USD Value */}
          <div className="text-right">
            <p className={`font-semibold ${isPositive ? "text-[#E6EDF3]" : "text-[#F85149]"}`}>
              {isPositive ? "" : "-"}{formatCurrency(Math.abs(transaction.usdValue))}
            </p>
            {transaction.realizedPnl !== null && (
              <p className={`text-xs ${transaction.realizedPnl >= 0 ? "text-[#3FB950]" : "text-[#F85149]"}`}>
                P&L: {transaction.realizedPnl >= 0 ? "+" : ""}{formatCurrency(transaction.realizedPnl)}
              </p>
            )}
          </div>
          
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
              href={`https://arbiscan.io/tx/${transaction.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2 text-left text-[#8B949E] hover:bg-[#21262D] flex items-center gap-2"
              onClick={() => setMenuOpen(false)}
            >
              <ExternalLink className="w-4 h-4" />
              View on Explorer
            </a>
          </div>
        </>
      )}
    </div>
  );
}
