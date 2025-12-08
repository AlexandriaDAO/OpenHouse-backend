import React, { useState } from 'react';
import useCrashActor from '../hooks/actors/useCrashActor';
import {
  GameLayout,
  GameButton,
} from '../components/game-ui';
import { CrashCanvas } from '../components/game-specific/crash';
import { useAuth } from '../providers/AuthProvider';

interface PlayCrashResult {
  crash_point: number;
  won: boolean;
  target_multiplier: number;
  payout: bigint;
  randomness_hash: string;
}

interface CrashGameResult extends PlayCrashResult {
  timestamp: number;
  clientId: string;
}

export const Crash: React.FC = () => {
  const { actor } = useCrashActor();
  const { isAuthenticated } = useAuth();

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCrashed, setIsCrashed] = useState(false);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [targetCashout, setTargetCashout] = useState(2.5);
  const [gameError, setGameError] = useState('');
  const [history, setHistory] = useState<CrashGameResult[]>([]);
  const [graphHistory, setGraphHistory] = useState<Array<{ multiplier: number; timestamp: number }>>([]);
  const [gameResult, setGameResult] = useState<PlayCrashResult | null>(null);
  const [passedTarget, setPassedTarget] = useState(false);

  // Start game
  const startGame = async () => {
    if (!actor) return;
    if (!isAuthenticated) {
      setGameError('Please log in to play');
      return;
    }

    // Reset state
    setIsPlaying(true);
    setIsCrashed(false);
    setGameError('');
    setCrashPoint(null);
    setCurrentMultiplier(1.0);
    setGraphHistory([]);
    setPassedTarget(false);
    setGameResult(null);

    try {
      // Call new secure method with pre-committed target
      const result = await actor.play_crash(targetCashout);

      if ('Ok' in result) {
        const gameData = result.Ok;
        setCrashPoint(gameData.crash_point);
        setGameResult(gameData);

        // Animate to conclusion
        animateToConclusion(gameData.crash_point, gameData.target_multiplier, gameData.won);

        // Add to history
        const historyItem: CrashGameResult = {
          ...gameData,
          timestamp: Date.now(),
          clientId: crypto.randomUUID()
        };
        setHistory(prev => [historyItem, ...prev.slice(0, 19)]);
      } else {
        setGameError(result.Err);
        setIsPlaying(false);
      }
    } catch (err) {
      setGameError(err instanceof Error ? err.message : 'Failed to start game');
      setIsPlaying(false);
    }
  };

  // Animate to conclusion with milestone display
  const animateToConclusion = (crashPoint: number, target: number, won: boolean) => {
    const startTime = Date.now();
    const duration = Math.min(crashPoint * 1000, 10000); // Max 10s

    const animate = () => {
      const elapsed = Date.now() - startTime;

      // Exponential curve
      const k = Math.log(crashPoint) / duration;
      const mult = Math.exp(k * elapsed);

      setCurrentMultiplier(mult);
      setGraphHistory(prev => [...prev, { multiplier: mult, timestamp: elapsed }]);

      // Check if we passed the target (show milestone)
      if (won && mult >= target && !passedTarget) {
        setPassedTarget(true);
      }

      // Continue until crash
      if (mult < crashPoint) {
        requestAnimationFrame(animate);
      } else {
        setCurrentMultiplier(crashPoint);
        setIsCrashed(true);
        setTimeout(() => {
          setIsPlaying(false);
        }, 2000); // Pause to show result
      }
    };

    requestAnimationFrame(animate);
  };

  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col items-center justify-start px-4 overflow-hidden w-full">

        {/* Result Display */}
        <div className="w-full max-w-lg mx-auto mb-2 min-h-[48px] flex items-center justify-center">
          {isPlaying ? (
            <div className="text-yellow-400 text-xs font-mono tracking-widest uppercase animate-pulse">
              Flying...
            </div>
          ) : gameResult ? (
            <div className={`flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 ${gameResult.won ? 'text-green-400' : 'text-red-400'}`}>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Result</span>
                <span className="font-bold text-xl">{gameResult.won ? 'WON' : 'CRASHED'}</span>
              </div>
              <div className="h-8 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase text-gray-500 font-bold">Crash Point</span>
                <span className="font-bold text-xl">{gameResult.crash_point.toFixed(2)}x</span>
              </div>
              {gameResult.won && (
                <>
                  <div className="h-8 w-px bg-gray-800"></div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase text-gray-500 font-bold">Cashed Out</span>
                    <span className="font-bold text-xl">{gameResult.target_multiplier.toFixed(2)}x</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-gray-600 text-xs font-mono tracking-widest opacity-50 uppercase">
              Set your target
            </div>
          )}
        </div>

        {/* Main Game Area */}
        <div className="relative w-full max-w-xl">
          <CrashCanvas
            currentMultiplier={currentMultiplier}
            isCrashed={isCrashed}
            crashPoint={crashPoint}
            history={graphHistory}
          />

          {/* Milestone overlay when passing target */}
          {passedTarget && isPlaying && !isCrashed && (
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

          {/* Stats Row */}
          <div className="flex items-center justify-between bg-[#0a0a14] rounded-lg p-3 border border-gray-800/50">
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Chance</span>
              <span className="text-green-400 font-mono font-bold">{((0.99 / targetCashout) * 100).toFixed(1)}%</span>
            </div>
            <div className="h-6 w-px bg-gray-800"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Multiplier</span>
              <span className="text-yellow-400 font-mono font-bold">{targetCashout.toFixed(2)}x</span>
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
            label="LAUNCH"
            loadingLabel="FLYING..."
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
