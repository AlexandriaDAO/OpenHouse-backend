import { LPPosition } from '../../types/liquidity';
import { GameTheme } from '../../config/gameRegistry';
import { DECIMALS_PER_CKUSDT } from '../../types/balance';

interface Props {
  position: LPPosition;
  theme: GameTheme;
}

export function LiquidityPosition({ position, theme }: Props) {
  const formatValue = (val: bigint) => (Number(val) / DECIMALS_PER_CKUSDT).toFixed(2);

  return (
    <div className={`mb-6 p-4 bg-${theme.primary}/10 border border-${theme.primary}/20 rounded-xl flex justify-between items-center`}>
      <div>
        <div className={`text-${theme.primary} text-sm font-bold uppercase tracking-wider`}>Your Position</div>
        <div className="text-gray-400 text-xs">
          {position.pool_ownership_percent.toFixed(4)}% ownership
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold text-white">
          ${formatValue(position.redeemable_amount)}
        </div>
      </div>
    </div>
  );
}
