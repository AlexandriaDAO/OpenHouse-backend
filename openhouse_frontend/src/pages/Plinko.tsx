import React, { useEffect, useState, useCallback } from 'react';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import { GameLayout } from '../components/game-ui';
import { PlinkoBoard, LeverDropButton } from '../components/game-specific/plinko';

// Game Constants
const ROWS = 8;
const MAX_BALLS = 30;
const ANIMATION_SAFETY_TIMEOUT_MS = 15000; // 15s fallback to prevent UI lock

interface PlinkoGameResult {
  path: boolean[];
  final_position: number;
  multiplier: number;
  win: boolean;
  timestamp: number;
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

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [ballCount, setBallCount] = useState<number>(1);
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [formula, setFormula] = useState<string>('');
  const [expectedValue, setExpectedValue] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<PlinkoGameResult | null>(null);
  const [multiBallResult, setMultiBallResult] = useState<MultiBallBackendResult | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Load game data on mount
  useEffect(() => {
    const loadGameData = async () => {
      if (!actor) return;

      try {
        const [multsBp, formulaText, ev] = await Promise.all([
          // @ts-ignore - using new API method which may not be in types yet
          actor.get_multipliers_bp ? actor.get_multipliers_bp() : actor.get_multipliers(),
          actor.get_formula(),
          actor.get_expected_value()
        ]);

        // Handle basis points (BigInt) or legacy float
        let finalMults: number[];
        if (multsBp && multsBp.length > 0 && typeof multsBp[0] === 'bigint') {
             finalMults = multsBp.map((bp: bigint) => Number(bp) / 10000);
        } else {
             finalMults = multsBp as number[];
        }

        setMultipliers(finalMults);
        setFormula(formulaText);
        setExpectedValue(ev);
      } catch (err) {
        console.error('Failed to load game data:', err);
      }
    };

    loadGameData();
  }, [actor]);

  // Safety timeout to prevent UI lock
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

  // Drop ball(s) function
  const dropBalls = async () => {
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
          setCurrentResult(gameResult);
        } else {
          setGameError(result.Err);
          setIsPlaying(false);
        }
      } else {
        // Use multi-ball method
        const result = await actor.drop_multiple_balls(ballCount);

        if ('Ok' in result) {
          setMultiBallResult(result.Ok);
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

  // Calculate house edge for modal
  const houseEdge = ((1 - expectedValue) * 100).toFixed(2);

  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col max-w-3xl mx-auto px-4 overflow-hidden min-h-0 w-full">

        {/* SECTION 1: CONTROLS PANEL - TOP (where balls drop from) */}
        <div className="flex-shrink-0 py-6">
          <div className="bg-gray-900/50 backdrop-blur rounded-t-3xl border border-gray-700 p-6">

            {/* Ball count slider */}
            <div className="mb-6">
              <div className="flex items-center gap-4 mb-2">
                <span className="text-sm text-gray-400 w-28">Number of Balls</span>
                <span className="text-sm text-white font-mono ml-auto">{ballCount}</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                value={ballCount}
                onChange={(e) => setBallCount(Number(e.target.value))}
                disabled={isPlaying}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                         disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* LEVER DROP BUTTON */}
            <LeverDropButton
              onClick={dropBalls}
              disabled={!actor || isPlaying}
              isActive={isPlaying}
              ballCount={ballCount}
            />
          </div>
        </div>

        {/* SECTION 2: GAME BOARD - CENTER (with integrated multipliers) */}
        <div className="flex-shrink-0 py-4 flex justify-center">
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
            multipliers={multipliers} // NEW: Pass multipliers to board
          />
        </div>

        {/* SECTION 3: RESULT DISPLAY - BOTTOM (compact) */}
        <div className="h-10 flex items-center justify-center flex-shrink-0">
          {!isPlaying && currentResult && (
            <span className={`font-bold ${currentResult.win ? 'text-green-400' : 'text-red-400'}`}>
              {currentResult.win ? 'WIN' : 'LOST'} {currentResult.multiplier.toFixed(2)}x
            </span>
          )}
          {!isPlaying && multiBallResult && (
            <span className="text-sm text-gray-300">
              AVG {multiBallResult.average_multiplier.toFixed(2)}x
              ({multiBallResult.total_wins}/{multiBallResult.total_balls} wins)
            </span>
          )}
        </div>

        {/* Error display */}
        {gameError && (
          <div className="text-red-400 text-xs text-center py-2 flex-shrink-0">
            {gameError}
          </div>
        )}

        {/* Info button */}
        <div className="flex justify-end pt-4 pb-4 flex-shrink-0">
          <button
            onClick={() => setShowInfoModal(true)}
            className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700
                     text-gray-400 hover:text-white transition-colors
                     flex items-center justify-center"
          >
            ?
          </button>
        </div>
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

// Info Modal Component
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
          <button onClick={props.onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
        </div>

        <div className="text-sm text-gray-300 space-y-4">
          {/* Formula */}
          <div>
            <p className="font-semibold text-white mb-1">The Formula</p>
            <code className="text-sm font-mono text-dfinity-turquoise bg-black/50 px-3 py-1 rounded block">
              {props.formula || 'M(k) = 0.2 + 6.32 × ((k-4)/4)²'}
            </code>
          </div>

          {/* House Edge */}
          <div>
            <p className="font-semibold text-white mb-1">House Edge</p>
            <p>{props.houseEdge}% (Expected Value: {props.expectedValue.toFixed(4)})</p>
          </div>

          {/* Probability Distribution */}
          <div>
            <p className="font-semibold text-white mb-1">Probability Distribution</p>
            <p className="font-mono text-xs text-gray-400">
              0.4% | 3.1% | 10.9% | 21.9% | 27.3% | 21.9% | 10.9% | 3.1% | 0.4%
            </p>
          </div>

          {/* Win Zones */}
          <div>
            <p className="font-semibold text-white mb-1">Win Zones</p>
            <p>
              <span className="text-green-400">Edges (29%)</span> = Win (1x+) |
              <span className="text-red-400 ml-1">Center (71%)</span> = Loss (&lt;1x)
            </p>
          </div>

          {/* Multipliers */}
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