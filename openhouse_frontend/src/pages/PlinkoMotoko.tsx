import React, { useEffect, useState, useCallback } from 'react';
import useMinesActor from '../hooks/actors/useMinesActor';
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

export const PlinkoMotoko: React.FC = () => {
  const { actor } = useMinesActor();

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [history, setHistory] = useState<PlinkoGameResult[]>([]);

  // Fixed configuration - no user choices
  const ROWS = 8;
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [formula, setFormula] = useState<string>('');
  const [expectedValue, setExpectedValue] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<PlinkoGameResult | null>(null);

  // Multi-ball feature
  const [ballCount, setBallCount] = useState(1);
  const [currentMultiResult, setCurrentMultiResult] = useState<any>(null);

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
        console.error('Failed to load Motoko Plinko data:', err);
      }
    };

    loadGameData();
  }, [actor]);

  // Drop ball(s) - supports 1-10 balls
  const dropBall = async () => {
    if (!actor) return;

    setIsPlaying(true);
    setGameError('');
    setCurrentResult(null);
    setCurrentMultiResult(null);

    try {
      // Use multi-ball method for all drops
      const result = await (actor as any).drop_balls(ballCount);

      if ('Ok' in result) {
        const multiResult = result.Ok;
        setCurrentMultiResult(multiResult);

        // For single ball, also set currentResult for backward compatibility
        if (ballCount === 1 && multiResult.balls.length > 0) {
          const singleBall = multiResult.balls[0];
          const gameResult: PlinkoGameResult = {
            ...singleBall,
            timestamp: Date.now(),
            clientId: crypto.randomUUID()
          };
          setCurrentResult(gameResult);
          setHistory(prev => [gameResult, ...prev.slice(0, 19)]);
        } else {
          // For multi-ball, add aggregate to history
          const aggregateResult: PlinkoGameResult = {
            path: [], // No single path for multi-ball
            final_position: 4, // Center position for display
            multiplier: multiResult.average_multiplier,
            win: multiResult.average_multiplier >= 1.0,
            timestamp: Date.now(),
            clientId: crypto.randomUUID()
          };
          setHistory(prev => [aggregateResult, ...prev.slice(0, 19)]);
        }
      } else {
        setGameError(result.Err);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Failed to drop balls (Motoko):', err);
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

  // Calculate win rate from history
  const winRate = history.length > 0
    ? (history.filter(h => h.win).length / history.length * 100).toFixed(1)
    : '0';

  return (
    <GameLayout
      title="Pure Mathematical Plinko V2"
      icon="🎯"
      description="Motoko Implementation - Same game, different language!"
      minBet={1}
      maxWin={6.52}
      houseEdge={1}
    >
      <ConnectionStatus game="plinko-motoko" />

      {/* Badge showing this is Motoko version */}
      <div className="text-center mb-4">
        <span className="inline-block bg-purple-600 text-white px-4 py-2 rounded-full text-sm font-bold">
          Motoko Implementation
        </span>
      </div>

      {/* Mathematical Formula Display */}
      <div className="card max-w-2xl mx-auto mb-6 bg-gradient-to-r from-purple-600/10 to-dfinity-red/10">
        <h3 className="font-bold mb-3 text-center text-purple-400">
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

        {/* Ball Count Selector */}
        <div className="mb-6">
          <label className="block text-sm font-bold mb-3 text-center text-purple-400">
            Number of Balls:
          </label>
          <div className="flex justify-center gap-2 flex-wrap">
            {[1, 2, 3, 5, 10].map(count => (
              <button
                key={count}
                onClick={() => setBallCount(count)}
                disabled={isPlaying}
                className={`
                  px-6 py-3 rounded font-bold text-lg transition-all
                  ${ballCount === count
                    ? 'bg-purple-600 text-pure-white shadow-lg shadow-purple-600/50'
                    : 'bg-pure-white/10 text-pure-white hover:bg-pure-white/20'
                  }
                  ${isPlaying ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}
                `}
              >
                {count}
              </button>
            ))}
          </div>
          <div className="text-center mt-3 text-pure-white/60 text-sm">
            Total Bet: {(0.1 * ballCount).toFixed(1)} ICP
            <span className="text-pure-white/40 ml-2">(0.1 ICP per ball)</span>
          </div>
        </div>

        <GameButton
          onClick={dropBall}
          disabled={!actor}
          loading={isPlaying}
          label={ballCount === 1 ? "DROP BALL" : `DROP ${ballCount} BALLS`}
          loadingLabel="Dropping..."
          icon="🎯"
        />

        {gameError && (
          <div className="mt-4 text-red-400 text-sm text-center">
            {gameError}
          </div>
        )}

        {/* Session Stats */}
        {history.length > 0 && (
          <div className="mt-4 text-center text-sm text-pure-white/60">
            Session: {history.length} games | Win rate: {winRate}%
          </div>
        )}
      </div>

      {/* Comparison note */}
      <div className="card max-w-2xl mx-auto bg-purple-900/20 border border-purple-600/30">
        <div className="text-sm text-pure-white/60 text-center">
          <p className="font-bold mb-2 text-purple-400">🔬 Experimental Comparison</p>
          <p>
            This is the Motoko implementation of Plinko.
            <a href="/plinko" className="text-dfinity-turquoise ml-1 hover:underline">
              Try the Rust version →
            </a>
          </p>
          <p className="text-xs text-pure-white/40 mt-2">
            Same game logic, different language. Compare performance!
          </p>
        </div>
      </div>

      {/* Plinko Board - Always 8 rows */}
      <div className="card max-w-4xl mx-auto">
        <PlinkoBoard
          rows={ROWS}
          path={currentResult?.path || null}
          isDropping={isPlaying}
          onAnimationComplete={handleAnimationComplete}
          finalPosition={currentResult?.final_position}
          multiResult={ballCount > 1 ? currentMultiResult : undefined}
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
        {currentResult && !isPlaying && ballCount === 1 && (
          <div className="text-center mt-6">
            <div className={`text-3xl font-bold mb-2 ${
              currentResult.multiplier >= 3 ? 'text-dfinity-red' :
              currentResult.win ? 'text-purple-400' :
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

        {/* Multi-Ball Result Display */}
        {currentMultiResult && !isPlaying && ballCount > 1 && (
          <div className="text-center mt-6 space-y-4">
            <div className={`text-3xl font-bold ${
              currentMultiResult.average_multiplier >= 3 ? 'text-dfinity-red' :
              currentMultiResult.average_multiplier >= 1 ? 'text-purple-400' :
              'text-gray-400'
            }`}>
              {currentMultiResult.average_multiplier >= 3 ? '🎉 BIG WIN!' :
               currentMultiResult.average_multiplier >= 1 ? '✨ WIN' :
               '💔 LOSS'}
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="bg-pure-white/5 p-4 rounded">
                <div className="text-sm text-pure-white/60">Balls Dropped</div>
                <div className="text-2xl font-bold text-purple-400">
                  {currentMultiResult.ball_count}
                </div>
              </div>
              <div className="bg-pure-white/5 p-4 rounded">
                <div className="text-sm text-pure-white/60">Total Multiplier</div>
                <div className="text-2xl font-bold text-dfinity-red">
                  {currentMultiResult.total_multiplier.toFixed(2)}x
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-600/20 to-dfinity-red/20 p-4 rounded max-w-md mx-auto">
              <div className="text-sm text-pure-white/60">Average Multiplier</div>
              <div className="text-3xl font-bold font-mono">
                {currentMultiResult.average_multiplier.toFixed(3)}x
              </div>
              <div className="text-sm text-pure-white/60 mt-2">
                Total Win: {(0.1 * currentMultiResult.ball_count * currentMultiResult.total_multiplier).toFixed(2)} ICP
              </div>
            </div>

            {/* Individual Ball Results */}
            <div className="mt-4">
              <div className="text-xs text-pure-white/40 mb-2">Individual Results:</div>
              <div className="flex flex-wrap justify-center gap-2">
                {currentMultiResult.balls.map((ball: any, idx: number) => (
                  <div
                    key={idx}
                    className={`
                      px-3 py-2 rounded text-sm font-mono
                      ${ball.multiplier >= 3 ? 'bg-dfinity-red/30 border border-dfinity-red' :
                        ball.win ? 'bg-green-900/30 border border-green-500/30' :
                        'bg-red-900/30 border border-red-500/30'}
                    `}
                  >
                    {ball.multiplier.toFixed(2)}x
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Game History */}
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-bold mb-4 text-center">Recent Drops</h3>
        {history.length === 0 ? (
          <div className="text-center text-gray-400 py-6">
            No games yet. Click DROP BALL to start!
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {history.slice(0, 20).map((item, index) => (
              <div
                key={item.clientId || index}
                className={`
                  p-2 text-center rounded
                  ${item.win
                    ? 'bg-green-900/30 border border-green-500/30'
                    : 'bg-red-900/30 border border-red-500/30'}
                `}
              >
                <div className="text-xs font-mono">
                  Pos {item.final_position}
                </div>
                <div className={`font-bold text-sm ${
                  item.multiplier >= 3 ? 'text-dfinity-red' :
                  item.win ? 'text-green-400' :
                  'text-red-400'
                }`}>
                  {item.multiplier.toFixed(2)}x
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GameLayout>
  );
};
