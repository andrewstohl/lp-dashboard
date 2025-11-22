import { Position } from '@/lib/types';

interface PositionCardProps {
  position: Position;
}

export default function PositionCard({ position }: PositionCardProps) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(num);
  };

  const formatUSD = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900">{position.pool_name}</h3>
        <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
          Uniswap v3
        </span>
      </div>

      {/* Total Value */}
      <div className="mb-4 p-4 bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg">
        <p className="text-sm text-gray-600 mb-1">Total Position Value</p>
        <p className="text-3xl font-bold text-primary-700">
          {formatUSD(position.total_value_usd)}
        </p>
      </div>

      {/* Tokens */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Token 0 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">TOKEN 0</p>
          <p className="text-lg font-bold text-gray-900 mb-1">{position.token0.symbol}</p>
          <p className="text-sm text-gray-600">{formatNumber(position.token0.amount)}</p>
          <p className="text-xs text-gray-500 mt-1">{formatUSD(position.token0.value_usd)}</p>
        </div>

        {/* Token 1 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">TOKEN 1</p>
          <p className="text-lg font-bold text-gray-900 mb-1">{position.token1.symbol}</p>
          <p className="text-sm text-gray-600">{formatNumber(position.token1.amount)}</p>
          <p className="text-xs text-gray-500 mt-1">{formatUSD(position.token1.value_usd)}</p>
        </div>
      </div>

      {/* Fees */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">24h Fees Earned</span>
          <span className="text-lg font-semibold text-green-600">
            {formatUSD(position.daily_fee_24h)}
          </span>
        </div>
      </div>

      {/* Pool Address */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-500">Pool Address</p>
        <p className="text-xs font-mono text-gray-600 truncate mt-1">
          {position.pool_address}
        </p>
      </div>
    </div>
  );
}
