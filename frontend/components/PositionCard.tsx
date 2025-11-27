"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import type { ProtocolPosition, PositionRegistry } from "@/lib/position-registry";
import type { Transaction, TokenMeta, ProjectMeta } from "@/lib/api";

interface PositionCardProps {
  position: ProtocolPosition;
  transactions: Transaction[];
  tokenDict: Record<string, TokenMeta>;
  projectDict: Record<string, ProjectMeta>;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function PositionCard({ position, transactions, tokenDict, projectDict }: PositionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = position.status === "open" ? "text-[#3FB950]" : "text-[#8B949E]";
  const statusBg = position.status === "open" ? "bg-[#238636]/20" : "bg-[#21262D]";
  
  const protocolColors: Record<string, string> = {
    gmx: "#4B9EFF",
    uniswap: "#FF007A",
    aave: "#B6509E",
  };
  const protocolColor = protocolColors[position.protocol] || "#8B949E";

  return (
    <div className="bg-[#161B22] rounded-lg border border-[#21262D] overflow-hidden">
      {/* Position Header - Always Visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-[#1C2128] transition-colors text-left"
      >
        {/* Expand Icon */}
        <div className="text-[#8B949E]">
          {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </div>

        {/* Protocol Badge */}
        <div
          className="px-2 py-1 rounded text-xs font-medium uppercase"
          style={{ backgroundColor: `${protocolColor}20`, color: protocolColor }}
        >
          {position.protocol}
        </div>

        {/* Position Name */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[#E6EDF3] font-medium">{position.name}</span>
            {position.direction && (
              <span className={`text-xs ${position.direction === 'long' ? 'text-[#3FB950]' : 'text-[#F85149]'}`}>
                {position.direction === 'long' ? <TrendingUp className="w-4 h-4 inline" /> : <TrendingDown className="w-4 h-4 inline" />}
              </span>
            )}
          </div>
          <div className="text-xs text-[#8B949E] mt-0.5">
            {formatDate(position.openedAt)}
            {position.closedAt && ` → ${formatDate(position.closedAt)}`}
          </div>
        </div>

        {/* Status Badge */}
        <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${statusBg} ${statusColor}`}>
          {position.status}
        </span>

        {/* Metrics */}
        {position.metrics.sizeUsd && position.metrics.sizeUsd > 0 && (
          <div className="text-right">
            <div className="text-[#E6EDF3] font-medium">{formatCurrency(position.metrics.sizeUsd)}</div>
            <div className="text-xs text-[#8B949E]">size</div>
          </div>
        )}

        {/* Transaction Count */}
        <div className="text-right min-w-[60px]">
          <div className="text-[#8B949E] text-sm">{transactions.length} txs</div>
        </div>
      </button>

      {/* Expanded: Transaction List */}
      {expanded && transactions.length > 0 && (
        <div className="border-t border-[#21262D] bg-[#0D1117]">
          <div className="px-4 py-2 text-xs font-medium text-[#8B949E] uppercase tracking-wide">
            Transactions
          </div>
          <div className="divide-y divide-[#21262D]">
            {transactions.map((tx) => {
              const txName = tx.tx?.name || tx.cate_id || "Transaction";
              return (
                <div key={tx.id} className="px-4 py-2 flex items-center gap-4 text-sm">
                  <span className="text-[#8B949E] w-20">{formatDate(tx.time_at)}</span>
                  <span className="text-[#E6EDF3] flex-1">{txName}</span>
                  <a
                    href={`https://arbiscan.io/tx/${tx.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#58A6FF] hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="font-mono text-xs">{tx.id.slice(0, 10)}...</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
