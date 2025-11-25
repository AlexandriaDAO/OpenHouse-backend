import React, { useState } from 'react';
import { useStatsData, Period } from './useStatsData';
import { SharePriceChart, PoolReserveChart, VolumeChart, ProfitLossChart } from './StatsCharts';

export const DiceStatistics: React.FC = () => {
  // State for UI toggle
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Custom hook handles data fetching, transformation, and state
  const { 
    period, 
    setPeriod, 
    isLoading, 
    error, 
    chartData, 
    apy7, 
    apy30,
    hasData 
  } = useStatsData(isExpanded);

  return (
    <div className="card p-1 mt-6 bg-gray-900/40 border border-gray-700/50 overflow-hidden">
      {/* Toggle Button - Improved with ARIA */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Hide pool statistics' : 'Show pool statistics'}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-dfinity-turquoise/10 hover:bg-dfinity-turquoise/20 text-dfinity-turquoise rounded-t font-mono text-sm transition-colors duration-200"
      >
        <span className="text-lg">{isExpanded ? '📉' : '📈'}</span>
        <span className="font-bold tracking-wide uppercase">{isExpanded ? 'Hide' : 'View'} Pool Performance</span>
      </button>

      {/* Expanded Content with Fade In */}
      {isExpanded && (
        <div className="p-4 space-y-6 animate-[fadeIn_0.3s_ease-in-out]">
          
          {/* Header Controls */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
            <h3 className="text-gray-400 text-xs uppercase tracking-widest font-bold">
              Historical Performance
              {hasData && (
                <span className="ml-2 font-normal text-gray-600 lowercase">
                   ({chartData[0]?.dateLabel} - {chartData[chartData.length - 1]?.dateLabel})
                </span>
              )}
            </h3>
            
            {/* Period Selector */}
            <div className="flex bg-black/30 p-1 rounded-lg">
              {([7, 30, 90] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-1 rounded-md font-mono text-xs transition-all duration-200 ${
                    period === p
                      ? 'bg-dfinity-turquoise text-white shadow-lg shadow-dfinity-turquoise/20'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  {p}D
                </button>
              ))}
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
              <div className="w-6 h-6 border-2 border-dfinity-turquoise border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-mono animate-pulse">Loading chain data...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
              <p className="text-red-400 text-sm mb-2">Unable to load statistics</p>
              <p className="text-xs text-red-500/70 font-mono">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && !hasData && (
            <div className="text-center py-12 bg-black/20 rounded-xl border border-dashed border-gray-800">
              <p className="text-gray-400 text-sm mb-2">Not enough data yet</p>
              <p className="text-xs text-gray-600 max-w-md mx-auto">
                The pool needs at least 3 days of activity to generate meaningful charts. 
                Check back soon!
              </p>
            </div>
          )}

          {/* Content Grid */}
          {!isLoading && !error && hasData && (
            <>
              {/* APY Cards */}
              {apy7 && apy30 && (
                <div className="grid grid-cols-2 gap-4">
                  <ApyCard label="7-Day APY" info={apy7} />
                  <ApyCard label="30-Day APY" info={apy30} />
                </div>
              )}

              {/* Charts Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Share Price - Full Width */}
                <div className="md:col-span-2">
                  <SharePriceChart data={chartData} height={250} />
                </div>

                {/* Secondary Metrics */}
                <PoolReserveChart data={chartData} />
                <VolumeChart data={chartData} />
                
                {/* Profit/Loss - Full Width */}
                <div className="md:col-span-2">
                  <ProfitLossChart data={chartData} height={180} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Helper Component for APY Display
const ApyCard: React.FC<{ label: string; info: any }> = ({ label, info }) => {
  const isPositive = info.actual_apy_percent >= 0;
  return (
    <div className="bg-black/20 border border-white/5 rounded-lg p-4 flex flex-col items-center hover:border-white/10 transition-colors">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-mono font-bold ${isPositive ? 'text-dfinity-green' : 'text-dfinity-red'}`}>
        {isPositive ? '+' : ''}{info.actual_apy_percent.toFixed(2)}%
      </div>
      <div className="text-[10px] text-gray-600 mt-1">
        Expected: {info.expected_apy_percent.toFixed(2)}%
      </div>
    </div>
  );
};

export default DiceStatistics;
