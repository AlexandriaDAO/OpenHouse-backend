import { useState } from 'react';
import { GameType } from '../../types/balance';
import { useStatsData, Period } from '../../hooks/liquidity/useStatsData';
import { SharePriceChart, PoolReserveChart, VolumeChart, NetFlowChart, HouseProfitChart } from './StatsCharts';
import { ApyCard } from './ApyCard';

interface Props {
  gameId: GameType;
}

export function GameStatistics({ gameId }: Props) {
  const {
    period, setPeriod,
    isLoading, error,
    chartData, apy7, apy30, accurateApy,
    hasData
  } = useStatsData(gameId, true);

  const [copied, setCopied] = useState(false);

  const handleCopyData = async () => {
    const data = {
      period,
      apy7,
      apy30,
      chartData: chartData.map(d => ({
        ...d,
        date: d.date.toISOString()
      }))
    };
    // BigInt can't be serialized directly, convert to string
    const jsonStr = JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);

    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
    } catch (err) {
      // Fallback: create a temporary textarea and copy from it
      const textarea = document.createElement('textarea');
      textarea.value = jsonStr;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      console.log('Chart data copied (fallback method)');
    }

    setTimeout(() => setCopied(false), 1500);
  };

  // Render loading/error/empty states
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
        <div className="w-6 h-6 border-2 border-dfinity-turquoise border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-mono animate-pulse">Loading chain data...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
        <p className="text-red-400 text-sm mb-2">Unable to load statistics</p>
        <p className="text-xs text-red-500/70 font-mono">{error}</p>
      </div>
    );
  }
  
  if (!hasData) {
    return (
      <div className="text-center py-12 bg-black/20 rounded-xl border border-dashed border-gray-800">
        <p className="text-gray-400 text-sm mb-2">No data yet</p>
        <p className="text-xs text-gray-600 max-w-md mx-auto">
          The pool needs at least one day of activity to generate charts.
          Check back tomorrow!
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Period selector */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-gray-400 text-xs uppercase tracking-widest font-bold">
            Historical Performance
          </h3>
          <button
            onClick={handleCopyData}
            className="text-gray-600 hover:text-gray-400 transition-colors p-1 rounded"
            title="Copy chart data as JSON"
          >
            {copied ? (
              <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex bg-black/30 p-1 rounded-lg">
          {([7, 30, 90] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1 rounded-md font-mono text-xs transition ${
                period === p
                  ? 'bg-dfinity-turquoise text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {p}D
            </button>
          ))}
        </div>
      </div>

      {/* APY Cards */}
      {apy7 && apy30 && accurateApy && (
        <div className="grid grid-cols-2 gap-4">
          <ApyCard 
            label="7-Day APY" 
            accurateApy={accurateApy.apy7} 
            backendApy={apy7} 
          />
          <ApyCard 
            label="30-Day APY" 
            accurateApy={accurateApy.apy30} 
            backendApy={apy30} 
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Share Price - PRIMARY (shows true performance) */}
        <div className="md:col-span-2">
          <SharePriceChart data={chartData} height={250} />
        </div>

        {/* House Profit - NEW (derived from share price) */}
        <div className="md:col-span-2">
          <HouseProfitChart data={chartData} height={180} />
        </div>

        {/* Supporting metrics */}
        <PoolReserveChart data={chartData} />
        <VolumeChart data={chartData} />

        {/* Net Flow - RENAMED (was "Profit/Loss") */}
        <div className="md:col-span-2">
          <NetFlowChart data={chartData} height={160} />
        </div>
      </div>
    </div>
  );
}
