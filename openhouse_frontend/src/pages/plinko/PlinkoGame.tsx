import React, { useEffect, useState, useCallback, useRef } from 'react';
import usePlinkoActor from '../../hooks/actors/usePlinkoActor';
import { GameLayout } from '../../components/game-ui';
import { PlinkoStage } from '../../components/game-specific/plinko/PlinkoStage';
import { PlinkoController } from '../../components/game-specific/plinko/PlinkoController';
import useLedgerActor from '../../hooks/actors/useLedgerActor';
import { BettingRail } from '../../components/betting';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { useBalance } from '../../providers/BalanceProvider';
import { useAuth } from '../../providers/AuthProvider';
import { DECIMALS_PER_CKUSDT } from '../../types/balance';
import type { PlinkoGameResult as BackendPlinkoResult } from '../../declarations/plinko_backend/plinko_backend.did';

// Game Constants
const ROWS = 8;
const ANIMATION_SAFETY_TIMEOUT_MS = 15000;
const PLINKO_BACKEND_CANISTER_ID = 'weupr-2qaaa-aaaap-abl3q-cai';

interface PlinkoGameResult {
  path: boolean[];
  final_position: number;
  multiplier: number;
  win: boolean;
  timestamp: number;
  bet_amount?: number;
  payout?: number;
  profit?: number;
}

interface MultiBallBackendResult {
  results: {
    path: boolean[];
    final_position: number;
    multiplier: number;
    win: boolean;
  }[];
  total_balls: number;
  total_wins: number;
  average_multiplier: number;
  total_bet?: number;
  total_payout?: number;
  net_profit?: number;
}

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();
  const { actor: ledgerActor } = useLedgerActor();
  const { isAuthenticated } = useAuth();
  const { balance: walletBalance, refreshBalance: refreshWalletBalance } = useBalance();
  const gameBalanceContext = useGameBalance('plinko');
  const { refresh: refreshGameBalance } = gameBalanceContext;
  const balance = gameBalanceContext.balance;

  // UI state only - animation state is in controller
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [ballCount, setBallCount] = useState<number>(1);
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [formula, setFormula] = useState<string>('');
  const [expectedValue, setExpectedValue] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<PlinkoGameResult | null>(null);
  const [multiBallResult, setMultiBallResult] = useState<MultiBallBackendResult | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [betAmount, setBetAmount] = useState(0.01);
  const [maxBet, setMaxBet] = useState(100);

  // Controller ref - accessed imperatively
  const controllerRef = useRef<PlinkoController | null>(null);

  const handleBalanceRefresh = useCallback(async () => {
    try {
      await Promise.all([
        refreshWalletBalance(),
        refreshGameBalance()
      ]);
    } catch (err) {
      console.error('Failed to refresh balances:', err);
    }
  }, [refreshWalletBalance, refreshGameBalance]);

  // Load game data on mount
  useEffect(() => {
    const loadGameData = async () => {
      if (!actor) return;

      try {
        const [multsBp, formulaText, ev] = await Promise.all([
          actor.get_multipliers_bp(),
          actor.get_formula(),
          actor.get_expected_value()
        ]);

        const finalMults = Array.from(multsBp).map((bp) => Number(bp) / 10000);
        setMultipliers(finalMults);
        setFormula(formulaText);
        setExpectedValue(ev);
      } catch (err) {
        console.error('Failed to load game data:', err);
      }
    };

    loadGameData();
  }, [actor]);

  // Max bet calculation
  useEffect(() => {
    const updateMaxBet = async () => {
      if (!actor) return;
      try {
        const result = await actor.get_max_bet_per_ball(ballCount);
        if ('Ok' in result) {
          const maxBetUSDT = (Number(result.Ok) / DECIMALS_PER_CKUSDT) * 0.95;
          const newMaxBet = Math.max(0.01, maxBetUSDT);
          setMaxBet(newMaxBet);
          setBetAmount(prev => Math.min(prev, newMaxBet));
        }
      } catch (err) {
        console.error('Failed to get max bet:', err);
        setMaxBet(10);
      }
    };
    updateMaxBet();
  }, [actor, ballCount]);

  // Safety timeout
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isPlaying) {
      timeoutId = setTimeout(() => {
        console.warn('Game animation timed out - forcing reset');
        setIsPlaying(false);
        setGameError('Game response timed out. Please refresh if stuck.');
      }, ANIMATION_SAFETY_TIMEOUT_MS);
    }
    return () => clearTimeout(timeoutId);
  }, [isPlaying]);

  // Handle controller ready
  const handleControllerReady = useCallback((controller: PlinkoController) => {
    controllerRef.current = controller;
  }, []);

  // Simplified dropBalls - controller handles all animation
  const dropBalls = async () => {
    if (!actor || isPlaying || !controllerRef.current) return;

    if (!isAuthenticated) {
      setGameError('Please log in to play.');
      return;
    }

    if (balance.game === 0n) {
      setGameError('No chips! Use the + button below to deposit.');
      return;
    }

    // Pre-flight max bet validation
    try {
      const maxBetResult = await actor.get_max_bet_per_ball(ballCount);
      if ('Ok' in maxBetResult) {
        const currentMaxBet = Number(maxBetResult.Ok) / DECIMALS_PER_CKUSDT;
        if (betAmount > currentMaxBet) {
          setMaxBet(currentMaxBet * 0.95);
          setBetAmount(Math.min(betAmount, currentMaxBet * 0.95));
          setGameError(`Max bet reduced to $${currentMaxBet.toFixed(2)}/ball. Adjusting your bet.`);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to validate max bet:', err);
    }

    const betPerBallE8s = BigInt(Math.round(betAmount * DECIMALS_PER_CKUSDT));
    const totalBetE8s = betPerBallE8s * BigInt(ballCount);

    if (totalBetE8s > balance.game) {
      setGameError(`Insufficient balance. Total bet: $${(betAmount * ballCount).toFixed(2)}`);
      return;
    }

    setIsPlaying(true);
    setGameError('');
    setMultiBallResult(null);
    setCurrentResult(null);

    try {
      const result = ballCount === 1
        ? await actor.play_plinko(betPerBallE8s)
        : await actor.play_multi_plinko(ballCount, betPerBallE8s);

      let extractedPaths: boolean[][] = [];

      if (ballCount === 1) {
        if ('Ok' in result) {
          const gameResult: PlinkoGameResult = {
            path: result.Ok.path,
            final_position: result.Ok.final_position,
            multiplier: result.Ok.multiplier,
            win: result.Ok.is_win,
            timestamp: Date.now(),
            bet_amount: Number(result.Ok.bet_amount) / DECIMALS_PER_CKUSDT,
            payout: Number(result.Ok.payout) / DECIMALS_PER_CKUSDT,
            profit: Number(result.Ok.profit) / DECIMALS_PER_CKUSDT,
          };
          setCurrentResult(gameResult);
          extractedPaths = [gameResult.path];
          refreshGameBalance().catch(console.error);
        } else {
          console.error('[Plinko] Single ball backend error:', result.Err);
          setGameError(result.Err);
          setIsPlaying(false);
          return;
        }
      } else {
        if ('Ok' in result) {
          const multiBallGameResult = {
            results: result.Ok.results.map((r: BackendPlinkoResult) => ({
              path: r.path,
              final_position: r.final_position,
              multiplier: r.multiplier,
              win: r.is_win,
            })),
            total_balls: result.Ok.total_balls,
            total_wins: result.Ok.results.filter((r: BackendPlinkoResult) => r.is_win).length,
            average_multiplier: result.Ok.average_multiplier,
            total_bet: Number(result.Ok.total_bet) / DECIMALS_PER_CKUSDT,
            total_payout: Number(result.Ok.total_payout) / DECIMALS_PER_CKUSDT,
            net_profit: Number(result.Ok.net_profit) / DECIMALS_PER_CKUSDT,
          };
          setMultiBallResult(multiBallGameResult);
          extractedPaths = result.Ok.results.map((r: BackendPlinkoResult) => r.path);
          refreshGameBalance().catch(console.error);
        } else {
          console.error('[Plinko] Multi-ball backend error:', result.Err);
          setGameError(result.Err);
          setIsPlaying(false);
          return;
        }
      }

      // Start game on controller - single call, controller handles everything
      controllerRef.current.startGame(extractedPaths, ballCount, () => {
        setIsPlaying(false);
      });

    } catch (err) {
      console.error('Failed to play plinko:', err);
      setGameError(err instanceof Error ? err.message : 'Failed to play');
      setIsPlaying(false);
    }
  };

  const houseEdge = ((1 - expectedValue) * 100).toFixed(2);
  const CENTER_BUCKET_INDEX = Math.floor(multipliers.length / 2);

  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col items-center justify-center px-2 pb-40 overflow-hidden">
        <div className="flex items-stretch gap-0 w-full max-w-3xl">

          {/* LEFT PANEL - Ball Count Slider */}
          <div className="hidden sm:flex flex-col justify-center items-center w-20 bg-[#0a0a14] border-y border-l border-gray-800/50 rounded-l-xl px-3 py-4">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Balls</span>
            <div className="flex-1 flex flex-col items-center justify-center relative w-full">
              <input
                type="range"
                min="1"
                max="30"
                value={ballCount}
                onChange={(e) => setBallCount(Number(e.target.value))}
                disabled={isPlaying || balance.game === 0n}
                className="plinko-slider-vertical"
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '180px',
                  width: '24px'
                }}
              />
            </div>
            <span className="text-2xl text-white font-mono font-bold mt-3">{ballCount}</span>
          </div>

          {/* CENTER - Pixi Canvas */}
          <div className="flex-1 flex flex-col min-w-0">
            <div
              className="w-full bg-[#0a0a14]"
              style={{ aspectRatio: '400/420' }}
            >
              <PlinkoStage
                rows={ROWS}
                multipliers={multipliers}
                onControllerReady={handleControllerReady}
                onDropClick={dropBalls}
                disabled={!actor || isPlaying}
              />
            </div>

            {/* Result bar */}
            <div className="h-10 bg-[#0a0a14] flex items-center justify-center border-t border-gray-800/30">
              {!isPlaying && currentResult && (
                <div className={`text-center ${currentResult.win ? 'text-green-400' : 'text-red-400'}`}>
                  <span className="font-bold text-lg">{currentResult.multiplier.toFixed(2)}x</span>
                  <span className="ml-2 text-sm">
                    {currentResult.profit && currentResult.profit >= 0 ? '+' : ''}{currentResult.profit?.toFixed(2)} USDT
                  </span>
                </div>
              )}
              {!isPlaying && multiBallResult && !currentResult && (
                <div className={`text-center ${(multiBallResult.net_profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  <span className="font-bold text-lg">{multiBallResult.average_multiplier.toFixed(2)}x avg</span>
                  <span className="ml-2 text-sm">
                    {(multiBallResult.net_profit ?? 0) >= 0 ? '+' : ''}{multiBallResult.net_profit?.toFixed(2)} USDT
                  </span>
                </div>
              )}
              {gameError && (
                <div className="text-red-400 text-xs px-3">{gameError}</div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL - Bet Info */}
          <div className="hidden sm:flex flex-col justify-center w-24 bg-[#0a0a14] border-y border-r border-gray-800/50 rounded-r-xl px-3 py-4">
            <div className="flex flex-col items-center mb-4">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Per Ball</span>
              <span className="text-lg text-white font-mono font-bold">${betAmount.toFixed(2)}</span>
            </div>

            <div className="w-full h-px bg-gray-800/50 my-2"></div>

            <div className="flex flex-col items-center mb-4">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total</span>
              <span className="text-lg text-yellow-400 font-mono font-bold">${(betAmount * ballCount).toFixed(2)}</span>
            </div>

            <div className="w-full h-px bg-gray-800/50 my-2"></div>

            <div className="flex flex-col items-center">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Edge</span>
              <span className="text-sm text-gray-400 font-mono">{houseEdge}%</span>
            </div>

            <button
              onClick={() => setShowInfoModal(true)}
              className="mt-4 text-gray-600 hover:text-gray-400 text-xs border border-gray-700 rounded px-2 py-1"
            >
              Info
            </button>
          </div>
        </div>

        {/* Mobile controls */}
        <div className="sm:hidden w-full max-w-md mt-3 space-y-2 px-2">
          <div className="flex items-center gap-3 bg-[#0a0a14] rounded-lg p-3 border border-gray-800/50">
            <span className="text-xs text-gray-500 uppercase">Balls</span>
            <input
              type="range"
              min="1"
              max="30"
              value={ballCount}
              onChange={(e) => setBallCount(Number(e.target.value))}
              disabled={isPlaying || balance.game === 0n}
              className="plinko-slider flex-1"
            />
            <span className="text-lg text-white font-mono font-bold w-8 text-center">{ballCount}</span>
          </div>

          <div className="flex justify-between items-center bg-[#0a0a14] rounded-lg p-3 border border-gray-800/50">
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase">Per Ball</div>
              <div className="text-white font-mono">${betAmount.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase">Total</div>
              <div className="text-yellow-400 font-mono">${(betAmount * ballCount).toFixed(2)}</div>
            </div>
            <button onClick={() => setShowInfoModal(true)} className="text-gray-600 hover:text-gray-400 border border-gray-700 rounded px-2 py-1 text-xs">
              Info
            </button>
          </div>
        </div>
      </div>

      {/* BettingRail */}
      <div className="flex-shrink-0">
        <BettingRail
          betAmount={betAmount}
          onBetChange={setBetAmount}
          maxBet={maxBet}
          gameBalance={balance.game}
          walletBalance={walletBalance}
          houseBalance={balance.house}
          ledgerActor={ledgerActor}
          gameActor={actor}
          onBalanceRefresh={handleBalanceRefresh}
          disabled={isPlaying}
          multiplier={multipliers[CENTER_BUCKET_INDEX] || 0.2}
          canisterId={PLINKO_BACKEND_CANISTER_ID}
          gameRoute="/plinko"
          isBalanceLoading={gameBalanceContext.isLoading}
          isBalanceInitialized={gameBalanceContext.isInitialized}
        />
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <InfoModal
          onClose={() => setShowInfoModal(false)}
          formula={formula}
          houseEdge={houseEdge}
          expectedValue={expectedValue}
          multipliers={multipliers}
        />
      )}
    </GameLayout>
  );
};

interface InfoModalProps {
  onClose: () => void;
  formula: string;
  houseEdge: string;
  expectedValue: number;
  multipliers: number[];
}

const InfoModal: React.FC<InfoModalProps> = (props) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
         onClick={props.onClose}>
      <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full border border-gray-700"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">How Plinko Works</h3>
          <button onClick={props.onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div className="text-sm text-gray-300 space-y-4">
          <div>
            <p className="font-semibold text-white mb-1">The Formula</p>
            <code className="text-sm font-mono text-dfinity-turquoise bg-black/50 px-3 py-1 rounded block">
              {props.formula || 'M(k) = 0.2 + 6.32 × ((k-4)/4)²'}
            </code>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">House Edge</p>
            <p>{props.houseEdge}% (Expected Value: {props.expectedValue.toFixed(4)})</p>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">Probability Distribution</p>
            <p className="font-mono text-xs text-gray-400">
              0.4% | 3.1% | 10.9% | 21.9% | 27.3% | 21.9% | 10.9% | 3.1% | 0.4%
            </p>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">Win Zones</p>
            <p>
              <span className="text-green-400">Edges (29%)</span> = Win (1x+) |
              <span className="text-red-400 ml-1">Center (71%)</span> = Loss (&lt;1x)
            </p>
          </div>

          <div>
            <p className="font-semibold text-white mb-1">Multipliers</p>
            <div className="flex flex-wrap gap-1">
              {props.multipliers.map((m, i) => (
                <span key={i} className={`text-xs px-2 py-1 rounded ${m >= 1 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                  {m.toFixed(2)}x
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
