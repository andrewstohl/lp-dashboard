"use client";

import { useState } from "react";
import { Plus, ChevronDown, ChevronRight, Layers, Trash2, MoreHorizontal } from "lucide-react";

interface Strategy {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "open" | "closed";
  positionIds: string[];
  totalValueUsd: number;
  totalPnlUsd?: number;
  createdAt: number;
}

interface Position {
  id: string;
  displayName?: string;
  name: string;
  valueUsd: number;
  status: "open" | "closed";
}

interface StrategiesColumnProps {
  strategies: Strategy[];
  positions: Position[];
  onCreateStrategy?: () => void;
  onDeleteStrategy?: (strategyId: string) => void;
  isLoading?: boolean;
}

export function StrategiesColumn({
  strategies,
  positions,
  onCreateStrategy,
  onDeleteStrategy,
  isLoading = false,
}: StrategiesColumnProps) {
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const toggleExpand = (stratId: string) => {
    setExpandedStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(stratId)) {
        next.delete(stratId);
      } else {
        next.add(stratId);
      }
      return next;
    });
  };

  const handleDelete = (strategyId: string) => {
    if (onDeleteStrategy) {
      onDeleteStrategy(strategyId);
    }
    setMenuOpen(null);
  };

  const getPositionById = (id: string) => positions.find((p) => p.id === id);

  if (isLoading) {
    return (
      <div className="bg-[#161B22] rounded-xl border border-[#30363D] flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[#30363D]">
          <h2 className="text-lg font-semibold text-[#E6EDF3]">Strategies</h2>
          <p className="text-sm text-[#8B949E]">Loading...</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-[#8B949E]">Loading strategies...</div>
        </div>
      </div>
    );
  }

  const totalValue = strategies.reduce((sum, s) => sum + (s.totalValueUsd || 0), 0);

  return (
    <div className="bg-[#161B22] rounded-xl border border-[#30363D] flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#30363D]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Strategies</h2>
            <p className="text-sm text-[#8B949E]">
              {strategies.length} strateg{strategies.length !== 1 ? "ies" : "y"}
              {totalValue > 0 && ` · $${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            </p>
          </div>
          {onCreateStrategy && (
            <button
              onClick={onCreateStrategy}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#238636] hover:bg-[#2EA043] text-white text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          )}
        </div>
      </div>

      {/* Strategy List */}
      <div className="flex-1 overflow-y-auto">
        {strategies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8B949E] p-4">
            <Layers className="w-12 h-12 mb-3 text-[#30363D]" />
            <p className="text-center font-medium">No Strategies Yet</p>
            <p className="text-xs mt-1 text-center">
              Create a strategy to group related positions together
            </p>
            {onCreateStrategy && (
              <button
                onClick={onCreateStrategy}
                className="mt-4 flex items-center gap-1 px-4 py-2 bg-[#238636] hover:bg-[#2EA043] text-white text-sm rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Strategy
              </button>
            )}
          </div>
        ) : (
          <div>
            {strategies.map((strategy) => {
              const isExpanded = expandedStrategies.has(strategy.id);
              const strategyPositions = strategy.positionIds
                .map(getPositionById)
                .filter(Boolean) as Position[];

              return (
                <div key={strategy.id} className="border-b border-[#21262D] last:border-b-0">
                  {/* Main Row */}
                  <div
                    onClick={() => toggleExpand(strategy.id)}
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
                              {strategy.name}
                            </span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                strategy.status === "open"
                                  ? "bg-[#238636] text-white"
                                  : strategy.status === "draft"
                                  ? "bg-[#F0883E] text-white"
                                  : "bg-[#30363D] text-[#8B949E]"
                              }`}
                            >
                              {strategy.status}
                            </span>
                          </div>
                          {strategy.description && (
                            <p className="text-xs text-[#8B949E] mt-0.5">
                              {strategy.description}
                            </p>
                          )}
                          <p className="text-xs text-[#8B949E] mt-0.5">
                            {strategyPositions.length} position{strategyPositions.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {strategy.totalValueUsd > 0 && (
                          <div className="text-sm font-medium text-[#E6EDF3]">
                            ${strategy.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        )}
                        {strategy.totalPnlUsd !== undefined && strategy.totalPnlUsd !== 0 && (
                          <div
                            className={`text-xs ${
                              strategy.totalPnlUsd >= 0 ? "text-[#3FB950]" : "text-[#F85149]"
                            }`}
                          >
                            {strategy.totalPnlUsd >= 0 ? "+" : ""}$
                            {strategy.totalPnlUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 bg-[#0D1117]">
                      <div className="pl-6 space-y-2">
                        {strategyPositions.length === 0 ? (
                          <p className="text-xs text-[#8B949E]">
                            No positions assigned to this strategy yet.
                          </p>
                        ) : (
                          strategyPositions.map((pos) => (
                            <div
                              key={pos.id}
                              className="flex justify-between items-center py-1.5 px-2 bg-[#161B22] rounded text-xs"
                            >
                              <span className="text-[#E6EDF3]">
                                {pos.displayName || pos.name}
                              </span>
                              <span className="text-[#8B949E]">
                                ${pos.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          ))
                        )}
                        
                        {/* Delete Strategy Button */}
                        {onDeleteStrategy && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete strategy "${strategy.name}"?`)) {
                                handleDelete(strategy.id);
                              }
                            }}
                            className="mt-3 flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#F85149] hover:bg-[#F8514933] rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Strategy
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
