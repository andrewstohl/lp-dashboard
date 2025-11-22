import { PerpetualPosition, formatCurrency, formatTokenAmount, formatPercentage } from "@/lib/api";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PerpetualPositionCardProps {
  position: PerpetualPosition;
}

export function PerpetualPositionCard({ position }: PerpetualPositionCardProps) {
  const isProfitable = position.pnl_usd >= 0;
  const isLong = position.side === "Long";
  const pnlPercentage = (position.pnl_usd / (position.total_value_usd - position.pnl_usd)) * 100;
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {isLong ? (
              <TrendingUp className="w-5 h-5 text-green-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )}
            <h3 className="text-xl font-bold text-gray-900">
              {position.position_name}
            </h3>
            <span className={cn(
              "px-2 py-1 rounded text-xs font-bold",
              isLong ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            )}>
              {position.side.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-gray-500">{position.protocol} • {position.chain.toUpperCase()}</p>
        </div>
        
        <div className="text-right">
          <p className={cn(
            "text-2xl font-bold",
            isProfitable ? "text-green-600" : "text-red-600"
          )}>
            {isProfitable ? "+" : ""}{formatCurrency(position.pnl_usd)}
          </p>
          <p className={cn(
            "text-sm font-medium",
            isProfitable ? "text-green-600" : "text-red-600"
          )}>
            {isProfitable ? "+" : ""}{formatPercentage(pnlPercentage)}
          </p>
        </div>
      </div>

      {/* Position Details Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Position Size */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Position Size</p>
          <p className="font-semibold text-gray-900">
            {formatTokenAmount(position.position_size)} {position.base_token.symbol}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatCurrency(position.position_value_usd)}
          </p>
        </div>

        {/* Leverage */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Leverage</p>
          <p className="font-semibold text-gray-900">{position.leverage.toFixed(2)}x</p>
          <p className="text-xs text-gray-500 mt-1">
            Margin: {formatCurrency(position.margin_token.value_usd)}
          </p>
        </div>

        {/* Entry Price */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Entry Price</p>
          <p className="font-semibold text-gray-900">{formatCurrency(position.entry_price)}</p>
        </div>

        {/* Mark Price */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Mark Price</p>
          <p className="font-semibold text-gray-900">{formatCurrency(position.mark_price)}</p>
        </div>
      </div>

      {/* Liquidation Warning */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <div className="flex-1">
            <p className="text-xs text-yellow-800 font-medium">Liquidation Price</p>
            <p className="text-sm font-bold text-yellow-900">
              {formatCurrency(position.liquidation_price)}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex gap-2">
        <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          View Details
        </button>
        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
          Adjust
        </button>
      </div>
    </div>
  );
}
