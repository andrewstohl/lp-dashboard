"use client";

import { useState } from "react";
import { Layers, ChevronRight, Sparkles, Check } from "lucide-react";
import type { PositionSuggestion } from "@/lib/reconciliation/positions";
import type { ProjectMeta } from "@/lib/api";

interface PositionSuggestionsPanelProps {
  suggestions: PositionSuggestion[];
  projectDict: Record<string, ProjectMeta>;
  chainNames: Record<string, string>;
  onCreatePosition: (suggestion: PositionSuggestion) => void;
}

// Confidence badge colors
const CONFIDENCE_COLORS = {
  high: "bg-[#238636] text-white",
  medium: "bg-[#9E6A03] text-white", 
  low: "bg-[#484F58] text-[#E6EDF3]",
};

export function PositionSuggestionsPanel({
  suggestions,
  projectDict,
  chainNames,
  onCreatePosition,
}: PositionSuggestionsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  
  if (suggestions.length === 0) return null;
  
  return (
    <div className="bg-[#161B22] rounded-lg border border-[#21262D]">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#1C2128] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#388BFD26] rounded-lg">
            <Sparkles className="w-5 h-5 text-[#58A6FF]" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-[#E6EDF3]">
              Position Suggestions
            </h3>
            <p className="text-xs text-[#8B949E]">
              {suggestions.length} potential position{suggestions.length !== 1 ? 's' : ''} detected
            </p>
          </div>
        </div>
        <ChevronRight className={`w-5 h-5 text-[#8B949E] transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Suggestions list */}
      {expanded && (
        <div className="border-t border-[#21262D]">
          <div className="divide-y divide-[#21262D]">
            {suggestions.slice(0, 5).map((suggestion) => {
              const protoName = suggestion.protocolName || projectDict[suggestion.protocol]?.name || suggestion.protocol;
              const chainName = chainNames[suggestion.chain] || suggestion.chain;
              
              return (
                <div
                  key={suggestion.key}
                  className="flex items-center justify-between p-4 hover:bg-[#1C2128]"
                >
                  <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-[#8B949E]" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#E6EDF3]">
                          {protoName}
                          {suggestion.tokenPair && ` • ${suggestion.tokenPair}`}
                        </span>
                        <span className={`px-1.5 py-0.5 text-xs rounded ${CONFIDENCE_COLORS[suggestion.confidence]}`}>
                          {suggestion.confidence}
                        </span>
                      </div>
                      <p className="text-xs text-[#8B949E]">
                        {chainName} • {suggestion.transactionCount} transactions
                        {suggestion.positionKey && ` • ID: ...${suggestion.positionKey.slice(-6)}`}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => onCreatePosition(suggestion)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#21262D] text-[#58A6FF] text-sm rounded-lg hover:bg-[#30363D] transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    Create
                  </button>
                </div>
              );
            })}
          </div>
          
          {suggestions.length > 5 && (
            <div className="p-3 text-center border-t border-[#21262D]">
              <p className="text-xs text-[#8B949E]">
                +{suggestions.length - 5} more suggestions
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
