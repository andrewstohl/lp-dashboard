"use client";

import { useState, useEffect } from "react";
import { 
  getWalletLedger, 
  type LPPosition, 
  type PerpetualPosition,
  type GMXRewards,
  type PerpHistory 
} from "@/lib/api";
import { Wallet, Search, RefreshCw } from "lucide-react";
import { LedgerMatrix } from "@/components/LedgerMatrix";
import { Navigation } from "@/components/Navigation";
import { ProfessionalLoading, ProfessionalEmptyState, ProfessionalErrorState } from "@/components/ProfessionalStates";

export default function LedgerPage() {
  const [walletAddress, setWalletAddress] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lastWalletAddress') || '0x23b50a703d3076b73584df48251931ebf5937ba2';
    }
    return '0x23b50a703d3076b73584df48251931ebf5937ba2';
  });
  const [lpPositions, setLpPositions] = useState<LPPosition[]>([]);
  const [perpPositions, setPerpPositions] = useState<PerpetualPosition[]>([]);
  const [gmxRewards, setGmxRewards] = useState<GMXRewards | undefined>();
  const [perpHistory, setPerpHistory] = useState<PerpHistory | undefined>();
  const [totalGasFees, setTotalGasFees] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!walletAddress.trim()) {
      setError("Please enter a wallet address");
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('lastWalletAddress', walletAddress.trim());
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const result = await getWalletLedger(walletAddress.trim());
      setLpPositions(result.data.lp_positions);
      setPerpPositions(result.data.perp_positions);
      setGmxRewards(result.data.gmx_rewards);
      setPerpHistory(result.data.perp_history);
      setTotalGasFees(result.data.total_gas_fees_usd);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch ledger data");
      setLpPositions([]);
      setPerpPositions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPositions = lpPositions.length > 0 || perpPositions.length > 0;

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Header */}
      <header className="bg-[#161B22] border-b border-[#21262D] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-[#58A6FF]" />
              <h1 className="text-2xl font-bold text-[#E6EDF3]">VORA Dashboard</h1>
            </div>
            <Navigation />
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Enter wallet address (0x...)"
                  className="w-full px-4 py-3 pl-12 bg-[#1C2128] border border-[#30363D] text-[#E6EDF3] placeholder-[#8B949E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#58A6FF] focus:border-transparent"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8B949E]" />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-[#58A6FF] text-[#0D1117] font-semibold rounded-lg hover:bg-[#79B8FF] disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Analyze
              </button>
            </div>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#E6EDF3]">Position & Performance Ledger</h2>
          <p className="text-[#8B949E]">Comprehensive view of LP positions, hedges, and P&L analysis</p>
          {lastUpdated && (
            <p className="text-xs text-[#8B949E] mt-1">Last updated: {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>

        {loading && <ProfessionalLoading message="Loading enriched ledger data..." />}
        
        {error && <ProfessionalErrorState error={error} retryAction={() => handleSearch()} />}

        {!loading && !error && hasSearched && !hasPositions && (
          <ProfessionalEmptyState 
            title="No Positions Found"
            message="This wallet doesn't have any LP or perpetual positions to display."
            icon="wallet"
          />
        )}

        {!loading && !error && hasPositions && (
          <LedgerMatrix 
            lpPositions={lpPositions} 
            perpPositions={perpPositions}
            gmxRewards={gmxRewards}
            perpHistory={perpHistory}
            totalGasFees={totalGasFees}
          />
        )}
      </main>
    </div>
  );
}
