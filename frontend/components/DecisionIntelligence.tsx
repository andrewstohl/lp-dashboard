import { type Position, isLPPosition, isPerpetualPosition } from "@/lib/api";

interface DecisionIntelligenceProps {
  positions: Position[];
  totalValue: number;
  totalFees: number;
  lpCount: number;
  perpCount: number;
}

export function DecisionIntelligence({ positions, totalValue, totalFees, lpCount, perpCount }: DecisionIntelligenceProps) {
  const lpPositions = positions.filter(isLPPosition);
  const perpPositions = positions.filter(isPerpetualPosition);

  // Calculate overall metrics
  const lpTotalValue = lpPositions.reduce((sum, pos) => sum + pos.total_value_usd, 0);
  const estimatedAPR = lpTotalValue > 0 ? ((totalFees * 365) / lpTotalValue) * 100 : 0;

  return (
    <div className="bg-[#161B22] rounded-xl shadow-lg p-6 border border-[#21262D]">
      <h3 className="text-xl font-bold text-[#E6EDF3] mb-4">
        Decision Intelligence
      </h3>

      {/* LP Position Analysis */}
      {lpPositions.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-[#58A6FF] mb-3">
            LP Position Analysis
          </h4>
          
          {lpPositions.map((position, index) => {
            const estimatedDailyFee = position.unclaimed_fees_usd / 7; // Estimate daily from unclaimed
            const weeklyROI = ((position.unclaimed_fees_usd) / position.total_value_usd) * 100;
            const tokenRatio = (position.token0.amount / position.token1.amount).toFixed(4);
            
            return (
              <div key={index} className="mb-4 p-4 bg-[#1C2128] rounded-lg border border-[#21262D]">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h5 className="text-lg font-semibold text-[#E6EDF3]">
                      {position.pool_name}
                    </h5>
                    <p className="text-sm text-[#8B949E]">
                      {position.pool_address.slice(0, 6)}...{position.pool_address.slice(-4)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[#8B949E]">Total Value</p>
                    <p className="text-xl font-bold text-[#3FB950]">
                      ${position.total_value_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Analysis Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Token Relationship Analysis */}
                  <div className="space-y-2">
                    <h6 className="text-sm font-semibold text-[#58A6FF]">Token Composition</h6>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">{position.token0.symbol}</span>
                        <span className="text-[#E6EDF3]">{position.token0.amount.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#8B949E]">Value</span>
                        <span className="text-[#8B949E]">${position.token0.value_usd.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-[#8B949E]">{position.token1.symbol}</span>
                        <span className="text-[#E6EDF3]">{position.token1.amount.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#8B949E]">Value</span>
                        <span className="text-[#8B949E]">${position.token1.value_usd.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-sm text-[#A371F7] mt-2">
                      Ratio: {tokenRatio} {position.token0.symbol}/{position.token1.symbol}
                    </div>
                  </div>

                  {/* Fee Performance Intelligence */}
                  <div className="space-y-2">
                    <h6 className="text-sm font-semibold text-[#58A6FF]">Fee Performance</h6>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Unclaimed Fees</span>
                        <span className="text-[#3FB950]">${position.unclaimed_fees_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Est. Daily</span>
                        <span className="text-[#58A6FF]">${estimatedDailyFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Est. Weekly</span>
                        <span className="text-[#58A6FF]">${position.unclaimed_fees_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                    <div className="text-sm text-[#A371F7] mt-2">
                      Weekly ROI: {weeklyROI.toFixed(3)}%
                    </div>
                  </div>
                </div>

                {/* Decision Points */}
                <div className="mt-4 p-3 bg-[#21262D] rounded-lg">
                  <h6 className="text-sm font-semibold text-[#A371F7] mb-2">
                    Key Decision Points
                  </h6>
                  <ul className="text-sm text-[#8B949E] space-y-1">
                    <li>• Monitor fee accumulation vs. position value ({weeklyROI.toFixed(2)}% weekly ROI)</li>
                    <li>• Track token ratio changes - currently {tokenRatio} {position.token0.symbol}/{position.token1.symbol}</li>
                    <li>• Claim ${position.unclaimed_fees_usd.toFixed(2)} in accumulated fees when gas is optimal</li>
                    {weeklyROI < 0.5 && <li className="text-[#F59E0B]">⚠ Weekly ROI below 0.5% - consider rebalancing</li>}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Perpetual Position Analysis */}
      {perpPositions.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-[#58A6FF] mb-3">
            Perpetual Position Analysis
          </h4>
          
          {perpPositions.map((position, index) => {
            const isProfitable = position.pnl_usd >= 0;
            const pnlPercentage = ((position.pnl_usd / position.margin_token.value_usd) * 100);
            const liquidationDistance = position.side === 'Long' 
              ? ((position.liquidation_price - position.mark_price) / position.mark_price) * 100
              : ((position.mark_price - position.liquidation_price) / position.mark_price) * 100;
            
            return (
              <div key={index} className="mb-4 p-4 bg-[#1C2128] rounded-lg border border-[#21262D]">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h5 className="text-lg font-semibold text-[#E6EDF3]">
                      {position.position_name}
                    </h5>
                    <p className="text-sm text-[#8B949E]">
                      {position.protocol} • {position.chain.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[#8B949E]">P&L</p>
                    <p className={`text-xl font-bold ${isProfitable ? 'text-[#3FB950]' : 'text-[#F85149]'}`}>
                      {isProfitable ? '+' : ''}${position.pnl_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className={`text-sm ${isProfitable ? 'text-[#3FB950]' : 'text-[#F85149]'}`}>
                      {pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%
                    </p>
                  </div>
                </div>

                {/* Analysis Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Position Metrics */}
                  <div className="space-y-2">
                    <h6 className="text-sm font-semibold text-[#58A6FF]">Position Metrics</h6>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Size</span>
                        <span className="text-[#E6EDF3]">{position.position_size.toFixed(4)} {position.base_token.symbol}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Leverage</span>
                        <span className="text-[#E6EDF3]">{position.leverage.toFixed(2)}x</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Margin</span>
                        <span className="text-[#E6EDF3]">${position.margin_token.value_usd.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Risk Analysis */}
                  <div className="space-y-2">
                    <h6 className="text-sm font-semibold text-[#58A6FF]">Risk Analysis</h6>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Entry Price</span>
                        <span className="text-[#E6EDF3]">${position.entry_price.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Current Price</span>
                        <span className="text-[#E6EDF3]">${position.mark_price.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8B949E]">Liquidation</span>
                        <span className="text-[#F59E0B]">${position.liquidation_price.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className={`text-sm mt-2 ${liquidationDistance < 10 ? 'text-[#F85149]' : liquidationDistance < 20 ? 'text-[#F59E0B]' : 'text-[#3FB950]'}`}>
                      {liquidationDistance.toFixed(1)}% from liquidation
                    </div>
                  </div>
                </div>

                {/* Decision Points */}
                <div className="mt-4 p-3 bg-[#21262D] rounded-lg">
                  <h6 className="text-sm font-semibold text-[#A371F7] mb-2">
                    Key Decision Points
                  </h6>
                  <ul className="text-sm text-[#8B949E] space-y-1">
                    <li>• Current P&L: {isProfitable ? '+' : ''}{pnlPercentage.toFixed(2)}% on margin</li>
                    <li>• Liquidation distance: {liquidationDistance.toFixed(1)}% {liquidationDistance < 20 ? '(monitor closely)' : '(healthy)'}</li>
                    {liquidationDistance < 10 && <li className="text-[#F85149]">⚠ CRITICAL: Consider adding margin or closing position</li>}
                    {liquidationDistance < 20 && liquidationDistance >= 10 && <li className="text-[#F59E0B]">⚠ Warning: Position close to liquidation</li>}
                    <li>• {position.side} {position.base_token.symbol} at {position.leverage.toFixed(1)}x leverage</li>
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overall Portfolio Intelligence */}
      <div className="p-4 bg-[#21262D] rounded-lg border border-[#30363D]">
        <h5 className="text-lg font-semibold text-[#A371F7] mb-3">
          Overall Portfolio Intelligence
        </h5>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h6 className="text-sm font-semibold text-[#E6EDF3] mb-2">
              Portfolio Health
            </h6>
            <p className="text-sm text-[#8B949E]">
              Total Positions: {positions.length} ({lpCount} LP • {perpCount} Perps)
            </p>
            <p className="text-sm text-[#8B949E]">
              Total Value: ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            {lpTotalValue > 0 && (
              <p className="text-sm text-[#8B949E]">
                Est. APR: {estimatedAPR.toFixed(2)}%
              </p>
            )}
          </div>
          
          <div>
            <h6 className="text-sm font-semibold text-[#E6EDF3] mb-2">
              LP Performance
            </h6>
            <p className="text-sm text-[#8B949E]">
              Unclaimed Fees: ${totalFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-[#8B949E]">
              LP Value: ${lpTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          
          <div>
            <h6 className="text-sm font-semibold text-[#E6EDF3] mb-2">
              Strategic Focus
            </h6>
            <p className="text-sm text-[#8B949E]">
              {lpCount > 0 && perpCount > 0 
                ? "Diversified strategy: LP income + Perps hedging"
                : lpCount > 0 
                ? "Focus: LP fee generation"
                : "Focus: Perpetual trading"}
            </p>
            <p className="text-sm text-[#3FB950] mt-1">
              Portfolio is actively monitored
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
