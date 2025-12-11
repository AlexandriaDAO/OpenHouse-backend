import React, { useEffect, useState } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { GAME_REGISTRY, GameConfig } from '../../config/gameRegistry';
import { LPPosition } from '../../types/liquidity';
import { decimalsToUSDT } from '../../types/ledger';
import useDiceActor from '../../hooks/actors/useDiceActor';
import usePlinkoActor from '../../hooks/actors/usePlinkoActor';
import useCrashActor from '../../hooks/actors/useCrashActor';
import useRouletteActor from '../../hooks/actors/useRouletteActor';

interface GameBalanceData {
  config: GameConfig;
  chips: bigint;
  lpShares: bigint;
  lpValue: bigint;
  loading: boolean;
}

export const GameBalancesOverview: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const gameBalance = useGameBalance();
  const { actor: diceActor } = useDiceActor();
  const { actor: plinkoActor } = usePlinkoActor();
  const { actor: crashActor } = useCrashActor();
  const { actor: rouletteActor } = useRouletteActor();

  const [gameData, setGameData] = useState<GameBalanceData[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchLPPositions = async () => {
      const liveGames = Object.values(GAME_REGISTRY).filter(g => g.status === 'live' || g.status === 'admin_only');

      const dataPromises = liveGames.map(async (config): Promise<GameBalanceData> => {
        try {
          // Get actor for this game
          let actor: any;
          switch (config.id) {
            case 'dice':
              actor = diceActor;
              break;
            case 'plinko':
              actor = plinkoActor;
              break;
            case 'crash':
              actor = crashActor;
              break;
            case 'roulette':
              actor = rouletteActor;
              break;
          }

          if (!actor) {
            return {
              config,
              chips: BigInt(0),
              lpShares: BigInt(0),
              lpValue: BigInt(0),
              loading: true,
            };
          }

          // Get chips balance
          const balance = gameBalance.getBalance(config.id);

          // Get LP position
          let lpPosition: LPPosition = {
            shares: BigInt(0),
            pool_ownership_percent: 0,
            redeemable_usdt: BigInt(0),
          };

          try {
            lpPosition = await actor.get_my_lp_position();
          } catch (error) {
            console.warn(`Failed to fetch LP position for ${config.id}:`, error);
          }

          return {
            config,
            chips: balance.game,
            lpShares: lpPosition.shares,
            lpValue: lpPosition.redeemable_usdt,
            loading: false,
          };
        } catch (error) {
          console.error(`Error fetching data for ${config.id}:`, error);
          return {
            config,
            chips: BigInt(0),
            lpShares: BigInt(0),
            lpValue: BigInt(0),
            loading: false,
          };
        }
      });

      const data = await Promise.all(dataPromises);
      setGameData(data);
    };

    fetchLPPositions();
  }, [isAuthenticated, diceActor, plinkoActor, crashActor, rouletteActor, gameBalance]);

  if (!isAuthenticated) return null;

  // Filter games with balances
  const gamesWithBalances = gameData.filter(g => g.chips > 0n || g.lpShares > 0n);

  // Calculate totals
  const totalChips = gameData.reduce((sum, g) => sum + g.chips, BigInt(0));
  const totalLP = gameData.reduce((sum, g) => sum + g.lpValue, BigInt(0));
  const grandTotal = totalChips + totalLP;

  // Don't show if no balances
  if (grandTotal === BigInt(0)) return null;

  return (
    <div className="bg-gray-900 border border-pure-white/20 rounded-lg overflow-hidden">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
            <span className="text-pure-white text-xl">💰</span>
          </div>
          <div className="text-left">
            <h3 className="text-pure-white font-bold">Your Balances Across Games</h3>
            <p className="text-sm text-gray-400">
              {decimalsToUSDT(grandTotal).toFixed(2)} USDT total
              {gamesWithBalances.length > 0 && ` across ${gamesWithBalances.length} game${gamesWithBalances.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-pure-white/10 p-4 space-y-3">
          {gamesWithBalances.map((game) => (
            <div
              key={game.config.id}
              className="bg-gray-800 rounded-lg p-3 border border-pure-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{game.config.icon}</span>
                  <span className="font-bold text-pure-white">{game.config.name}</span>
                </div>
                <span className="text-sm font-mono text-pure-white">
                  {decimalsToUSDT(game.chips + game.lpValue).toFixed(2)} USDT
                </span>
              </div>

              <div className="space-y-1 text-xs">
                {game.chips > 0n && (
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 bg-blue-500/20 text-blue-400 rounded flex items-center justify-center text-[10px]">
                        🎲
                      </span>
                      Chips
                    </span>
                    <span className="font-mono">{decimalsToUSDT(game.chips).toFixed(2)} USDT</span>
                  </div>
                )}
                {game.lpShares > 0n && (
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 bg-green-500/20 text-green-400 rounded flex items-center justify-center text-[10px]">
                        💎
                      </span>
                      LP Shares
                    </span>
                    <span className="font-mono">{decimalsToUSDT(game.lpValue).toFixed(2)} USDT</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Summary */}
          <div className="pt-3 border-t border-pure-white/10">
            <div className="space-y-1.5 text-sm">
              {totalChips > 0n && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Total Chips</span>
                  <span className="font-mono text-pure-white">{decimalsToUSDT(totalChips).toFixed(2)} USDT</span>
                </div>
              )}
              {totalLP > 0n && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Total LP Value</span>
                  <span className="font-mono text-pure-white">{decimalsToUSDT(totalLP).toFixed(2)} USDT</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-pure-white/10">
                <span className="text-pure-white font-bold">Grand Total</span>
                <span className="font-mono text-pure-white font-bold">{decimalsToUSDT(grandTotal).toFixed(2)} USDT</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
