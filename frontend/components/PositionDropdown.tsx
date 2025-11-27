"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Plus, Sparkles, Check, EyeOff, X } from "lucide-react";
import type { Position } from "@/lib/reconciliation/positions";
import type { TransactionSuggestion } from "@/lib/reconciliation/naming";

interface PositionDropdownProps {
  currentPositionId?: string;
  suggestion: TransactionSuggestion;
  onAssign: (positionId: string) => void;
  onCreate: (name: string) => void;
  onUnassign: () => void;
  onHide: () => void;
}

export function PositionDropdown({
  currentPositionId,
  suggestion,
  onAssign,
  onCreate,
  onUnassign,
  onHide,
}: PositionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { suggestedName, matchingPositions, allPositions } = suggestion;
  const currentPosition = allPositions.find(p => p.id === currentPositionId);
  const displayText = currentPosition?.name || "Unassigned";
  const isAssigned = !!currentPositionId;
  
  // Non-matching positions (for "Other positions" section)
  const otherPositions = allPositions.filter(
    p => !matchingPositions.find(m => m.id === p.id)
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors min-w-[140px] max-w-[200px] ${
          isAssigned
            ? "bg-[#238636]/20 text-[#3FB950] hover:bg-[#238636]/30"
            : "bg-[#9E6A03]/20 text-[#F0B90B] hover:bg-[#9E6A03]/30"
        }`}
      >
        <span className="truncate flex-1 text-left">{displayText}</span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#161B22] border border-[#30363D] rounded-lg shadow-xl py-1 min-w-[260px] max-h-[320px] overflow-y-auto">
          
          {/* Suggested new position (only for opening transactions with no match) */}
          {suggestedName && !currentPositionId && (
            <>
              <div className="px-3 py-1.5 text-xs text-[#8B949E] font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#F0B90B]" />
                Create New Position
              </div>
              <button
                onClick={() => {
                  onCreate(suggestedName);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-[#E6EDF3] hover:bg-[#21262D] flex items-center gap-2"
              >
                <Plus className="w-4 h-4 text-[#58A6FF]" />
                <span className="truncate">{suggestedName}</span>
              </button>
              <div className="border-t border-[#21262D] my-1" />
            </>
          )}

          {/* Matching positions (likely matches) */}
          {matchingPositions.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs text-[#8B949E] font-medium">
                {currentPositionId ? 'Current & Matching' : 'Likely Matches'}
              </div>
              {matchingPositions.map((pos) => (
                <button
                  key={pos.id}
                  onClick={() => {
                    onAssign(pos.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-[#21262D] flex items-center gap-2 ${
                    pos.id === currentPositionId ? "text-[#58A6FF] bg-[#58A6FF]/10" : "text-[#E6EDF3]"
                  }`}
                >
                  {pos.id === currentPositionId ? (
                    <Check className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="truncate">{pos.name}</span>
                  {pos.status === 'closed' && (
                    <span className="text-xs text-[#8B949E] ml-auto">CLOSED</span>
                  )}
                </button>
              ))}
              {otherPositions.length > 0 && <div className="border-t border-[#21262D] my-1" />}
            </>
          )}

          {/* Other positions */}
          {otherPositions.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs text-[#8B949E] font-medium">
                Other Positions
              </div>
              {otherPositions.slice(0, 5).map((pos) => (
                <button
                  key={pos.id}
                  onClick={() => {
                    onAssign(pos.id);
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-[#8B949E] hover:bg-[#21262D] hover:text-[#E6EDF3] flex items-center gap-2"
                >
                  <span className="w-4" />
                  <span className="truncate">{pos.name}</span>
                </button>
              ))}
              {otherPositions.length > 5 && (
                <div className="px-3 py-1 text-xs text-[#8B949E]">
                  +{otherPositions.length - 5} more...
                </div>
              )}
            </>
          )}

          {/* Divider before actions */}
          {(allPositions.length > 0 || suggestedName) && (
            <div className="border-t border-[#21262D] my-1" />
          )}

          {/* Unassign option */}
          {currentPositionId && (
            <button
              onClick={() => {
                onUnassign();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-[#8B949E] hover:bg-[#21262D] flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Unassign from position
            </button>
          )}

          {/* Hide option */}
          <button
            onClick={() => {
              onHide();
              setIsOpen(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-[#8B949E] hover:bg-[#21262D] flex items-center gap-2"
          >
            <EyeOff className="w-4 h-4" />
            Hide transaction
          </button>
        </div>
      )}
    </div>
  );
}
