"use client";

import { useState } from "react";
import { Filter, X, ChevronDown } from "lucide-react";

interface FilterBarProps {
  // Available options
  chains: string[];
  chainNames: Record<string, string>;
  projects: string[];
  projectNames: Record<string, string>;
  
  // Current filter values
  selectedChain: string | null;
  selectedProject: string | null;
  dateRange: string;
  
  // Callbacks
  onChainChange: (chain: string | null) => void;
  onProjectChange: (project: string | null) => void;
  onDateRangeChange: (range: string) => void;
  onApplyFilters: () => void;
}

const DATE_RANGES = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
  { value: "all", label: "All time" },
];

// Chain colors for badges
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

export function FilterBar({
  chains,
  chainNames,
  projects,
  projectNames,
  selectedChain,
  selectedProject,
  dateRange,
  onChainChange,
  onProjectChange,
  onDateRangeChange,
  onApplyFilters,
}: FilterBarProps) {
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

  const hasActiveFilters = selectedChain || selectedProject || dateRange !== "6m";

  const clearAllFilters = () => {
    onChainChange(null);
    onProjectChange(null);
    onDateRangeChange("6m");
  };

  return (
    <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter icon */}
        <div className="flex items-center gap-2 text-[#8B949E]">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filters</span>
        </div>

        {/* Chain filter */}
        <div className="relative">
          <button
            onClick={() => {
              setChainDropdownOpen(!chainDropdownOpen);
              setProjectDropdownOpen(false);
              setDateDropdownOpen(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              selectedChain
                ? "bg-[#58A6FF] text-[#0D1117]"
                : "bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D]"
            }`}
          >
            {selectedChain ? (
              <>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: CHAIN_COLORS[selectedChain] || "#8B949E" }}
                />
                {chainNames[selectedChain] || selectedChain}
              </>
            ) : (
              "All Chains"
            )}
            <ChevronDown className="w-4 h-4" />
          </button>

          {chainDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setChainDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 z-20 bg-[#161B22] border border-[#30363D] rounded-lg shadow-lg py-1 min-w-[160px]">
                <button
                  onClick={() => {
                    onChainChange(null);
                    setChainDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-[#21262D] ${
                    !selectedChain ? "text-[#58A6FF]" : "text-[#E6EDF3]"
                  }`}
                >
                  All Chains
                </button>
                {chains.map((chain) => (
                  <button
                    key={chain}
                    onClick={() => {
                      onChainChange(chain);
                      setChainDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[#21262D] flex items-center gap-2 ${
                      selectedChain === chain ? "text-[#58A6FF]" : "text-[#E6EDF3]"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CHAIN_COLORS[chain] || "#8B949E" }}
                    />
                    {chainNames[chain] || chain}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Protocol filter */}
        <div className="relative">
          <button
            onClick={() => {
              setProjectDropdownOpen(!projectDropdownOpen);
              setChainDropdownOpen(false);
              setDateDropdownOpen(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              selectedProject
                ? "bg-[#58A6FF] text-[#0D1117]"
                : "bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D]"
            }`}
          >
            {selectedProject
              ? projectNames[selectedProject] || selectedProject
              : "All Protocols"}
            <ChevronDown className="w-4 h-4" />
          </button>

          {projectDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setProjectDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 z-20 bg-[#161B22] border border-[#30363D] rounded-lg shadow-lg py-1 min-w-[180px] max-h-[300px] overflow-y-auto">
                <button
                  onClick={() => {
                    onProjectChange(null);
                    setProjectDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-[#21262D] ${
                    !selectedProject ? "text-[#58A6FF]" : "text-[#E6EDF3]"
                  }`}
                >
                  All Protocols
                </button>
                {projects
                  .filter((p) => p !== "other")
                  .map((project) => (
                    <button
                      key={project}
                      onClick={() => {
                        onProjectChange(project);
                        setProjectDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-[#21262D] ${
                        selectedProject === project ? "text-[#58A6FF]" : "text-[#E6EDF3]"
                      }`}
                    >
                      {projectNames[project] || project}
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>

        {/* Date range filter */}
        <div className="relative">
          <button
            onClick={() => {
              setDateDropdownOpen(!dateDropdownOpen);
              setChainDropdownOpen(false);
              setProjectDropdownOpen(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              dateRange !== "6m"
                ? "bg-[#58A6FF] text-[#0D1117]"
                : "bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D]"
            }`}
          >
            {DATE_RANGES.find((r) => r.value === dateRange)?.label || "Last 6 months"}
            <ChevronDown className="w-4 h-4" />
          </button>

          {dateDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDateDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 z-20 bg-[#161B22] border border-[#30363D] rounded-lg shadow-lg py-1 min-w-[160px]">
                {DATE_RANGES.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => {
                      onDateRangeChange(range.value);
                      setDateDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[#21262D] ${
                      dateRange === range.value ? "text-[#58A6FF]" : "text-[#E6EDF3]"
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Apply button */}
        <button
          onClick={onApplyFilters}
          className="px-4 py-1.5 bg-[#238636] text-white text-sm font-medium rounded-lg hover:bg-[#2ea043] transition-colors"
        >
          Apply
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-3 py-1.5 text-[#8B949E] hover:text-[#E6EDF3] text-sm transition-colors"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
