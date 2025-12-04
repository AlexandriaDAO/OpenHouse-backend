import { GameType } from '../../types/balance';
import { useStatsData, Period } from '../../hooks/liquidity/useStatsData';
import { SharePriceChart, PoolReserveChart, VolumeChart, ProfitLossChart } from './StatsCharts';
import { ApyCard } from './ApyCard';

interface Props {
  gameId: GameType;
}

export function GameStatistics({ gameId }: Props) {
  const {
    period, setPeriod,
    isLoading, error,
    chartData, apy7, apy30,
    hasData
  } = useStatsData(gameId, true);

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
        <h3 className="text-gray-400 text-xs uppercase tracking-widest font-bold">
          Historical Performance
        </h3>
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
      {apy7 && apy30 && (
        <div className="grid grid-cols-2 gap-4">
          <ApyCard label="7-Day APY" info={apy7} />
          <ApyCard label="30-Day APY" info={apy30} />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <SharePriceChart data={chartData} height={250} />
        </div>
        <PoolReserveChart data={chartData} />
        <VolumeChart data={chartData} />
        <div className="md:col-span-2">
          <ProfitLossChart data={chartData} height={180} />
        </div>
      </div>
    </div>
  );
}
