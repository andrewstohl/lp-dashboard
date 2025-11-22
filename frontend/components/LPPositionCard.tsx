import { LPPosition, formatCurrency, formatTokenAmount } from "@/lib/api";
import { TrendingUp, TrendingDown, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface LPPositionCardProps {
  position: LPPosition;
}

export function LPPositionCard({ position }: LPPositionCardProps) {
  const hasUnclaimed = position.unclaimed_fees_usd > 0;
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Coins className="w-5 h-5 text-blue-600" />
            <h3 className="text-xl font-bold text-gray-900">
              {position.pool_name}
            </h3>
          </div>
          <p className="text-sm text-gray-500">{position.chain.toUpperCase()}</p>
        </div>
        
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(position.total_value_usd)}
          </p>
          {hasUnclaimed && (
            <p className="text-sm text-green-600 font-medium">
              +{formatCurrency(position.unclaimed_fees_usd)} fees
            </p>
          )}
        </div>
      </div>

      {/* Token Details */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Token 0 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Token 0</p>
          <p className="font-semibold text-gray-900">{position.token0.symbol}</p>
          <p className="text-sm text-gray-600 mt-1">
            {formatTokenAmount(position.token0.amount)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatCurrency(position.token0.value_usd)}
          </p>
        </div>

        {/* Token 1 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Token 1</p>
          <p className="font-semibold text-gray-900">{position.token1.symbol}</p>
          <p className="text-sm text-gray-600 mt-1">
            {formatTokenAmount(position.token1.amount)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatCurrency(position.token1.value_usd)}
          </p>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex gap-2">
        <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          View Details
        </button>
        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
          Refresh
        </button>
      </div>
    </div>
  );
}
