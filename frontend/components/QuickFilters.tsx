"use client";

import { Shield, FileCheck, Rocket, Coins } from "lucide-react";
import { type FilterStats } from "@/lib/transaction-filters";

interface QuickFiltersProps {
  stats: FilterStats;
  hideSpam: boolean;
  hideApproves: boolean;
  hideDeploys: boolean;
  hideDust: boolean;
  onToggleSpam: () => void;
  onToggleApproves: () => void;
  onToggleDeploys: () => void;
  onToggleDust: () => void;
}

export function QuickFilters({
  stats,
  hideSpam,
  hideApproves,
  hideDeploys,
  hideDust,
  onToggleSpam,
  onToggleApproves,
  onToggleDeploys,
  onToggleDust,
}: QuickFiltersProps) {
  return (
    <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-[#8B949E]">Quick Filters</span>
        <span className="text-xs text-[#484F58]">
          ({stats.visible} of {stats.total} shown)
        </span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {/* Hide Spam */}
        <button
          onClick={onToggleSpam}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            hideSpam
              ? "bg-[#F85149] text-white"
              : "bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3]"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Hide Spam</span>
          {stats.spam > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              hideSpam ? "bg-white/20" : "bg-[#30363D]"
            }`}>
              {stats.spam}
            </span>
          )}
        </button>

        {/* Hide Approves */}
        <button
          onClick={onToggleApproves}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            hideApproves
              ? "bg-[#A371F7] text-white"
              : "bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3]"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Hide Approves</span>
          {stats.approves > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              hideApproves ? "bg-white/20" : "bg-[#30363D]"
            }`}>
              {stats.approves}
            </span>
          )}
        </button>

        {/* Hide Deploys */}
        <button
          onClick={onToggleDeploys}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            hideDeploys
              ? "bg-[#9E6A03] text-white"
              : "bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3]"
          }`}
        >
          <Rocket className="w-4 h-4" />
          <span>Hide Deploys</span>
          {stats.deploys > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              hideDeploys ? "bg-white/20" : "bg-[#30363D]"
            }`}>
              {stats.deploys}
            </span>
          )}
        </button>

        {/* Hide Dust */}
        <button
          onClick={onToggleDust}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            hideDust
              ? "bg-[#58A6FF] text-white"
              : "bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3]"
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Hide Dust (&lt;$0.10)</span>
          {stats.dust > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              hideDust ? "bg-white/20" : "bg-[#30363D]"
            }`}>
              {stats.dust}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
