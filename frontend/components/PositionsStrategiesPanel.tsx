"use client";

import { useState } from "react";
import { 
  Layers, FolderKanban, ChevronRight, ChevronDown, 
  Plus, MoreHorizontal, Trash2, Percent
} from "lucide-react";
import { type Position } from "@/lib/reconciliation/positions";
import { type Strategy, STRATEGY_TYPES } from "@/lib/reconciliation/strategies";

interface PositionsStrategiesPanelProps {
  positions: Position[];
  strategies: Strategy[];
  chainNames: Record<string, string>;
  onCreateStrategy: () => void;
  onDeletePosition?: (positionId: string) => void;
  onDeleteStrategy?: (strategyId: string) => void;
}

// Status badge colors
const STATUS_COLORS: Record<string, string> = {
  open: "bg-[#238636] text-white",
  active: "bg-[#238636] text-white",
  closed: "bg-[#484F58] text-[#E6EDF3]",
  partial: "bg-[#9E6A03] text-white",
};

export function PositionsStrategiesPanel({
  positions,
  strategies,
  chainNames,
  onCreateStrategy,
  onDeletePosition,
  onDeleteStrategy,
}: PositionsStrategiesPanelProps) {
  const [positionsExpanded, setPositionsExpanded] = useState(true);
  const [strategiesExpanded, setStrategiesExpanded] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  
  if (positions.length === 0 && strategies.length === 0) {
    return null;
  }

  // Get position by ID
  const getPositionById = (id: string) => positions.find(p => p.id === id);

  // Get strategy type label
  const getStrategyTypeLabel = (type: Strategy['type']) => {
    return STRATEGY_TYPES.find(t => t.value === type)?.label || type;
  };

  return (
    <div className="bg-[#161B22] rounded-lg border border-[#21262D] overflow-hidden">
      {/* Positions Section */}
      {positions.length > 0 && (
        <div>
          <button
            onClick={() => setPositionsExpanded(!positionsExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-[#1C2128] transition-colors"
          >
            <div className="flex items-center gap-2">
              {positionsExpanded ? (
                <ChevronDown className="w-4 h-4 text-[#8B949E]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#8B949E]" />
              )}
              <Layers className="w-5 h-5 text-[#58A6FF]" />
              <span className="font-medium text-[#E6EDF3]">Positions</span>
              <span className="text-sm text-[#8B949E]">({positions.length})</span>
            </div>
          </button>

          {positionsExpanded && (
            <div className="border-t border-[#21262D]">
              {positions.map(position => (
                <div
                  key={position.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[#1C2128] border-b border-[#21262D] last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[#E6EDF3] font-medium truncate">
                        {position.name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[position.status] || STATUS_COLORS.open}`}>
                        {position.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-[#8B949E]">
                        {position.protocolName || position.protocol}
                      </span>
                      <span className="text-[#30363D]">•</span>
                      <span className="text-xs text-[#8B949E]">
                        {chainNames[position.chain] || position.chain}
                      </span>
                      <span className="text-[#30363D]">•</span>
                      <span className="text-xs text-[#8B949E]">
                        {position.txKeys.length} txns
                      </span>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  {onDeletePosition && (
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === position.id ? null : position.id)}
                        className="p-1 text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openMenu === position.id && (
                        <div className="absolute right-0 top-full mt-1 bg-[#21262D] border border-[#30363D] rounded-lg shadow-lg z-10 min-w-[120px]">
                          <button
                            onClick={() => {
                              onDeletePosition(position.id);
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#F85149] hover:bg-[#30363D] transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Strategies Section */}
      <div className={positions.length > 0 ? "border-t border-[#21262D]" : ""}>
        <button
          onClick={() => setStrategiesExpanded(!strategiesExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-[#1C2128] transition-colors"
        >
          <div className="flex items-center gap-2">
            {strategiesExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#8B949E]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8B949E]" />
            )}
            <FolderKanban className="w-5 h-5 text-[#A371F7]" />
            <span className="font-medium text-[#E6EDF3]">Strategies</span>
            <span className="text-sm text-[#8B949E]">({strategies.length})</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateStrategy();
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[#A371F7] hover:bg-[#21262D] rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </button>

        {strategiesExpanded && (
          <div className="border-t border-[#21262D]">
            {strategies.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-[#8B949E] mb-2">No strategies yet</p>
                <button
                  onClick={onCreateStrategy}
                  className="text-sm text-[#A371F7] hover:underline"
                >
                  Create your first strategy
                </button>
              </div>
            ) : (
              strategies.map(strategy => (
                <div
                  key={strategy.id}
                  className="px-4 py-3 hover:bg-[#1C2128] border-b border-[#21262D] last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[#E6EDF3] font-medium">
                        {strategy.name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[strategy.status] || STATUS_COLORS.active}`}>
                        {strategy.status}
                      </span>
                    </div>

                    {/* Actions */}
                    {onDeleteStrategy && (
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenu(openMenu === strategy.id ? null : strategy.id)}
                          className="p-1 text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openMenu === strategy.id && (
                          <div className="absolute right-0 top-full mt-1 bg-[#21262D] border border-[#30363D] rounded-lg shadow-lg z-10 min-w-[120px]">
                            <button
                              onClick={() => {
                                onDeleteStrategy(strategy.id);
                                setOpenMenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#F85149] hover:bg-[#30363D] transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Strategy details */}
                  <div className="mt-2 text-xs text-[#8B949E]">
                    <span>{getStrategyTypeLabel(strategy.type)}</span>
                    {strategy.description && (
                      <>
                        <span className="mx-1">•</span>
                        <span>{strategy.description}</span>
                      </>
                    )}
                  </div>
                  
                  {/* Linked positions */}
                  {strategy.positions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {strategy.positions.map(alloc => {
                        const pos = getPositionById(alloc.positionId);
                        if (!pos) return null;
                        return (
                          <span
                            key={alloc.positionId}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-[#21262D] rounded text-xs"
                          >
                            <span className="text-[#E6EDF3]">{pos.name}</span>
                            <span className="text-[#8B949E] flex items-center">
                              <Percent className="w-3 h-3 mr-0.5" />
                              {alloc.percentage}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
