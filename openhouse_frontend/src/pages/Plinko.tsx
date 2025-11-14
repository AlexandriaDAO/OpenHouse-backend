import React, { useEffect, useState, useCallback } from 'react';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import {
  GameLayout,
  GameButton,
  GameStats,
  type GameStat,
} from '../components/game-ui';
import { PlinkoBoard, PlinkoControls, PlinkoMultipliers, type RiskLevel, type RowCount } from '../components/game-specific/plinko';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';

interface PlinkoGameResult {
  path: boolean[];
  final_position: number;
  multiplier: number;
  rows: number;
  risk: RiskLevel;
  timestamp: number;
  clientId?: string;
}

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [history, setHistory] = useState<PlinkoGameResult[]>([]);

  // Plinko-specific state
  const [rows, setRows] = useState<RowCount>(8);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Low');
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [currentResult, setCurrentResult] = useState<{ path: boolean[]; final_position: number; multiplier: number } | null>(null);

  // Load multipliers when rows or risk level changes
  useEffect(() => {
    const loadMultipliers = async () => {
      if (!actor) return;

      try {
        const riskVariant = riskLevel === 'Low' ? { Low: null } : riskLevel === 'Medium' ? { Medium: null } : { High: null };
        const mults = await actor.get_multipliers(rows, riskVariant);
        setMultipliers(mults);
      } catch (err) {
        console.error('Failed to load multipliers:', err);
      }
    };

    loadMultipliers();
  }, [rows, riskLevel, actor]);

  // Handle ball drop
  const dropBall = async () => {
    if (!actor) return;

    setIsPlaying(true);
    setGameError('');
    setCurrentResult(null);

    try {
      const riskVariant = riskLevel === 'Low' ? { Low: null } : riskLevel === 'Medium' ? { Medium: null } : { High: null };
      const result = await actor.drop_ball(rows, riskVariant);

      if ('Ok' in result) {
        const gameResult: PlinkoGameResult = {
          ...result.Ok,
          rows,
          risk: riskLevel,
          timestamp: Date.now(),
          clientId: crypto.randomUUID()
        };

        setCurrentResult(result.Ok);
        setHistory(prev => [gameResult, ...prev.slice(0, 9)]); // Keep last 10
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

  // Prepare stats for GameStats component
  const minMultiplier = multipliers.length > 0 ? Math.min(...multipliers) : 0;
  const maxMultiplier = multipliers.length > 0 ? Math.max(...multipliers) : 0;

  const stats: GameStat[] = [
    { label: 'Rows', value: `${rows}`, highlight: true, color: 'blue' },
    { label: 'Risk', value: riskLevel, highlight: true, color: riskLevel === 'Low' ? 'green' : riskLevel === 'Medium' ? 'yellow' : 'red' },
    { label: 'Min/Max', value: `${minMultiplier.toFixed(1)}x - ${maxMultiplier.toFixed(maxMultiplier >= 10 ? 0 : 1)}x` },
  ];

  return (
    <GameLayout
      title="Plinko"
      icon="🎯"
      description="Drop the ball and watch it bounce to a multiplier!"
      minBet={1}
      maxWin={1000}
      houseEdge={3}
    >
      {/* CONNECTION STATUS */}
      <ConnectionStatus game="plinko" />

      {/* GAME CONTROLS */}
      <div className="card max-w-2xl mx-auto">
        <PlinkoControls
          rows={rows}
          onRowsChange={setRows}
          riskLevel={riskLevel}
          onRiskLevelChange={setRiskLevel}
          disabled={isPlaying}
        />

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
      </div>

      {/* PLINKO BOARD */}
      <div className="card max-w-4xl mx-auto">
        <PlinkoBoard
          rows={rows}
          path={currentResult?.path || null}
          isDropping={isPlaying}
          onAnimationComplete={handleAnimationComplete}
          finalPosition={currentResult?.final_position}
        />

        {/* Multiplier display */}
        {multipliers.length > 0 && (
          <PlinkoMultipliers
            multipliers={multipliers}
            highlightedIndex={currentResult?.final_position}
          />
        )}

        {/* Win message */}
        {currentResult && !isPlaying && (
          <div className="text-center mt-6">
            <div className="text-3xl font-bold mb-2 text-dfinity-turquoise">
              {currentResult.multiplier >= 10 ? '🎉 BIG WIN!' : '✨'}
            </div>
            <div className="text-2xl font-mono text-yellow-500">
              {currentResult.multiplier.toFixed(currentResult.multiplier >= 10 ? 0 : 1)}x Multiplier
            </div>
          </div>
        )}
      </div>

      {/* Game History */}
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-bold mb-4 text-center">Recent Drops</h3>
        {history.length === 0 ? (
          <div className="text-center text-gray-400 py-6">
            No drops yet. Start playing!
          </div>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 10).map((item, index) => (
              <div
                key={item.clientId || index}
                className="bg-casino-primary border border-pure-white/10 p-3 flex justify-between items-center"
              >
                <span className="font-mono text-xs text-gray-400">
                  {item.rows}r {item.risk[0]}
                </span>
                <span className={`font-bold ${
                  item.multiplier >= 10 ? 'text-dfinity-red' :
                  item.multiplier >= 3 ? 'text-yellow-500' :
                  'text-dfinity-turquoise'
                }`}>
                  {item.multiplier.toFixed(item.multiplier >= 10 ? 0 : 1)}x
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </GameLayout>
  );
};
