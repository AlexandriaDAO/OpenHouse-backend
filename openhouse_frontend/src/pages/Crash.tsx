import React, { useEffect, useState, useCallback } from 'react';
import useCrashActor from '../hooks/actors/useCrashActor';
import {
  GameLayout,
  GameButton,
  GameStats,
  GameHistory,
  type GameStat
} from '../components/game-ui';
import {
  CrashRocket,
  CrashGraph,
  CrashProbabilityTable
} from '../components/game-specific/crash';
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
        setTimeout(() => {
          setIsPlaying(false);
        }, 2000); // Pause to show result
      }
    };

    requestAnimationFrame(animate);
  };

  const handleCrashComplete = useCallback(() => {
    // Called when rocket explosion animation finishes
    setCurrentMultiplier(1.0);
    setCrashPoint(null);
    setGraphHistory([]);
  }, []);

  // Stats for display
  const stats: GameStat[] = [
    {
      label: 'Target Cash-out',
      value: `${targetCashout.toFixed(2)}x`,
      highlight: true,
      color: 'yellow'
    },
    {
      label: 'Win Chance',
      value: `${((0.99 / targetCashout) * 100).toFixed(2)}%`,
      highlight: true,
      color: 'green'
    },
    {
      label: 'House Edge',
      value: '1%',
      highlight: true,
      color: 'red'
    },
  ];

  // Custom history renderer
  const renderHistoryItem = (item: CrashGameResult) => (
    <div className="flex items-center justify-between w-full">
      <span className="font-mono">{item.crash_point.toFixed(2)}x</span>
      <span className={item.crash_point >= 2.0 ? 'text-green-400' : 'text-red-400'}>
        {item.crash_point >= 2.0 ? '🚀' : '💥'}
      </span>
    </div>
  );

  return (
    <GameLayout
      title="Crash"
      icon="🚀"
      description="Watch the rocket rise and cash out before it crashes!"
      minBet={1}
      maxWin={100}
      houseEdge={1}
    >
      {/* Rocket Animation */}
      <div className="card max-w-4xl mx-auto relative">
        <CrashRocket
          isLaunching={isPlaying}
          currentMultiplier={currentMultiplier}
          crashPoint={crashPoint}
          onCrashComplete={handleCrashComplete}
        />
        {/* Milestone overlay when passing target */}
        {passedTarget && isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-green-500/20 border-2 border-green-400 rounded-lg p-6 animate-pulse">
              <div className="text-3xl font-bold text-green-400">
                ✅ TARGET REACHED!
              </div>
              <div className="text-xl text-green-300 mt-2">
                Cashed out at {targetCashout.toFixed(2)}x
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Multiplier Graph */}
      <div className="card max-w-4xl mx-auto">
        <h3 className="font-bold mb-4">Multiplier Graph</h3>
        <CrashGraph
          isPlaying={isPlaying}
          currentMultiplier={currentMultiplier}
          crashPoint={crashPoint}
          history={graphHistory}
        />
      </div>

      {/* Game Controls */}
      <div className="card max-w-2xl mx-auto">
        <div className="mb-6">
          <label className="block text-sm font-bold mb-3 text-center text-dfinity-turquoise">
            Set Your Target (before launch):
          </label>
          <input
            type="range"
            min="1.01"
            max="100"
            step="0.01"
            value={targetCashout}
            onChange={(e) => setTargetCashout(parseFloat(e.target.value))}
            disabled={isPlaying}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-turquoise"
          />
          <div className="text-center mt-2 text-2xl font-bold">
            {targetCashout.toFixed(2)}x
          </div>
        </div>

        <GameStats stats={stats} collapsible={false} />

        <GameButton
          onClick={startGame}
          disabled={!actor || !isAuthenticated || isPlaying}
          loading={isPlaying}
          label={isPlaying ? "ROCKET FLYING..." : "LAUNCH ROCKET"}
          loadingLabel="FLYING..."
          icon="🚀"
        />

        {/* Show result after crash */}
        {gameResult && !isPlaying && (
          <div className={`mt-4 p-4 rounded ${gameResult.won ? 'bg-green-900/20 border border-green-500' : 'bg-red-900/20 border border-red-500'}`}>
            <div className="text-center">
              {gameResult.won ? (
                <>
                  <div className="text-2xl mb-2">🎉 YOU WON!</div>
                  <div>Cashed out at {gameResult.target_multiplier.toFixed(2)}x</div>
                  <div className="text-sm text-gray-400">
                    (Rocket crashed at {gameResult.crash_point.toFixed(2)}x)
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl mb-2">💥 CRASHED!</div>
                  <div>Rocket crashed at {gameResult.crash_point.toFixed(2)}x</div>
                  <div className="text-sm text-gray-400">
                    (Your target was {gameResult.target_multiplier.toFixed(2)}x)
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {gameError && (
          <div className="mt-4 text-red-400 text-sm text-center">
            {gameError}
          </div>
        )}
      </div>

      {/* Recent Games */}
      {history.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <div className="card">
            <h3 className="text-sm font-bold mb-3 text-gray-400">Recent Crashes</h3>
            <div className="space-y-1">
              {history.slice(0, 10).map((item, index) => (
                <div
                  key={item.clientId || `item-${index}`}
                  className="flex items-center justify-between text-sm py-2 border-b border-gray-800"
                >
                  {renderHistoryItem(item)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Probability Table */}
      <div className="max-w-2xl mx-auto">
        <CrashProbabilityTable />
      </div>
    </GameLayout>
  );
};
