"use client";

import { useState } from "react";
import { getWalletPositions, formatCurrency, formatPercentage, formatTokenAmount, type Position, isLPPosition, isPerpetualPosition } from "@/lib/api";
import { Wallet, TrendingUp, TrendingDown, Coins, RefreshCw, Search } from "lucide-react";

export default function ProfessionalDashboard() {
  const [walletAddress, setWalletAddress] = useState("");
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

  // Calculate portfolio metrics
  const totalValue = positions.reduce((sum, pos) => sum + pos.total_value_usd, 0);
  const lpPositions = positions.filter(isLPPosition);
  const perpPositions = positions.filter(isPerpetualPosition);
  
  const totalDailyFees = lpPositions.reduce((sum, pos) => {
    return sum + (pos.unclaimed_fees_usd || 0);
  }, 0);
  
  const totalPnL = perpPositions.reduce((sum, pos) => sum + pos.pnl_usd, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Wallet className="w-10 h-10 text-blue-600" />
              <h1 className="text-4xl font-bold text-gray-900">
                DeFi Portfolio Intelligence
              </h1>
            </div>
            <p className="text-gray-600">
              Powered by DeBank API - Real DeFi Data
            </p>
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
                  className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
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
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-gray-600">Loading positions...</p>
            </div>
          </div>
        )}

        {/* Portfolio Overview */}
        {!loading && hasSearched && positions.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  Portfolio Overview
                </h2>
                {lastUpdated && (
                  <span className="text-sm text-gray-500">
                    Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                  <p className="text-sm text-green-700 mb-1 font-medium">Total Value</p>
                  <p className="text-3xl font-bold text-green-900">
                    {formatCurrency(totalValue)}
                  </p>
                </div>
                
                <div className="text-center bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                  <p className="text-sm text-blue-700 mb-1 font-medium">Unclaimed Fees</p>
                  <p className="text-3xl font-bold text-blue-900">
                    {formatCurrency(totalDailyFees)}
                  </p>
                </div>
                
                <div className="text-center bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                  <p className="text-sm text-purple-700 mb-1 font-medium">Perps P&L</p>
                  <p className={`text-3xl font-bold ${totalPnL >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                    {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
                  </p>
                </div>
                
                <div className="text-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4">
                  <p className="text-sm text-gray-700 mb-1 font-medium">Total Positions</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {positions.length}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {lpPositions.length} LP • {perpPositions.length} Perps
                  </p>
                </div>
              </div>
            </div>

            {/* Position Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {positions.map((position, index) => (
                <PositionCard key={index} position={position} index={index} />
              ))}
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && hasSearched && positions.length === 0 && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No positions found
            </h3>
            <p className="text-gray-600">
              This wallet doesn't have any DeFi positions.
            </p>
          </div>
        )}

        {/* Initial State */}
        {!hasSearched && !loading && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Enter a wallet address to get started
            </h3>
            <p className="text-gray-600">
              View LP positions and perpetuals across DeFi protocols
            </p>
          </div>
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
    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-l-4 border-blue-500">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <Coins className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {position.pool_name}
            </h3>
            <p className="text-xs text-gray-500">
              {position.chain.toUpperCase()} • {position.pool_address.slice(0, 6)}...{position.pool_address.slice(-4)}
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-sm text-gray-600">Total Value</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(position.total_value_usd)}
          </p>
        </div>
      </div>

      {/* Token Details */}
      <div className="space-y-3 mb-4 bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">{position.token0.symbol}</span>
          <div className="text-right">
            <span className="font-semibold text-gray-900">{formatTokenAmount(position.token0.amount)}</span>
            <span className="text-sm text-gray-500 ml-2">
              {formatCurrency(position.token0.value_usd)}
            </span>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
          <span className="text-gray-700 font-medium">{position.token1.symbol}</span>
          <div className="text-right">
            <span className="font-semibold text-gray-900">{formatTokenAmount(position.token1.amount)}</span>
            <span className="text-sm text-gray-500 ml-2">
              {formatCurrency(position.token1.value_usd)}
            </span>
          </div>
        </div>
      </div>

      {/* Unclaimed Fees */}
      {position.unclaimed_fees_usd > 0 && (
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-green-800 font-semibold">Unclaimed Fees</span>
            <span className="text-green-900 font-bold text-xl">
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
    <div className={`bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-l-4 ${isLong ? 'border-green-500' : 'border-red-500'}`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          {isLong ? (
            <TrendingUp className="w-6 h-6 text-green-600" />
          ) : (
            <TrendingDown className="w-6 h-6 text-red-600" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-gray-900">
                {position.position_name}
              </h3>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                isLong ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {position.side.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {position.protocol} • {position.chain.toUpperCase()}
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-sm text-gray-600">P&L</p>
          <p className={`text-2xl font-bold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
            {isProfitable ? '+' : ''}{formatCurrency(position.pnl_usd)}
          </p>
        </div>
      </div>

      {/* Position Details Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Position Size</p>
          <p className="font-semibold text-gray-900">
            {formatTokenAmount(position.position_size)} {position.base_token.symbol}
          </p>
          <p className="text-xs text-gray-500">
            {formatCurrency(position.position_value_usd)}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Leverage</p>
          <p className="font-semibold text-gray-900">{position.leverage.toFixed(2)}x</p>
          <p className="text-xs text-gray-500">
            Margin: {formatCurrency(position.margin_token.value_usd)}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Entry Price</p>
          <p className="font-semibold text-gray-900">{formatCurrency(position.entry_price)}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Mark Price</p>
          <p className="font-semibold text-gray-900">{formatCurrency(position.mark_price)}</p>
        </div>
      </div>

      {/* Liquidation Warning */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-yellow-800 font-medium">Liquidation Price</span>
          <span className="text-sm font-bold text-yellow-900">
            {formatCurrency(position.liquidation_price)}
          </span>
        </div>
      </div>
    </div>
  );
}