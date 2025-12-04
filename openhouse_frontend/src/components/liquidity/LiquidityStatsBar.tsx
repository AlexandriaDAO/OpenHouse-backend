import { PoolStats, ApyInfo } from '../../types/liquidity';
import { GameTheme } from '../../config/gameRegistry';
import { InfoTooltip } from '../InfoTooltip';
import { DECIMALS_PER_CKUSDT } from '../../types/balance';

interface Props {
  poolStats: PoolStats | null;
  apy7: ApyInfo | null;
  apyLoading: boolean;
  apyError: string | null;
  theme: GameTheme;
}

export function LiquidityStatsBar({ poolStats, apy7, apyLoading, apyError, theme }: Props) {
  const formatValue = (val: bigint) => (Number(val) / DECIMALS_PER_CKUSDT).toFixed(2);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 border-b border-gray-700/50 bg-black/20">
      <div className="p-4 text-center border-b md:border-b-0 md:border-r border-gray-700/50">
        <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Total House Funds</div>
        <div className="text-xl md:text-2xl font-bold text-white">
          ${poolStats ? formatValue(poolStats.pool_reserve) : '---'}
        </div>
      </div>
      <div className="p-4 text-center border-b md:border-b-0 md:border-r border-gray-700/50">
        <div className="text-gray-500 text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
          Share Price
          <InfoTooltip content="Share price in micro-USDT (1 μUSDT = 0.000001 USDT). Calculated as Pool Value ÷ Total Shares. Trends upward as house profits." />
        </div>
        <div className={`text-xl md:text-2xl font-mono font-bold text-${theme.accent}`}>
          {poolStats ? ((Number(poolStats.share_price) / 100_000_000) * 1_000_000).toFixed(2) : '---'} μUSDT
        </div>
      </div>
      <div className="p-4 text-center">
        <div className="text-gray-500 text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
          7-Day APY
          <InfoTooltip content="Annual Percentage Yield based on last 7 days of pool performance. Reflects actual returns vs theoretical 1% house edge." />
        </div>
        <div className={`text-xl md:text-2xl font-mono font-bold ${
          apyLoading ? 'text-gray-600' :
          apyError ? 'text-red-500' :
          apy7 && apy7.actual_apy_percent >= 0 ? 'text-green-400' : 'text-red-400'
        }`}>
          {apyLoading ? '...' :
           apyError ? '⚠️' :
           apy7 ? `${apy7.actual_apy_percent >= 0 ? '+' : ''}${apy7.actual_apy_percent.toFixed(2)}%` :
           'N/A'}
        </div>
        {apy7 && (
          <div className="text-[10px] text-gray-600 mt-0.5 hidden md:block">
            Expected: {apy7.expected_apy_percent.toFixed(2)}%
          </div>
        )}
      </div>
    </div>
  );
}
