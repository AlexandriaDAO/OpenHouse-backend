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

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();

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

  // Drop ball - simple one-click action
  const dropBall = async () => {
    if (!actor) return;

    setIsPlaying(true);
    setGameError('');
    setCurrentResult(null);

    try {
      const result = await actor.drop_ball();

      if ('Ok' in result) {
        const gameResult: PlinkoGameResult = {
          ...result.Ok,
          timestamp: Date.now(),
          clientId: crypto.randomUUID()
        };

        setCurrentResult(gameResult);
        setHistory(prev => [gameResult, ...prev.slice(0, 19)]); // Keep last 20
      } else {
        setGameError(result.Err);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Failed to drop ball:', err);
      setGameError(err instanceof Error ? err.message : 'Failed to drop ball');
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

        <GameButton
          onClick={dropBall}
          disabled={!actor}
          loading={isPlaying}
          label="DROP BALL"
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

      {/* Plinko Board - Always 8 rows */}
      <div className="card max-w-4xl mx-auto">
        <PlinkoBoard
          rows={ROWS}
          path={currentResult?.path || null}
          isDropping={isPlaying}
          onAnimationComplete={handleAnimationComplete}
          finalPosition={currentResult?.final_position}
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
