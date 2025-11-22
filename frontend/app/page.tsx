'use client';

import { useState } from 'react';
import WalletInput from '@/components/WalletInput';
import PositionCard from '@/components/PositionCard';
import PositionSummary from '@/components/PositionSummary';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import { getWalletPositions } from '@/lib/api';
import { WalletData, ApiError } from '@/lib/types';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (address: string) => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await getWalletPositions(address);
      setData(response.data);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-gray-900 mb-4">
          Analyze Your Uniswap v3 Positions
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Track your liquidity provider positions, monitor fees, and optimize your DeFi strategy
          with real-time analytics
        </p>
      </div>

      {/* Wallet Input */}
      <WalletInput onSubmit={handleSubmit} loading={loading} />

      {/* Loading State */}
      {loading && <LoadingSpinner />}

      {/* Error State */}
      {error && <ErrorMessage error={error} />}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Summary */}
          <PositionSummary data={data} />

          {/* Empty State */}
          {data.positions.length === 0 && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-12 text-center">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No Active Positions Found
              </h3>
              <p className="text-gray-600">
                This wallet doesn't have any active Uniswap v3 liquidity positions.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Try a different wallet address or check back later.
              </p>
            </div>
          )}

          {/* Positions Grid */}
          {data.positions.length > 0 && (
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Active Positions ({data.positions.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.positions.map((position, index) => (
                  <PositionCard key={index} position={position} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Features Section (shown when no data) */}
      {!data && !loading && !error && (
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-4xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-time Data</h3>
            <p className="text-sm text-gray-600">
              Get instant access to your Uniswap v3 positions with cached data for lightning-fast
              responses
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-4xl mb-3">📊</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Detailed Analytics</h3>
            <p className="text-sm text-gray-600">
              View token amounts, USD values, fees earned, and comprehensive pool information
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure & Private</h3>
            <p className="text-sm text-gray-600">
              Read-only access to public blockchain data. No wallet connection or private keys
              required
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
