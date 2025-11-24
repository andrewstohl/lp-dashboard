"use client";

import { useState, useEffect } from "react";
import { getWalletPositions, formatCurrency, formatPercentage, formatTokenAmount, type Position, isLPPosition, isPerpetualPosition } from "@/lib/api";
import { Wallet, TrendingUp, TrendingDown, Coins, RefreshCw, Search } from "lucide-react";
import { Navigation } from "./Navigation";
import { PerformanceAnalytics } from "./PerformanceAnalytics";
import { ProfessionalLoading, ProfessionalEmptyState, ProfessionalErrorState } from "./ProfessionalStates";
import { DecisionIntelligence } from "./DecisionIntelligence";

export default function ProfessionalDashboard() {
  // Load wallet address from localStorage or use default
  const [walletAddress, setWalletAddress] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lastWalletAddress') || '0x23b50a703d3076b73584df48251931ebf5937ba2';
    }
    return '0x23b50a703d3076b73584df48251931ebf5937ba2';
  });
  const [positions, setPositions] = useState<Position[]>([]);
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

    // Save wallet address to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastWalletAddress', walletAddress.trim());
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const result = await getWalletPositions(walletAddress.trim());
      setPositions(result.data.positions);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch positions");
      setPositions([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load wallet data on mount
  useEffect(() => {
    if (walletAddress) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Calculate portfolio metrics
  const totalValue = positions.reduce((sum, pos) => sum + pos.total_value_usd, 0);
  const lpPositions = positions.filter(isLPPosition);
  const perpPositions = positions.filter(isPerpetualPosition);
  
  const totalDailyFees = lpPositions.reduce((sum, pos) => {
    return sum + (pos.unclaimed_fees_usd || 0);
  }, 0);
  
  const totalPnL = perpPositions.reduce((sum, pos) => sum + pos.pnl_usd, 0);

  return (
    <div className="min-h-screen bg-[#0D1117]">
      {/* Header */}
      <header className="bg-[#161B22] border-b border-[#21262D] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-[#58A6FF]" />
              <h1 className="text-2xl font-bold text-[#E6EDF3]">
                VORA Dashboard
              </h1>
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
                className="px-6 py-3 bg-[#58A6FF] text-[#0D1117] rounded-lg hover:bg-[#79C0FF] disabled:bg-[#30363D] disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  "Search"
                )}
              </button>
            </div>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error State */}
        {error && (
          <ProfessionalErrorState 
            error={error}
            retryAction={handleSearch}
            supportInfo="Please check your wallet address and try again"
          />
        )}

        {/* Loading State */}
        {loading && (
          <ProfessionalLoading 
            message="Analyzing your DeFi portfolio..."
          />
        )}

        {/* Portfolio Overview */}
        {!loading && hasSearched && positions.length > 0 && (
          <>
            <div className="bg-[#161B22] rounded-xl shadow-lg p-6 mb-8 border border-[#21262D]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-[#E6EDF3]">
                  Portfolio Overview
                </h2>
                {lastUpdated && (
                  <span className="text-sm text-[#8B949E]">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
                  <p className="text-sm text-[#8B949E] mb-1 font-medium">Total Value</p>
                  <p className="text-3xl font-bold text-[#3FB950]">
                    {formatCurrency(totalValue)}
                  </p>
                </div>
                
                <div className="text-center bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
                  <p className="text-sm text-[#8B949E] mb-1 font-medium">Unclaimed Fees</p>
                  <p className="text-3xl font-bold text-[#58A6FF]">
                    {formatCurrency(totalDailyFees)}
                  </p>
                </div>
                
                <div className="text-center bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
                  <p className="text-sm text-[#8B949E] mb-1 font-medium">Perps P&L</p>
                  <p className={`text-3xl font-bold ${totalPnL >= 0 ? 'text-[#3FB950]' : 'text-[#F85149]'}`}>
                    {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
                  </p>
                </div>
                
                <div className="text-center bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
                  <p className="text-sm text-[#8B949E] mb-1 font-medium">Total Positions</p>
                  <p className="text-3xl font-bold text-[#E6EDF3]">
                    {positions.length}
                  </p>
                  <p className="text-xs text-[#8B949E] mt-1">
                    {lpPositions.length} LP • {perpPositions.length} Perps
                  </p>
                </div>
              </div>
            </div>

            {/* Performance Analytics Section */}
            {lpPositions.length > 0 && (
              <div className="mb-8">
                <PerformanceAnalytics 
                  totalDailyFees={totalDailyFees}
                  totalValue={lpPositions.reduce((sum, pos) => sum + pos.total_value_usd, 0)}
                />
              </div>
            )}

            {/* Position Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {positions.map((position, index) => (
                <PositionCard key={index} position={position} index={index} />
              ))}
            </div>

            {/* Decision Intelligence Section */}
            <DecisionIntelligence 
              positions={positions}
              totalValue={totalValue}
              totalFees={totalDailyFees}
              lpCount={lpPositions.length}
              perpCount={perpPositions.length}
            />
          </>
        )}

        {/* Empty State */}
        {!loading && hasSearched && positions.length === 0 && (
          <ProfessionalEmptyState 
            title="No Positions Found"
            message="This wallet doesn't have any DeFi positions tracked by DeBank."
            action="Try entering a different wallet address"
            icon="wallet"
          />
        )}

        {/* Initial State */}
        {!hasSearched && !loading && (
          <ProfessionalEmptyState 
            title="Enter a wallet address to get started"
            message="View LP positions and perpetuals across DeFi protocols powered by real-time DeBank data."
            icon="search"
          />
        )}
      </main>
    </div>
  );
}

// Individual Position Card Component
function PositionCard({ position, index }: { position: Position; index: number }) {
  if (isLPPosition(position)) {
    return <LPCard position={position} index={index} />;
  } else if (isPerpetualPosition(position)) {
    return <PerpCard position={position} index={index} />;
  }
  return null;
}

// LP Position Card
function LPCard({ position, index }: { position: any; index: number }) {
  return (
    <div className="bg-[#161B22] rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-l-4 border-[#58A6FF]">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <Coins className="w-6 h-6 text-[#58A6FF]" />
          <div>
            <h3 className="text-xl font-bold text-[#E6EDF3]">
              {position.pool_name}
            </h3>
            <p className="text-xs text-[#8B949E]">
              {position.chain.toUpperCase()} • {position.pool_address.slice(0, 6)}...{position.pool_address.slice(-4)}
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-sm text-[#8B949E]">Total Value</p>
          <p className="text-2xl font-bold text-[#3FB950]">
            {formatCurrency(position.total_value_usd)}
          </p>
        </div>
      </div>

      {/* Token Details */}
      <div className="space-y-3 mb-4 bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
        <div className="flex justify-between items-center">
          <span className="text-[#E6EDF3] font-medium">{position.token0.symbol}</span>
          <div className="text-right">
            <span className="font-semibold text-[#E6EDF3]">{formatTokenAmount(position.token0.amount)}</span>
            <span className="text-sm text-[#8B949E] ml-2">
              {formatCurrency(position.token0.value_usd)}
            </span>
          </div>
        </div>
        <div className="border-t border-[#21262D] pt-3 flex justify-between items-center">
          <span className="text-[#E6EDF3] font-medium">{position.token1.symbol}</span>
          <div className="text-right">
            <span className="font-semibold text-[#E6EDF3]">{formatTokenAmount(position.token1.amount)}</span>
            <span className="text-sm text-[#8B949E] ml-2">
              {formatCurrency(position.token1.value_usd)}
            </span>
          </div>
        </div>
      </div>

      {/* Unclaimed Fees */}
      {position.unclaimed_fees_usd > 0 && (
        <div className="bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
          <div className="flex justify-between items-center">
            <span className="text-[#3FB950] font-semibold">Unclaimed Fees</span>
            <span className="text-[#3FB950] font-bold text-xl">
              {formatCurrency(position.unclaimed_fees_usd)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Perpetual Position Card
function PerpCard({ position, index }: { position: any; index: number }) {
  const isProfitable = position.pnl_usd >= 0;
  const isLong = position.side === "Long";
  
  return (
    <div className={`bg-[#161B22] rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-l-4 ${isLong ? 'border-[#3FB950]' : 'border-[#F85149]'}`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          {isLong ? (
            <TrendingUp className="w-6 h-6 text-[#3FB950]" />
          ) : (
            <TrendingDown className="w-6 h-6 text-[#F85149]" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-[#E6EDF3]">
                {position.position_name}
              </h3>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                isLong ? 'bg-[#1C2128] text-[#3FB950] border border-[#3FB950]' : 'bg-[#1C2128] text-[#F85149] border border-[#F85149]'
              }`}>
                {position.side.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-[#8B949E]">
              {position.protocol} • {position.chain.toUpperCase()}
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-sm text-[#8B949E]">P&L</p>
          <p className={`text-2xl font-bold ${isProfitable ? 'text-[#3FB950]' : 'text-[#F85149]'}`}>
            {isProfitable ? '+' : ''}{formatCurrency(position.pnl_usd)}
          </p>
        </div>
      </div>

      {/* Position Details Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-[#1C2128] rounded-lg p-3 border border-[#21262D]">
          <p className="text-xs text-[#8B949E] mb-1">Position Size</p>
          <p className="font-semibold text-[#E6EDF3]">
            {formatTokenAmount(position.position_size)} {position.base_token.symbol}
          </p>
          <p className="text-xs text-[#8B949E]">
            {formatCurrency(position.position_value_usd)}
          </p>
        </div>

        <div className="bg-[#1C2128] rounded-lg p-3 border border-[#21262D]">
          <p className="text-xs text-[#8B949E] mb-1">Leverage</p>
          <p className="font-semibold text-[#E6EDF3]">{position.leverage.toFixed(2)}x</p>
          <p className="text-xs text-[#8B949E]">
            Margin: {formatCurrency(position.margin_token.value_usd)}
          </p>
        </div>

        <div className="bg-[#1C2128] rounded-lg p-3 border border-[#21262D]">
          <p className="text-xs text-[#8B949E] mb-1">Entry Price</p>
          <p className="font-semibold text-[#E6EDF3]">{formatCurrency(position.entry_price)}</p>
        </div>

        <div className="bg-[#1C2128] rounded-lg p-3 border border-[#21262D]">
          <p className="text-xs text-[#8B949E] mb-1">Mark Price</p>
          <p className="font-semibold text-[#E6EDF3]">{formatCurrency(position.mark_price)}</p>
        </div>
      </div>

      {/* Liquidation Warning */}
      <div className="bg-[#1C2128] border border-[#F59E0B] rounded-lg p-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#F59E0B] font-medium">Liquidation Price</span>
          <span className="text-sm font-bold text-[#F59E0B]">
            {formatCurrency(position.liquidation_price)}
          </span>
        </div>
      </div>
    </div>
  );
}