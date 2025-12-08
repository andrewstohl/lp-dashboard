"use client";

import { useState } from "react";
import { Wallet, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { TransactionsColumn } from "@/components/build/TransactionsColumn";
import { PositionsColumn } from "@/components/build/PositionsColumn";
import { StrategiesColumn } from "@/components/build/StrategiesColumn";
import { CreateStrategyModal } from "@/components/build/CreateStrategyModal";
import { CreatePositionModal } from "@/components/build/CreatePositionModal";

const DEFAULT_CHAIN_NAMES: Record<string, string> = {
  eth: "Ethereum",
  arb: "Arbitrum",
  op: "Optimism",
  base: "Base",
  matic: "Polygon",
  bsc: "BNB Chain",
};

export default function BuildPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<"all" | "open" | "closed">("all");
  const [showCreateStrategy, setShowCreateStrategy] = useState(false);
  const [showCreatePosition, setShowCreatePosition] = useState(false);

  const handleLoadWallet = () => {
    if (!inputValue.trim()) return;
    const address = inputValue.trim().toLowerCase();
    setWalletAddress(address);
    localStorage.setItem("vora_wallet_address", address);
    // TODO: Fetch transactions will be implemented
  };

  const handleRefresh = () => {
    if (walletAddress) {
      // TODO: Refresh logic will be implemented
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Header */}
      <header className="border-b border-[#30363D] bg-[#161B22]">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-[#E6EDF3]">VORA</h1>
              <Navigation />
            </div>
            {/* Wallet Input */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B949E]" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLoadWallet()}
                  placeholder="Enter wallet address..."
                  className="w-[420px] pl-10 pr-4 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#8B949E] focus:outline-none focus:border-[#58A6FF]"
                />
              </div>
              <button
                onClick={handleLoadWallet}
                disabled={loading || !inputValue.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2EA043] disabled:bg-[#21262D] disabled:text-[#8B949E] text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Load
              </button>
              {walletAddress && (
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="p-2 text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D] rounded-lg transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Summary Bar */}
      {walletAddress && !loading && (
        <div className="border-b border-[#30363D] bg-[#161B22]/50">
          <div className="max-w-[1800px] mx-auto px-6 py-2">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-[#8B949E]">
                <span className="text-[#E6EDF3] font-medium">0</span> groups
              </span>
              <span className="text-[#8B949E]">
                <span className="text-[#E6EDF3] font-medium">0</span> unassigned txs
              </span>
              <span className="text-[#30363D]">|</span>
              <span className="text-[#8B949E]">
                <span className="text-[#3FB950] font-medium">0</span> positions
              </span>
              <span className="text-[#8B949E]">
                <span className="text-[#58A6FF] font-medium">0</span> assigned txs
              </span>
              <span className="text-[#30363D]">|</span>
              <span className="text-[#8B949E]">
                <span className="text-[#A371F7] font-medium">0</span> strategies
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-[#F8514933] border border-[#F85149] rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[#F85149]" />
            <span className="text-[#F85149]">{error}</span>
          </div>
        )}

        {!walletAddress ? (
          /* Empty State - No Wallet */
          <div className="flex items-center justify-center h-[600px]">
            <div className="text-center">
              <Wallet className="w-16 h-16 text-[#30363D] mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-[#E6EDF3] mb-2">
                Enter Wallet Address to Begin
              </h2>
              <p className="text-[#8B949E]">
                Build your portfolio by organizing transactions into positions and strategies
              </p>
            </div>
          </div>
        ) : loading ? (
          /* Loading State */
          <div className="flex items-center justify-center h-[600px]">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-[#58A6FF] mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-[#E6EDF3] mb-2">
                Loading Portfolio...
              </h2>
              <p className="text-[#8B949E]">
                Fetching transactions and positions
              </p>
            </div>
          </div>
        ) : (
          /* Three Column Grid */
          <div className="grid grid-cols-3 gap-6 h-[calc(100vh-220px)]">
            {/* Column 1: Transaction Groups */}
            <TransactionsColumn
              groups={[]}
              tokenDict={{}}
              chainNames={DEFAULT_CHAIN_NAMES}
              isLoading={loading}
              onDragStart={(txId, groupKey) => console.log('Drag started:', txId)}
            />

            {/* Column 2: Positions */}
            <PositionsColumn
              positions={[]}
              tokenDict={{}}
              chainNames={DEFAULT_CHAIN_NAMES}
              filter={positionFilter}
              onFilterChange={setPositionFilter}
              onRemoveTransaction={() => {}}
              onRenamePosition={() => {}}
              onCreatePosition={() => setShowCreatePosition(true)}
              onDropTransaction={() => {}}
              isLoading={loading}
            />

            {/* Column 3: Strategies */}
            <StrategiesColumn
              strategies={[]}
              positions={[]}
              onCreateStrategy={() => setShowCreateStrategy(true)}
              onDeleteStrategy={() => {}}
              isLoading={loading}
            />
          </div>
        )}
      </main>

      {/* Create Strategy Modal */}
      <CreateStrategyModal
        isOpen={showCreateStrategy}
        onClose={() => setShowCreateStrategy(false)}
        onSubmit={() => {}}
        availablePositions={[]}
      />

      {/* Create Position Modal */}
      <CreatePositionModal
        isOpen={showCreatePosition}
        onClose={() => setShowCreatePosition(false)}
        onSubmit={() => {}}
      />
    </div>
  );
}
