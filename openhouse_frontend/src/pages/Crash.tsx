import React, { useState, useRef, useCallback } from 'react';
import useCrashActor from '../hooks/actors/useCrashActor';
import {
  GameLayout,
  GameButton,
} from '../components/game-ui';
import { CrashCanvas } from '../components/game-specific/crash';
import { useAuth } from '../providers/AuthProvider';
import type { MultiCrashResult, SingleRocketResult } from '../declarations/crash_backend/crash_backend.did';

// Per-rocket animation state
export interface RocketState {
  index: number;
  crashPoint: number;
  reachedTarget: boolean;
  currentMultiplier: number;
  isCrashed: boolean;
  history: Array<{ multiplier: number; timestamp: number }>;
  startTime: number;
}

export const Crash: React.FC = () => {
  const { actor } = useCrashActor();
  const { isAuthenticated } = useAuth();

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [targetCashout, setTargetCashout] = useState(2.5);
  const [gameError, setGameError] = useState('');
  const [passedTarget, setPassedTarget] = useState(false);

  // Multi-rocket state
  const [rocketCount, setRocketCount] = useState(1);
  const [multiResult, setMultiResult] = useState<MultiCrashResult | null>(null);
  const [rocketStates, setRocketStates] = useState<RocketState[]>([]);
  const [allCrashed, setAllCrashed] = useState(false);

  // Animation frame ref for cleanup
  const animationRef = useRef<number | null>(null);

  // Multi-rocket animation function
  const animateMultiRockets = useCallback((initialStates: RocketState[]) => {
    const crashedSet = new Set<number>();

    const animate = () => {
      const now = Date.now();

      setRocketStates(prevStates => {
        const newStates = prevStates.map(rocket => {
          // Skip if already crashed
          if (rocket.isCrashed) return rocket;

          // Check if this rocket has started yet (staggered start)
          const elapsed = now - rocket.startTime;
          if (elapsed < 0) return rocket;

          // Calculate multiplier using exponential curve
          const duration = Math.min(rocket.crashPoint * 1000, 10000);
          const k = Math.log(rocket.crashPoint) / duration;
          const mult = Math.min(Math.exp(k * elapsed), rocket.crashPoint);

          // Check if crashed
          const isCrashed = mult >= rocket.crashPoint;
          if (isCrashed && !crashedSet.has(rocket.index)) {
            crashedSet.add(rocket.index);
          }

          return {
            ...rocket,
            currentMultiplier: mult,
            isCrashed,
            history: [...rocket.history, { multiplier: mult, timestamp: elapsed }],
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

    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Reset state
    setIsPlaying(true);
    setAllCrashed(false);
    setGameError('');
    setMultiResult(null);
    setRocketStates([]);
    setPassedTarget(false);

    try {
      // Call multi-rocket endpoint
      const result = await actor.play_crash_multi(targetCashout, rocketCount);

      if ('Ok' in result) {
        const gameData = result.Ok;
        setMultiResult(gameData);

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
        }));

        setRocketStates(initialStates);

        // Start multi-rocket animation
        animateMultiRockets(initialStates);
      } else {
        setGameError(result.Err);
        setIsPlaying(false);
      }
    } catch (err) {
      setGameError(err instanceof Error ? err.message : 'Failed to start game');
      setIsPlaying(false);
    }
  };

  // Count flying rockets
  const flyingCount = rocketStates.filter(r => !r.isCrashed).length;

  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col items-center justify-start px-4 overflow-hidden w-full">

        {/* Result Display */}
        <div className="w-full max-w-lg mx-auto mb-2 min-h-[48px] flex items-center justify-center">
          {isPlaying ? (
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
                <span className="text-[10px] uppercase text-gray-500 font-bold">Total Payout</span>
                <span className={`text-xl font-bold ${Number(multiResult.total_payout) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${(Number(multiResult.total_payout) / 1_000_000).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-gray-600 text-xs font-mono tracking-widest opacity-50 uppercase">
              Set target & rockets
            </div>
          )}
        </div>

        {/* Main Game Area */}
        <div className="relative w-full max-w-xl">
          <CrashCanvas
            rocketStates={rocketStates}
            targetMultiplier={targetCashout}
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
        <div className="w-full max-w-md mx-auto mt-4 space-y-3">

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
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Target</span>
              <span className="text-yellow-400 font-mono font-bold">{targetCashout.toFixed(2)}x</span>
            </div>
            <div className="h-6 w-px bg-gray-800"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Rockets</span>
              <span className="text-blue-400 font-mono font-bold">{rocketCount}</span>
            </div>
            <div className="h-6 w-px bg-gray-800"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">House Edge</span>
              <span className="text-red-400 font-mono font-bold">1%</span>
            </div>
          </div>

          {/* Launch Button */}
          <GameButton
            onClick={startGame}
            disabled={!actor || !isAuthenticated || isPlaying}
            loading={isPlaying}
            label={`LAUNCH ${rocketCount} ROCKET${rocketCount > 1 ? 'S' : ''}`}
            loadingLabel={`${flyingCount} FLYING...`}
            icon="🚀"
          />

          {gameError && (
            <div className="text-red-400 text-xs text-center p-2 bg-red-900/10 border border-red-900/30 rounded">
              {gameError}
            </div>
          )}
        </div>
      </div>

    </GameLayout>
  );
};
