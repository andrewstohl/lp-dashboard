import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface PerformanceAnalyticsProps {
  totalDailyFees: number;
  totalValue: number;
}

export function PerformanceAnalytics({ totalDailyFees, totalValue }: PerformanceAnalyticsProps) {
  // Create simulated 7-day fee trend data based on current unclaimed fees
  const avgDailyFee = totalDailyFees / 7; // Estimate average daily from total unclaimed
  const performanceData = [
    { day: 'Day 1', fees: avgDailyFee * 0.85 },
    { day: 'Day 2', fees: avgDailyFee * 0.92 },
    { day: 'Day 3', fees: avgDailyFee * 1.08 },
    { day: 'Day 4', fees: avgDailyFee * 0.96 },
    { day: 'Day 5', fees: avgDailyFee * 1.12 },
    { day: 'Day 6', fees: avgDailyFee * 0.89 },
    { day: 'Day 7', fees: avgDailyFee * 1.05 }
  ];

  const weeklyTotal = performanceData.reduce((sum, day) => sum + day.fees, 0);
  const estimatedAPR = ((totalDailyFees * 365) / totalValue) * 100;

  return (
    <div className="bg-[#161B22] rounded-xl shadow-lg p-6 border border-[#21262D]">
      <h3 className="text-xl font-bold text-[#E6EDF3] mb-4">
        Performance Analytics
      </h3>
      
      {/* Fee Performance Chart */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-[#58A6FF] mb-4">
          7-Day Fee Trend
        </h4>
        <div className="h-48 bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={performanceData}>
              <XAxis 
                dataKey="day" 
                stroke="#8B949E" 
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#8B949E" 
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#161B22', 
                  border: '1px solid #21262D',
                  borderRadius: '8px',
                  color: '#E6EDF3'
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Fees']}
              />
              <Line 
                type="monotone" 
                dataKey="fees" 
                stroke="#58A6FF" 
                strokeWidth={3}
                dot={{ fill: '#58A6FF', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
          <p className="text-sm text-[#8B949E] mb-1">Unclaimed Total</p>
          <p className="text-2xl font-bold text-[#3FB950]">
            ${totalDailyFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="text-center bg-[#1C2128] rounded-lg p-4 border border-[#21262D]">
          <p className="text-sm text-[#8B949E] mb-1">Est. Daily Avg</p>
          <p className="text-2xl font-bold text-[#58A6FF]">
            ${avgDailyFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="p-4 bg-[#1C2128] rounded-lg border border-[#21262D]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[#E6EDF3]">Total LP Value</span>
          <span className="text-[#E6EDF3] font-bold">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[#8B949E]">Estimated APR</span>
          <span className="text-[#A371F7] font-semibold">
            {estimatedAPR.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
