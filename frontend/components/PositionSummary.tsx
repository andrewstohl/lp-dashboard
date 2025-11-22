import { WalletData } from '@/lib/types';

interface PositionSummaryProps {
  data: WalletData;
}

export default function PositionSummary({ data }: PositionSummaryProps) {
  const totalValue = data.positions.reduce((sum, pos) => sum + pos.total_value_usd, 0);
  const totalFees = data.positions.reduce((sum, pos) => sum + pos.daily_fee_24h, 0);

  const formatUSD = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Portfolio Summary</h2>
        {data.cached && (
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
            {data.is_stale ? '⚠️ Stale Cache' : '🚀 Cached'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Positions */}
        <div className="bg-gradient-to-br from-blue-50 to-primary-50 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-600 mb-1">Active Positions</p>
          <p className="text-3xl font-bold text-primary-700">{data.positions.length}</p>
        </div>

        {/* Total Value */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-600 mb-1">Total Value</p>
          <p className="text-3xl font-bold text-green-700">{formatUSD(totalValue)}</p>
        </div>

        {/* 24h Fees */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-600 mb-1">24h Fees</p>
          <p className="text-3xl font-bold text-purple-700">{formatUSD(totalFees)}</p>
        </div>
      </div>

      {/* Wallet Address */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-1">Wallet Address</p>
        <p className="text-sm font-mono text-gray-700 break-all">{data.wallet}</p>
      </div>
    </div>
  );
}
