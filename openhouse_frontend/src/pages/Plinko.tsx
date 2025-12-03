import React, { useEffect, useState, useCallback } from 'react';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import { GameLayout, GameButton, GameStats, type GameStat } from '../components/game-ui';
import { PlinkoBoard, PlinkoMultipliers } from '../components/game-specific/plinko';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';

interface PlinkoGameResult {
  path: boolean[];
  final_position: number;
  multiplier: number;
  win: boolean;
  timestamp: number;
  clientId?: string;
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
}

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [ballCount, setBallCount] = useState<number>(1);
  const [multiBallResult, setMultiBallResult] = useState<MultiBallBackendResult | null>(null);

  // Fixed configuration - no user choices
  const ROWS = 8;
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [formula, setFormula] = useState<string>('');
  const [expectedValue, setExpectedValue] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<PlinkoGameResult | null>(null);

  // Load game data once on mount
  useEffect(() => {
    const loadGameData = async () => {
      if (!actor) return;

      try {
        const [mults, formulaText, ev] = await Promise.all([
          actor.get_multipliers(),
          actor.get_formula(),
          actor.get_expected_value()
        ]);

        setMultipliers(mults);
        setFormula(formulaText);
        setExpectedValue(ev);
      } catch (err) {
        console.error('Failed to load game data:', err);
      }
    };

    loadGameData();
  }, [actor]);

  // Drop multiple balls (or single)
  const dropMultipleBalls = async () => {
    if (!actor) return;

    setIsPlaying(true);
    setGameError('');
    setMultiBallResult(null);
    setCurrentResult(null);

    try {
      if (ballCount === 1) {
        // Use single ball method
        const result = await actor.drop_ball();

        if ('Ok' in result) {
          const gameResult: PlinkoGameResult = {
            ...result.Ok,
            timestamp: Date.now(),
          };
          // Set result immediately for state, but animation will handle visual timing
          setCurrentResult(gameResult);
        } else {
          setGameError(result.Err);
          setIsPlaying(false);
        }
      } else {
        // Use multi-ball method
        // @ts-ignore - method added in recent backend update
        const result = await actor.drop_multiple_balls(ballCount);

        if ('Ok' in result) {
          setMultiBallResult(result.Ok);
          // No sequential animation needed anymore - PlinkoBoard handles it
        } else {
          setGameError(result.Err);
          setIsPlaying(false);
        }
      }
    } catch (err) {
      console.error('Failed to drop balls:', err);
      setGameError(err instanceof Error ? err.message : 'Failed to drop balls');
      setIsPlaying(false);
    }
  };

  const handleAnimationComplete = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Calculate stats
  const houseEdge = ((1 - expectedValue) * 100).toFixed(2);
  const maxMultiplier = multipliers.length > 0 ? Math.max(...multipliers) : 0;
  const minMultiplier = multipliers.length > 0 ? Math.min(...multipliers) : 0;
  const variance = maxMultiplier / minMultiplier;

  const stats: GameStat[] = [
    { label: 'House Edge', value: `${houseEdge}%`, highlight: true, color: 'green' },
    { label: 'Max Win', value: `${maxMultiplier.toFixed(2)}x`, highlight: true, color: 'red' },
    { label: 'Variance', value: `${variance.toFixed(1)}:1` },
  ];

  return (
    <GameLayout
      title="Pure Mathematical Plinko"
      icon="🎯"
      description="Transparent formula. Exact odds. Pure mathematics."
      minBet={1}
      maxWin={6.52}
      houseEdge={1}
    >
      <ConnectionStatus game="plinko" />

      {/* Mathematical Formula Display */}
      <div className="card max-w-2xl mx-auto mb-6 bg-gradient-to-r from-dfinity-turquoise/10 to-dfinity-red/10">
        <h3 className="font-bold mb-3 text-center text-dfinity-turquoise">
          The Mathematical Formula
        </h3>
        <div className="text-center">
          <code className="text-lg font-mono text-pure-white bg-pure-black/50 px-4 py-2 rounded inline-block">
            {formula || 'M(k) = 0.2 + 6.32 × ((k-4)/4)²'}
          </code>
        </div>
        <p className="text-sm text-pure-white/60 text-center mt-3">
          Every multiplier is calculated from this single formula. No hidden values.
        </p>
        <p className="text-xs text-pure-white/40 text-center mt-2">
          Expected Value: {expectedValue.toFixed(6)} (exactly {houseEdge}% house edge)
        </p>
      </div>

      {/* Simple Game Controls */}
      <div className="card max-w-2xl mx-auto">
        <GameStats stats={stats} />

        <div className="mt-6 mb-6">
            <label className="block text-sm font-medium mb-2 text-pure-white">
                Number of Balls: <span className="text-dfinity-turquoise">{ballCount}</span>
            </label>
            <input
                type="range"
                min="1"
                max="30"
                value={ballCount}
                onChange={(e) => setBallCount(parseInt(e.target.value))}
                disabled={isPlaying}
                className="w-full h-2 bg-pure-white/20 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-pure-white/40 mt-1">
                <span>1 ball</span>
                <span>15 balls</span>
                <span>30 balls</span>
            </div>
        </div>

        <div>
          <GameButton
            onClick={dropMultipleBalls}
            disabled={!actor}
            loading={isPlaying}
            label={ballCount === 1 ? "DROP BALL" : `DROP ${ballCount} BALLS`}
            loadingLabel={ballCount === 1 ? "Dropping..." : `Dropping ${ballCount} balls...`}
            icon="🎯"
          />
        </div>

        {gameError && (
          <div className="mt-4 text-red-400 text-sm text-center">
            {gameError}
          </div>
        )}
      </div>

      {/* Plinko Board - Always 8 rows */}
      <div className="card max-w-4xl mx-auto">
        <PlinkoBoard
          rows={ROWS}
          paths={
             isPlaying 
               ? (ballCount === 1 && currentResult ? [currentResult.path] : multiBallResult?.results.map(r => r.path) || null)
               : null
          }
          isDropping={isPlaying}
          onAnimationComplete={handleAnimationComplete}
          finalPositions={
            ballCount === 1 
              ? (currentResult ? [currentResult.final_position] : [])
              : (multiBallResult?.results.map(r => r.final_position) || [])
          }
        />

        {/* Multiplier Display with Win/Loss Indicators */}
        {multipliers.length > 0 && (
          <div className="mt-4">
            <PlinkoMultipliers
              multipliers={multipliers}
              highlightedIndex={currentResult?.final_position}
              showWinLoss={true}
            />

            {/* Probability Distribution */}
            <div className="text-xs text-pure-white/40 text-center mt-2 font-mono">
              <div>Probability: 0.4% | 3.1% | 10.9% | 21.9% | 27.3% | 21.9% | 10.9% | 3.1% | 0.4%</div>
              <div className="mt-1">
                Win Zones:
                <span className="text-green-400"> ← 29% →</span> |
                <span className="text-red-400"> ← 71% → </span> |
                <span className="text-green-400"> ← 29% → </span>
              </div>
            </div>
          </div>
        )}

        {/* Result Display */}
        {currentResult && !isPlaying && (
          <div className="text-center mt-6">
            <div className={`text-3xl font-bold mb-2 ${
              currentResult.multiplier >= 3 ? 'text-dfinity-red' :
              currentResult.win ? 'text-dfinity-turquoise' :
              'text-gray-400'
            }`}>
              {currentResult.multiplier >= 3 ? '🎉 BIG WIN!' :
               currentResult.win ? '✨ WIN' :
               '💔 LOSS'}
            </div>
            <div className="text-2xl font-mono">
              {currentResult.multiplier.toFixed(3)}x
            </div>
            {!currentResult.win && (
              <div className="text-sm text-gray-400 mt-1">
                Lost {((1 - currentResult.multiplier) * 100).toFixed(0)}% of bet
              </div>
            )}
          </div>
        )}

        {/* Multi-Ball Aggregate Results */}
        {multiBallResult && !isPlaying && (
            <div className="mt-8 p-6 bg-pure-black/30 rounded-xl border border-pure-white/10">
                <h3 className="text-lg font-bold mb-4 text-center text-pure-white">
                    Multi-Ball Summary
                </h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-2xl font-bold text-dfinity-turquoise">
                            {multiBallResult.total_balls}
                        </div>
                        <div className="text-xs text-pure-white/60 uppercase tracking-wider">Total Balls</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-green-400">
                            {multiBallResult.total_wins}
                        </div>
                        <div className="text-xs text-pure-white/60 uppercase tracking-wider">Wins</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-pure-white">
                            {multiBallResult.average_multiplier.toFixed(3)}x
                        </div>
                        <div className="text-xs text-pure-white/60 uppercase tracking-wider">Avg Multiplier</div>
                    </div>
                </div>

                <div className="mt-4 text-center">
                    <div className={`text-xl font-bold ${
                        multiBallResult.average_multiplier >= 1
                            ? 'text-green-400'
                            : 'text-red-400'
                    }`}>
                        {multiBallResult.average_multiplier >= 1
                            ? `✨ Net Win: ${((multiBallResult.average_multiplier - 1) * 100).toFixed(1)}%`
                            : `💔 Net Loss: ${((1 - multiBallResult.average_multiplier) * 100).toFixed(1)}%`
                        }
                    </div>
                </div>

                <details className="mt-6 group">
                    <summary className="cursor-pointer text-sm text-pure-white/60 hover:text-pure-white transition-colors list-none text-center">
                        <span className="border-b border-pure-white/20 pb-1 group-open:border-transparent">
                            View Individual Results ({multiBallResult.results.length} balls)
                        </span>
                    </summary>
                    <div className="mt-4 max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {multiBallResult.results.map((result, idx) => (
                            <div key={idx} className="text-xs font-mono flex justify-between px-3 py-2 bg-pure-black/40 rounded border border-pure-white/5">
                                <span className="text-pure-white/60">Ball {idx + 1}</span>
                                <span className={result.win ? 'text-green-400' : 'text-red-400'}>
                                    {result.multiplier.toFixed(3)}x (pos {result.final_position})
                                </span>
                            </div>
                        ))}
                    </div>
                </details>
            </div>
        )}
      </div>
    </GameLayout>
  );
};