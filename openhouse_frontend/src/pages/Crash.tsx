import React, { useState, useRef, useCallback, useEffect } from 'react';
import useCrashActor from '../hooks/actors/useCrashActor';
import useLedgerActor from '../hooks/actors/useLedgerActor';
import { GameLayout } from '../components/game-ui';
import { BettingRail } from '../components/betting';
import { CrashCanvas } from '../components/game-specific/crash';
import { useAuth } from '../providers/AuthProvider';
import { useGameBalance } from '../providers/GameBalanceProvider';
import { useBalance } from '../providers/BalanceProvider';
import { DECIMALS_PER_CKUSDT, formatUSDT } from '../types/balance';
import { parseBackendError } from '../utils/parseBackendError';
import { useBalanceRefresh } from '../hooks/games';
import type { MultiCrashResult, SingleRocketResult } from '../declarations/crash_backend/crash_backend.did';

const CRASH_BACKEND_CANISTER_ID = 'fws6k-tyaaa-aaaap-qqc7q-cai';

// Per-rocket animation state
export interface RocketState {
  index: number;
  crashPoint: number;
  reachedTarget: boolean;
  currentMultiplier: number;
  isCrashed: boolean;
  history: Array<{ multiplier: number; timestamp: number }>;
  startTime: number;
  virtualElapsed: number;   // Accumulated virtual time (with slowdown applied)
  lastFrameTime: number;    // For calculating delta between frames
}

export const Crash: React.FC = () => {
  const { actor } = useCrashActor();
  const { actor: ledgerActor } = useLedgerActor();
  const { isAuthenticated } = useAuth();

  // Balance management
  const { balance: walletBalance, refreshBalance: refreshWalletBalance } = useBalance();
  const gameBalanceContext = useGameBalance('crash');
  const balance = gameBalanceContext.balance;

  const handleBalanceRefresh = useCallback(() => {
    refreshWalletBalance();
    gameBalanceContext.refresh();
  }, [refreshWalletBalance, gameBalanceContext]);

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaitingForBackend, setIsWaitingForBackend] = useState(false);
  const [targetCashout, setTargetCashout] = useState(10);
  const [gameError, setGameError] = useState('');
  const [passedTarget, setPassedTarget] = useState(false);

  // Betting state
  const [betAmount, setBetAmount] = useState(0.01); // Per-rocket bet amount
  const [maxBet, setMaxBet] = useState(100); // Max bet per rocket

  // Multi-rocket state
  const [rocketCount, setRocketCount] = useState(5);
  const [multiResult, setMultiResult] = useState<MultiCrashResult | null>(null);
  const [rocketStates, setRocketStates] = useState<RocketState[]>([]);
  const [allCrashed, setAllCrashed] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Animation frame ref for cleanup
  const animationRef = useRef<number | null>(null);

  // Computed values
  const totalBet = betAmount * rocketCount;
  const maxPayout = totalBet * targetCashout;

  // Fetch max bet when rocket count or target changes
  useEffect(() => {
    const fetchMaxBet = async () => {
      if (!actor) return;
      try {
        const result = await actor.get_max_bet_per_rocket(rocketCount, targetCashout);
        if ('Ok' in result) {
          // Apply 10% safety margin for UI
          const maxBetPerRocketUSDT = (Number(result.Ok) / DECIMALS_PER_CKUSDT) * 0.9;
          const newMaxBet = Math.max(0.01, maxBetPerRocketUSDT);
          setMaxBet(newMaxBet);
          // Only adjust bet if it exceeds the new max
          setBetAmount(prev => prev > newMaxBet ? newMaxBet : prev);
        }
      } catch (e) {
        console.error('Failed to fetch max bet:', e);
        setMaxBet(100);
      }
    };
    fetchMaxBet();
  }, [actor, rocketCount, targetCashout]);

  // Balance management - periodic refresh and focus handler
  useBalanceRefresh({
    actor,
    refresh: gameBalanceContext.refresh,
  });

  // Multi-rocket animation function
  const animateMultiRockets = useCallback((initialStates: RocketState[], target: number) => {
    const crashedSet = new Set<number>();

    const animate = () => {
      const now = Date.now();

      setRocketStates(prevStates => {
        const newStates = prevStates.map(rocket => {
          // Skip if already crashed
          if (rocket.isCrashed) return rocket;

          // Check if this rocket has started yet (staggered start)
          if (now < rocket.startTime) return rocket;

          // Calculate real delta time since last frame
          const realDelta = rocket.lastFrameTime > 0
            ? now - rocket.lastFrameTime
            : now - rocket.startTime; // First frame after start

          // Calculate speed factor based on current state
          // Slow down when above 20x AND below target (the exciting approach zone)
          let speedFactor = 1.0;
          const currentMult = rocket.currentMultiplier;

          if (currentMult > 20 && currentMult < target) {
            // Progressive slowdown as we approach target
            // At 20x: speedFactor = 1.0
            // At target: speedFactor = 0.25 (4x slower)
            const progressToTarget = (currentMult - 20) / Math.max(target - 20, 1);
            speedFactor = 1.0 - (progressToTarget * 0.75);
          }
          // Once past target, back to normal speed (speedFactor stays 1.0)

          // Accumulate virtual time with slowdown applied
          const newVirtualElapsed = rocket.virtualElapsed + (realDelta * speedFactor);

          // Calculate multiplier from virtual elapsed time
          const duration = Math.min(rocket.crashPoint * 1000, 10000);
          const k = Math.log(rocket.crashPoint) / duration;
          const mult = Math.min(Math.exp(k * newVirtualElapsed), rocket.crashPoint);

          // Check if crashed
          const isCrashed = mult >= rocket.crashPoint;
          if (isCrashed && !crashedSet.has(rocket.index)) {
            crashedSet.add(rocket.index);
          }

          return {
            ...rocket,
            currentMultiplier: mult,
            isCrashed,
            history: [...rocket.history, { multiplier: mult, timestamp: newVirtualElapsed }],
            virtualElapsed: newVirtualElapsed,
            lastFrameTime: now,
          };
        });

        return newStates;
      });

      // Check if all rockets have crashed
      if (crashedSet.size < initialStates.length) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setAllCrashed(true);
        setTimeout(() => {
          setIsPlaying(false);
        }, 2000);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  // Start game
  const startGame = async () => {
    if (!actor) return;
    if (!isAuthenticated) {
      setGameError('Please log in to play');
      return;
    }

    // Guard against rapid clicks
    if (isPlaying) return;

    // Check user has enough balance
    const totalBetE8s = BigInt(Math.floor(totalBet * DECIMALS_PER_CKUSDT));
    if (totalBetE8s > balance.game) {
      setGameError(`Insufficient balance for ${rocketCount} rocket${rocketCount > 1 ? 's' : ''}. Total bet: $${totalBet.toFixed(2)}`);
      return;
    }

    if (betAmount < 0.01) {
      setGameError('Minimum bet is 0.01 USDT per rocket');
      return;
    }

    // Frontend limit check - use 15% to match backend
    const maxPayoutE8s = BigInt(Math.floor(maxPayout * DECIMALS_PER_CKUSDT));
    const maxAllowedPayout = (balance.house * BigInt(15)) / BigInt(100);
    if (maxPayoutE8s > maxAllowedPayout) {
      setGameError('Potential payout exceeds house limit. Reduce bet or rocket count.');
      return;
    }

    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Reset state
    setIsPlaying(true);
    setIsWaitingForBackend(true);
    setAllCrashed(false);
    setGameError('');
    setMultiResult(null);
    setRocketStates([]);
    setPassedTarget(false);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Game timed out.')), 15000);
    });

    try {
      // Convert bet to e8s
      const betPerRocketE8s = BigInt(Math.floor(betAmount * DECIMALS_PER_CKUSDT));

      // Call multi-rocket endpoint with new signature: (bet_per_rocket, target_multiplier, rocket_count)
      const result = await Promise.race([
        actor.play_crash_multi(betPerRocketE8s, targetCashout, rocketCount),
        timeoutPromise
      ]);

      if ('Ok' in result) {
        const gameData = result.Ok;
        setMultiResult(gameData);
        setIsWaitingForBackend(false);

        // Initialize rocket states with staggered start times
        const now = Date.now();
        const initialStates: RocketState[] = gameData.rockets.map((rocket: SingleRocketResult, i: number) => ({
          index: rocket.rocket_index,
          crashPoint: rocket.crash_point,
          reachedTarget: rocket.reached_target,
          currentMultiplier: 1.0,
          isCrashed: false,
          history: [],
          startTime: now + (i * 200), // 200ms stagger
          virtualElapsed: 0,
          lastFrameTime: 0,
        }));

        setRocketStates(initialStates);

        // Start multi-rocket animation with target for slowdown calculation
        animateMultiRockets(initialStates, targetCashout);

        // Refresh balance after game
        gameBalanceContext.refresh().catch(console.error);
      } else {
        const userFriendlyError = parseBackendError(result.Err);
        setGameError(userFriendlyError);
        setIsPlaying(false);
        setIsWaitingForBackend(false);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start game';
      setGameError(parseBackendError(errorMsg));
      setIsPlaying(false);
      setIsWaitingForBackend(false);
      // On timeout, refresh balance so user can see actual state
      if (errorMsg.includes('timed out') || errorMsg.includes('504') || errorMsg.includes('Gateway')) {
        gameBalanceContext.refresh().catch(console.error);
      }
    }
  };

  // Count flying rockets
  const flyingCount = rocketStates.filter(r => !r.isCrashed).length;

  // Calculate multiplier for BettingRail (potential payout multiplier)
  const effectiveMultiplier = targetCashout;

  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col items-center justify-start px-4 overflow-y-auto w-full pb-36 md:pb-40">

        {/* Result Display */}
        <div className="w-full max-w-lg mx-auto mb-2 min-h-[48px] flex items-center justify-center flex-shrink-0">
          {isPlaying && isWaitingForBackend ? (
            <div className="text-yellow-400 text-xs font-mono tracking-widest uppercase animate-pulse">
              LAUNCH SEQUENCE INITIATED...
            </div>
          ) : isPlaying ? (
            <div className="text-yellow-400 text-xs font-mono tracking-widest uppercase animate-pulse">
              {flyingCount} rocket{flyingCount !== 1 ? 's' : ''} flying...
            </div>
          ) : multiResult ? (
            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Rockets</span>
                <span className="text-xl font-bold text-white">{multiResult.rocket_count}</span>
              </div>
              <div className="h-8 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Reached Target</span>
                <span className={`text-xl font-bold ${multiResult.rockets_succeeded > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {multiResult.rockets_succeeded}/{multiResult.rocket_count}
                </span>
              </div>
              <div className="h-8 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Net Profit</span>
                <span className={`text-xl font-bold ${Number(multiResult.net_profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {Number(multiResult.net_profit) >= 0 ? '+' : ''}{formatUSDT(multiResult.net_profit)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-gray-600 text-xs font-mono tracking-widest opacity-50 uppercase">
              Tap canvas to launch
            </div>
          )}
        </div>

        {/* Main Game Area - clickable to launch */}
        <div
          className={`relative w-full max-h-[50vh] aspect-video mb-4 flex-shrink-0 ${!isPlaying && actor && isAuthenticated && balance.game > 0n ? 'cursor-pointer' : ''}`}
          onClick={() => {
            if (!isPlaying && actor && isAuthenticated && balance.game > 0n) {
              startGame();
            }
          }}
        >
          <CrashCanvas
            rocketStates={rocketStates}
            targetMultiplier={targetCashout}
            rocketsSucceeded={multiResult?.rockets_succeeded ?? 0}
            width={1600}
            height={900}
            isWaitingForBackend={isWaitingForBackend}
            rocketCount={rocketCount}
          />

          {/* Milestone overlay when any rocket passes target */}
          {passedTarget && isPlaying && !allCrashed && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
              <div className="bg-green-500/20 border-2 border-green-400 rounded-lg p-6 animate-pulse backdrop-blur-sm">
                <div className="text-2xl font-bold text-green-400">
                  TARGET REACHED
                </div>
                <div className="text-lg text-green-300 mt-1">
                  {targetCashout.toFixed(2)}x
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="w-full max-w-md mx-auto space-y-3 flex-shrink-0">

          {/* Target Slider */}
          <div className="flex items-center justify-between bg-[#0a0a14] p-3 rounded-lg border border-gray-800/50">
            <span className="text-xs text-gray-500 uppercase font-bold w-16">Target</span>
            <div className="flex items-center flex-1 mx-4">
              <input
                type="range"
                min="1.01"
                max="100"
                step="0.01"
                value={targetCashout}
                onChange={(e) => setTargetCashout(parseFloat(e.target.value))}
                disabled={isPlaying}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dfinity-turquoise"
              />
            </div>
            <span className="text-lg text-white font-mono font-bold w-16 text-right">{targetCashout.toFixed(2)}x</span>
          </div>

          {/* Rocket Count Slider */}
          <div className="flex items-center justify-between bg-[#0a0a14] p-3 rounded-lg border border-gray-800/50">
            <span className="text-xs text-gray-500 uppercase font-bold w-16">Rockets</span>
            <div className="flex items-center flex-1 mx-4">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={rocketCount}
                onChange={(e) => setRocketCount(parseInt(e.target.value))}
                disabled={isPlaying}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dfinity-turquoise"
              />
            </div>
            <span className="text-lg text-white font-mono font-bold w-16 text-right">{rocketCount}</span>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between bg-[#0a0a14] rounded-lg p-3 border border-gray-800/50">
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Chance</span>
              <span className="text-green-400 font-mono font-bold">{((0.99 / targetCashout) * 100).toFixed(1)}%</span>
              <span className="text-[8px] text-gray-600">per rocket</span>
            </div>
            <div className="h-6 w-px bg-gray-800"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total Bet</span>
              <span className="text-yellow-400 font-mono font-bold">${totalBet.toFixed(2)}</span>
            </div>
            <div className="h-6 w-px bg-gray-800"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Max Payout</span>
              <span className="text-dfinity-turquoise font-mono font-bold">${maxPayout.toFixed(2)}</span>
            </div>
            <div className="h-6 w-px bg-gray-800"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                House Edge
                <button
                  onClick={() => setShowInfoModal(true)}
                  className="text-gray-600 hover:text-gray-400 text-[10px]"
                  title="How crash works"
                >
                  ?
                </button>
              </span>
              <span className="text-red-400 font-mono font-bold">1%</span>
            </div>
          </div>

          {gameError && (
            <div className="text-red-400 text-xs text-center p-2 bg-red-900/10 border border-red-900/30 rounded whitespace-pre-line">
              {gameError}
            </div>
          )}
        </div>
      </div>

      {/* BettingRail - Stays at bottom */}
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
          multiplier={effectiveMultiplier}
          canisterId={CRASH_BACKEND_CANISTER_ID}
          isBalanceLoading={gameBalanceContext.isLoading}
          isBalanceInitialized={gameBalanceContext.isInitialized}
        />
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowInfoModal(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full border border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">How Crash Works</h3>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="text-xs text-gray-300 space-y-3">
              <div>
                <p className="font-semibold text-white mb-1">The Game</p>
                <p>
                  Each rocket launches with a hidden <span className="font-bold text-white">crash point</span> — a random multiplier where it will explode.
                  You pick a <span className="font-bold text-dfinity-turquoise">target multiplier</span> before launch.
                  If the rocket reaches your target before crashing, you win!
                </p>
              </div>

              <div>
                <p className="font-semibold text-white mb-1">Multi-Rocket Mode</p>
                <p>
                  Launch 1-10 rockets at once! Each rocket has an <span className="font-bold">independent crash point</span> — some may win, some may lose.
                  Your bet is spread across all rockets.
                </p>
              </div>

              <div>
                <p className="font-semibold text-white mb-1">Win Calculation</p>
                <div className="bg-gray-900 border border-gray-800 rounded p-2 font-mono text-xs">
                  <p className="text-gray-400">For each rocket that reaches target:</p>
                  <p className="mt-1">Payout = <span className="text-dfinity-turquoise">Bet × Target × 0.99</span></p>
                  <p className="mt-2 text-gray-400">Example at 10x target:</p>
                  <p>$1 bet → $9.90 payout (if rocket survives)</p>
                </div>
              </div>

              <div>
                <p className="font-semibold text-red-400 mb-1">The House Edge (1%)</p>
                <p>
                  The <span className="font-mono text-white">0.99</span> factor in the payout formula is the house edge.
                  It's applied equally to <span className="font-bold">all targets</span>, whether you choose 1.1x or 100x.
                </p>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded p-3">
                <p className="font-semibold text-yellow-400 mb-1">No Strategy Beats Another</p>
                <p className="text-gray-300">
                  Every target has the <span className="font-bold">same 1% house edge</span>.
                  A low target (like 1.5x) wins more often but pays less.
                  A high target (like 50x) wins rarely but pays big.
                  <span className="font-bold text-white"> Over time, all strategies converge to the same -1% expected return.</span>
                </p>
              </div>

              <div>
                <p className="font-semibold text-white mb-1">The Math</p>
                <div className="bg-black/30 rounded p-2 font-mono text-[10px] text-gray-400 space-y-1">
                  <p><span className="text-gray-500">Win chance:</span> <span className="text-green-400">99% / target</span></p>
                  <p><span className="text-gray-500">At 2x:</span> 49.5% chance to win 2x (EV = 0.99)</p>
                  <p><span className="text-gray-500">At 10x:</span> 9.9% chance to win 10x (EV = 0.99)</p>
                  <p><span className="text-gray-500">At 100x:</span> 0.99% chance to win 100x (EV = 0.99)</p>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-700/50 space-y-2">
                <div>
                  <p className="font-semibold text-white mb-1">Verify This Code</p>
                  <p className="text-xs text-gray-400 mb-2">
                    This game runs on the Internet Computer. You can verify the deployed code matches this open-source repository.
                  </p>
                  <div className="bg-black/30 rounded p-2 font-mono text-[10px] text-gray-400 space-y-1">
                    <p><span className="text-gray-500">Canister:</span> <span className="text-white">fws6k-tyaaa-aaaap-qqc7q-cai</span></p>
                    <p><span className="text-gray-500">Hash:</span> <span className="text-dfinity-turquoise break-all">0846c5ce0ec0b28d05f1c79009a71bd2e7f0cd4cde59ee36973c93a3d3a2cae3</span></p>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Crash points use the IC's verifiable random function (VRF) for provably fair results.{' '}
                  <a
                    href="https://github.com/AlexandriaDAO/alexandria/blob/master/openhouse/VERIFICATION.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dfinity-turquoise hover:underline"
                  >
                    Verification Guide →
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </GameLayout>
  );
};
