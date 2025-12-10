import { useState } from 'react';
import { GameType, DECIMALS_PER_CKUSDT } from '../types/balance';
import { getLiquidityGames, GameConfig } from '../config/gameRegistry';
import { useAuth } from '../providers/AuthProvider';
import { usePoolStats } from '../hooks/liquidity/usePoolStats';
import { useApyData } from '../hooks/liquidity/useApyData';
import { GameLiquidity } from '../components/liquidity/GameLiquidity';

// Color map for dynamic classes (Tailwind can't detect template literals)
const themeColors: Record<string, { border: string; bg: string; text: string; selectedBg: string; badge: string }> = {
  'dfinity-turquoise': {
    border: 'border-dfinity-turquoise',
    bg: 'bg-dfinity-turquoise/10',
    text: 'text-dfinity-turquoise',
    selectedBg: 'bg-dfinity-turquoise/20',
    badge: 'bg-dfinity-turquoise/20 text-dfinity-turquoise',
  },
  'orange-500': {
    border: 'border-orange-500',
    bg: 'bg-orange-500/10',
    text: 'text-orange-500',
    selectedBg: 'bg-orange-500/20',
    badge: 'bg-orange-500/20 text-orange-500',
  },
  'green-500': {
    border: 'border-green-500',
    bg: 'bg-green-500/10',
    text: 'text-green-500',
    selectedBg: 'bg-green-500/20',
    badge: 'bg-green-500/20 text-green-500',
  },
};

// Mini card component for game selection
function GamePoolCard({
  config,
  isSelected,
  onSelect
}: {
  config: GameConfig;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { poolStats } = usePoolStats(config.id);
  const { apy7 } = useApyData(config.id);
  const { theme } = config;
  const colors = themeColors[theme.primary] || themeColors['dfinity-turquoise'];

  const formatValue = (val: bigint) => (Number(val) / DECIMALS_PER_CKUSDT).toFixed(2);

  return (
    <button
      onClick={onSelect}
      className={`
        p-4 rounded-xl border-2 transition-all duration-200 text-left w-full
        ${isSelected
          ? `${colors.border} ${colors.bg}`
          : 'border-gray-700 bg-gray-900/60 hover:border-gray-500 hover:bg-gray-800/60'
        }
      `}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{config.icon}</span>
        <span className={`font-bold text-lg ${isSelected ? colors.text : 'text-white'}`}>
          {config.name}
        </span>
        {isSelected && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>
            Selected
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-gray-500 text-xs">Pool Size</div>
          <div className="text-white font-mono">
            ${poolStats ? formatValue(poolStats.pool_reserve) : '---'}
          </div>
        </div>
        <div>
          <div className="text-gray-500 text-xs">7-Day APY</div>
          <div className={`font-mono ${
            apy7 && apy7.actual_apy_percent >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {apy7 ? `${apy7.actual_apy_percent >= 0 ? '+' : ''}${apy7.actual_apy_percent.toFixed(2)}%` : '---'}
          </div>
        </div>
      </div>
    </button>
  );
}

// Aggregated stats across all pools
function AggregatedStats() {
  const liquidityGames = getLiquidityGames();

  // Fetch stats for all games
  const diceStats = usePoolStats('dice');
  const plinkoStats = usePoolStats('plinko');
  const rouletteStats = usePoolStats('roulette');

  const diceApy = useApyData('dice');
  const plinkoApy = useApyData('plinko');
  const rouletteApy = useApyData('roulette');

  // Calculate totals
  const totalPoolSize = [diceStats, plinkoStats, rouletteStats]
    .reduce((sum, s) => sum + (s.poolStats ? Number(s.poolStats.pool_reserve) : 0), 0);

  const totalProviders = [diceStats, plinkoStats, rouletteStats]
    .reduce((sum, s) => sum + (s.poolStats ? Number(s.poolStats.total_liquidity_providers) : 0), 0);

  // Average APY (only include games with data)
  const apyValues = [diceApy, plinkoApy, rouletteApy]
    .filter(a => a.apy7)
    .map(a => a.apy7!.actual_apy_percent);
  const avgApy = apyValues.length > 0
    ? apyValues.reduce((sum, v) => sum + v, 0) / apyValues.length
    : null;

  const formatValue = (val: number) => (val / DECIMALS_PER_CKUSDT).toFixed(2);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 text-center">
        <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Total Value Locked</div>
        <div className="text-2xl font-bold text-white font-mono">
          ${formatValue(totalPoolSize)}
        </div>
        <div className="text-xs text-gray-600 mt-1">Across {liquidityGames.length} pools</div>
      </div>

      <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 text-center">
        <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Average 7-Day APY</div>
        <div className={`text-2xl font-bold font-mono ${
          avgApy !== null && avgApy >= 0 ? 'text-green-400' : 'text-red-400'
        }`}>
          {avgApy !== null ? `${avgApy >= 0 ? '+' : ''}${avgApy.toFixed(2)}%` : '---'}
        </div>
        <div className="text-xs text-gray-600 mt-1">1% theoretical edge</div>
      </div>

      <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 text-center">
        <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Total Providers</div>
        <div className="text-2xl font-bold text-purple-400 font-mono">
          {totalProviders}
        </div>
        <div className="text-xs text-gray-600 mt-1">Liquidity providers</div>
      </div>
    </div>
  );
}

export function Liquidity() {
  const { isAuthenticated } = useAuth();
  const liquidityGames = getLiquidityGames();

  // Default to first game (dice)
  const [selectedGame, setSelectedGame] = useState<GameType>(liquidityGames[0]?.id || 'dice');

  return (
    <div className="min-h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">
              LIQUIDITY <span className="text-dfinity-turquoise">POOLS</span>
            </h1>
            <p className="text-gray-400 text-sm max-w-lg mx-auto">
              Become the house across multiple games. Provide liquidity, earn the 1% house edge,
              and track your returns in real-time.
            </p>
          </div>
        </div>

        {/* Aggregated Stats */}
        <AggregatedStats />

        {/* Game Selection */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
            Select a Pool
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {liquidityGames.map(config => (
              <GamePoolCard
                key={config.id}
                config={config}
                isSelected={selectedGame === config.id}
                onSelect={() => setSelectedGame(config.id)}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700/50 my-8" />

        {/* Selected Game Liquidity Panel */}
        <div className="bg-gray-900/30 rounded-2xl border border-gray-700/30 overflow-hidden">
          <GameLiquidity gameId={selectedGame} />
        </div>
      </div>
    </div>
  );
}
