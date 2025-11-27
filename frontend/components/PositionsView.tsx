"use client";

import { useState, useMemo } from "react";
import { Layers, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { ProtocolPosition, PositionRegistry } from "@/lib/position-registry";
import type { Transaction, TokenMeta, ProjectMeta } from "@/lib/api";
import { PositionCard } from "./PositionCard";

interface PositionsViewProps {
  registry: PositionRegistry | null;
  transactions: Transaction[];
  tokenDict: Record<string, TokenMeta>;
  projectDict: Record<string, ProjectMeta>;
  isLoading: boolean;
}

export function PositionsView({
  registry,
  transactions,
  tokenDict,
  projectDict,
  isLoading,
}: PositionsViewProps) {
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [showUnmatched, setShowUnmatched] = useState(false);

  // Categorize transactions
  const { matchedByPosition, unmatchedTxs } = useMemo(() => {
    if (!registry) return { matchedByPosition: new Map(), unmatchedTxs: transactions };

    const matchedByPosition = new Map<string, Transaction[]>();
    const unmatchedTxs: Transaction[] = [];

    for (const tx of transactions) {
      const positionId = registry.txToPosition[tx.id.toLowerCase()];
      if (positionId) {
        if (!matchedByPosition.has(positionId)) {
          matchedByPosition.set(positionId, []);
        }
        matchedByPosition.get(positionId)!.push(tx);
      } else {
        unmatchedTxs.push(tx);
      }
    }

    return { matchedByPosition, unmatchedTxs };
  }, [registry, transactions]);

  // Filter positions
  const filteredPositions = useMemo(() => {
    if (!registry) return [];
    return registry.positions.filter((p) => {
      if (filter === "open") return p.status === "open";
      if (filter === "closed") return p.status === "closed";
      return true;
    });
  }, [registry, filter]);

  // Stats
  const stats = useMemo(() => {
    if (!registry) return { total: 0, open: 0, closed: 0, matched: 0, unmatched: 0 };
    return {
      total: registry.positions.length,
      open: registry.positions.filter((p) => p.status === "open").length,
      closed: registry.positions.filter((p) => p.status === "closed").length,
      matched: transactions.length - unmatchedTxs.length,
      unmatched: unmatchedTxs.length,
    };
  }, [registry, transactions, unmatchedTxs]);

  if (isLoading) {
    return (
      <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-12 text-center">
        <Clock className="w-12 h-12 text-[#58A6FF] mx-auto mb-4 animate-pulse" />
        <p className="text-[#E6EDF3] font-medium">Loading positions from protocols...</p>
        <p className="text-[#8B949E] text-sm mt-2">Fetching from GMX, Uniswap subgraphs</p>
      </div>
    );
  }

  if (!registry || registry.positions.length === 0) {
    return (
      <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-12 text-center">
        <AlertCircle className="w-12 h-12 text-[#F0B90B] mx-auto mb-4" />
        <p className="text-[#E6EDF3] font-medium">No positions found</p>
        <p className="text-[#8B949E] text-sm mt-2">
          No GMX or Uniswap positions detected for this wallet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#58A6FF]" />
              <span className="text-[#E6EDF3] font-medium">{stats.total} Positions</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-[#3FB950]">{stats.open} open</span>
              <span className="text-[#8B949E]">{stats.closed} closed</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Match Stats */}
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-[#3FB950]" />
              <span className="text-[#3FB950]">{stats.matched} matched</span>
              {stats.unmatched > 0 && (
                <button
                  onClick={() => setShowUnmatched(!showUnmatched)}
                  className={`px-2 py-0.5 rounded text-xs ${
                    showUnmatched ? "bg-[#F0B90B] text-black" : "bg-[#9E6A03]/20 text-[#F0B90B]"
                  }`}
                >
                  {stats.unmatched} unmatched
                </button>
              )}
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1 bg-[#21262D] rounded-lg p-1">
              {(["all", "open", "closed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-sm capitalize transition-colors ${
                    filter === f
                      ? "bg-[#58A6FF] text-white"
                      : "text-[#8B949E] hover:text-[#E6EDF3]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Position Cards */}
      <div className="space-y-2">
        {filteredPositions.map((position) => (
          <PositionCard
            key={position.id}
            position={position}
            transactions={matchedByPosition.get(position.id) || []}
            tokenDict={tokenDict}
            projectDict={projectDict}
          />
        ))}
      </div>

      {/* Unmatched Transactions */}
      {showUnmatched && unmatchedTxs.length > 0 && (
        <div className="bg-[#161B22] rounded-lg border border-[#9E6A03] overflow-hidden">
          <div className="px-4 py-3 bg-[#9E6A03]/10 border-b border-[#9E6A03] flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[#F0B90B]" />
            <span className="text-[#F0B90B] font-medium">
              {unmatchedTxs.length} Unmatched Transactions
            </span>
            <span className="text-[#8B949E] text-sm">
              (not linked to any detected position)
            </span>
          </div>
          <div className="divide-y divide-[#21262D] max-h-[400px] overflow-y-auto">
            {unmatchedTxs.slice(0, 50).map((tx) => {
              const project = tx.project_id ? projectDict[tx.project_id] : null;
              return (
                <div key={tx.id} className="px-4 py-2 flex items-center gap-4 text-sm">
                  <span className="text-[#8B949E] w-20">
                    {new Date(tx.time_at * 1000).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="text-[#58A6FF] w-24 truncate">{project?.name || tx.project_id || "-"}</span>
                  <span className="text-[#E6EDF3] flex-1">{tx.tx?.name || tx.cate_id || "Transaction"}</span>
                  <span className="text-[#8B949E] font-mono text-xs">{tx.id.slice(0, 12)}...</span>
                </div>
              );
            })}
            {unmatchedTxs.length > 50 && (
              <div className="px-4 py-2 text-center text-[#8B949E] text-sm">
                +{unmatchedTxs.length - 50} more...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
