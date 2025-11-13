import React, { useEffect, useState } from 'react';
import useDiceActor from '../hooks/actors/useDiceActor';
import { useAuth } from '../providers/AuthProvider';
import type { Principal } from '@dfinity/principal';

interface GameResult {
  player: Principal;
  bet_amount: bigint;
  target_number: number;
  direction: { Over: null } | { Under: null };
  rolled_number: number;
  win_chance: number;
  multiplier: number;
  payout: bigint;
  is_win: boolean;
  timestamp: bigint;
}

export const Dice: React.FC = () => {
  const { actor } = useDiceActor();
  const { isAuthenticated } = useAuth();
  const [greeting, setGreeting] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [testingConnection, setTestingConnection] = useState(false);
  const actorLoading = !actor;

  // Game state
  const [betAmount, setBetAmount] = useState(1);
  const [targetNumber, setTargetNumber] = useState(50);
  const [direction, setDirection] = useState<'Over' | 'Under'>('Over');
  const [winChance, setWinChance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);
  const [gameError, setGameError] = useState('');

  // Test backend connection when actor is ready
  useEffect(() => {
    const testConnection = async () => {
      if (!actor) return;

      setTestingConnection(true);
      setError('');

      try {
        const result = await actor.greet('Player');
        setGreeting(result);
      } catch (err) {
        console.error('Failed to connect to Dice backend:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setTestingConnection(false);
      }
    };

    testConnection();
  }, [actor]);

  // Calculate odds when target or direction changes
  useEffect(() => {
    let cancelled = false;

    const updateOdds = async () => {
      if (!actor) return;

      try {
        const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };
        const result = await actor.calculate_payout_info(targetNumber, directionVariant);

        if (!cancelled && 'Ok' in result) {
          const [chance, mult] = result.Ok;
          setWinChance(chance * 100);
          setMultiplier(mult);
        } else if (!cancelled && 'Err' in result) {
          setGameError(result.Err);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to calculate odds:', err);
        }
      }
    };

    updateOdds();

    return () => {
      cancelled = true;
    };
  }, [targetNumber, direction, actor]);

  // Load game history on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!actor) return;

      try {
        const history = await actor.get_recent_games(10);
        setGameHistory(history);
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };

    loadHistory();
  }, [actor]);

  // Handle dice roll (supports both practice and real mode)
  const rollDice = async () => {
    if (!actor) return;

    // Validate bet amount
    if (betAmount < 0.1 || betAmount > 100) {
      setGameError('Bet amount must be between 0.1 and 100 ICP');
      return;
    }

    setIsRolling(true);
    setGameError('');
    setLastResult(null);

    try {
      const betAmountE8s = BigInt(Math.floor(betAmount * 100_000_000));
      const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };

      // In practice mode (not authenticated), still call backend but it won't affect real balances
      const result = await actor.play_dice(betAmountE8s, targetNumber, directionVariant);

      if ('Ok' in result) {
        setLastResult(result.Ok);
        setGameHistory(prev => [result.Ok, ...prev.slice(0, 9)]);
      } else {
        setGameError(result.Err);
      }
    } catch (err) {
      console.error('Failed to roll dice:', err);
      setGameError(err instanceof Error ? err.message : 'Failed to roll dice');
    } finally {
      setIsRolling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Game Header */}
      <div className="text-center">
        <div className="text-6xl mb-4">🎲</div>
        <div className="flex items-center justify-center gap-3 mb-2">
          <h1 className="text-4xl font-bold">Dice Game</h1>
          {!isAuthenticated && (
            <span className="bg-yellow-900/30 border border-yellow-500/50 text-yellow-400 text-sm font-bold px-3 py-1 rounded-full">
              PRACTICE MODE
            </span>
          )}
        </div>
        <p className="text-gray-400">Roll over or under your target number!</p>
        {!isAuthenticated && (
          <p className="text-yellow-400 text-sm mt-2">
            🎮 Playing with virtual ICP • Login to bet real ICP
          </p>
        )}
      </div>

      {/* Connection Status */}
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-bold mb-4">Backend Connection Status</h3>

        {actorLoading && (
          <div className="flex items-center gap-3 text-yellow-400">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-400"></div>
            <span>Initializing actor...</span>
          </div>
        )}

        {!actorLoading && actor && !testingConnection && !error && greeting && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-green-400">
              <span className="text-2xl">✅</span>
              <span className="font-semibold">Connected to Dice Backend</span>
            </div>
            <div className="bg-casino-primary rounded p-3 text-sm">
              <div className="text-gray-400 mb-1">Backend Response:</div>
              <div className="font-mono">{greeting}</div>
            </div>
            <div className="text-sm text-gray-400">
              Canister ID: <span className="font-mono">whchi-hyaaa-aaaao-a4ruq-cai</span>
            </div>
          </div>
        )}

        {testingConnection && (
          <div className="flex items-center gap-3 text-blue-400">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
            <span>Testing backend connection...</span>
          </div>
        )}

        {error && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-red-400">
              <span className="text-2xl">❌</span>
              <span className="font-semibold">Connection Failed</span>
            </div>
            <div className="bg-red-900/20 border border-red-500/50 rounded p-3 text-sm">
              <div className="text-red-400 mb-1">Error:</div>
              <div className="font-mono text-xs">{error}</div>
            </div>
          </div>
        )}
      </div>

      {/* Practice Mode Info */}
      {!isAuthenticated && (
        <div className="card max-w-2xl mx-auto bg-yellow-900/10 border-2 border-yellow-500/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎮</span>
            <div>
              <h3 className="font-bold mb-1 text-yellow-400">Practice Mode Active</h3>
              <p className="text-sm text-gray-300 mb-2">
                You're playing with <strong>virtual ICP</strong> to test the game. Your bets and winnings
                are simulated and won't affect real balances.
              </p>
              <p className="text-sm text-gray-400">
                Ready to play for real? Click <strong>"Login to Play"</strong> in the header to authenticate
                with Internet Identity and start betting real ICP.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* BETTING CONTROLS */}
      <div className="card max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Place Your Bet</h3>
          {!isAuthenticated && (
            <span className="bg-yellow-900/30 border border-yellow-500/50 text-yellow-400 text-xs font-bold px-2 py-1 rounded">
              VIRTUAL ICP
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left column: Bet controls */}
          <div className="space-y-4">
            {/* Bet Amount Input */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Bet Amount ({!isAuthenticated ? 'Virtual ' : ''}ICP)
              </label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={betAmount}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0.1 && val <= 100) {
                    setBetAmount(val);
                  }
                }}
                className="w-full bg-casino-primary border border-casino-accent rounded px-4 py-2"
                disabled={isRolling}
              />
            </div>

            {/* Target Number Slider */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Target Number: <span className="text-white font-bold">{targetNumber}</span>
              </label>
              <input
                type="range"
                min="1"
                max="99"
                value={targetNumber}
                onChange={(e) => setTargetNumber(parseInt(e.target.value))}
                className="w-full"
                disabled={isRolling}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1</span>
                <span>50</span>
                <span>99</span>
              </div>
            </div>

            {/* Direction Toggle */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Direction
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDirection('Over')}
                  disabled={isRolling}
                  className={`flex-1 py-3 px-4 rounded font-bold transition ${
                    direction === 'Over'
                      ? 'bg-green-600 text-white'
                      : 'bg-casino-primary text-gray-400 hover:bg-casino-accent'
                  }`}
                >
                  OVER {targetNumber}
                </button>
                <button
                  onClick={() => setDirection('Under')}
                  disabled={isRolling}
                  className={`flex-1 py-3 px-4 rounded font-bold transition ${
                    direction === 'Under'
                      ? 'bg-red-600 text-white'
                      : 'bg-casino-primary text-gray-400 hover:bg-casino-accent'
                  }`}
                >
                  UNDER {targetNumber}
                </button>
              </div>
            </div>
          </div>

          {/* Right column: Odds display */}
          <div className="space-y-4">
            {/* Win Chance */}
            <div className="bg-casino-primary rounded p-4">
              <div className="text-sm text-gray-400 mb-1">Win Chance</div>
              <div className="text-3xl font-bold text-casino-highlight">
                {winChance.toFixed(2)}%
              </div>
            </div>

            {/* Multiplier */}
            <div className="bg-casino-primary rounded p-4">
              <div className="text-sm text-gray-400 mb-1">Multiplier</div>
              <div className="text-3xl font-bold text-green-400">
                {multiplier.toFixed(2)}x
              </div>
            </div>

            {/* Potential Payout */}
            <div className="bg-casino-primary rounded p-4">
              <div className="text-sm text-gray-400 mb-1">Potential Win</div>
              <div className="text-2xl font-bold">
                {(betAmount * multiplier).toFixed(2)} {!isAuthenticated ? 'Virtual ' : ''}ICP
              </div>
            </div>
          </div>
        </div>

        {/* Roll Button */}
        <button
          onClick={rollDice}
          disabled={isRolling || !actor}
          className="w-full mt-6 bg-casino-highlight hover:bg-casino-highlight/80 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-lg text-xl transition"
        >
          {isRolling ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              Rolling...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              🎲 ROLL DICE
              {!isAuthenticated && <span className="text-sm font-normal opacity-80">(Practice)</span>}
            </span>
          )}
        </button>

        {/* Error Display */}
        {gameError && (
          <div className="mt-4 bg-red-900/20 border border-red-500/50 rounded p-3 text-red-400">
            {gameError}
          </div>
        )}
      </div>

      {/* RESULT DISPLAY */}
      {lastResult && (
        <div className="card max-w-4xl mx-auto">
          <h3 className="font-bold mb-4">Result</h3>

          <div className={`rounded-lg p-8 text-center ${
            lastResult.is_win ? 'bg-green-900/20 border-2 border-green-500' : 'bg-red-900/20 border-2 border-red-500'
          }`}>
            {/* Rolled Number Display */}
            <div className="text-8xl font-bold mb-4">
              {lastResult.rolled_number}
            </div>

            {/* Win/Loss Message */}
            <div className={`text-3xl font-bold mb-4 ${lastResult.is_win ? 'text-green-400' : 'text-red-400'}`}>
              {lastResult.is_win ? '🎉 YOU WIN!' : '😢 YOU LOSE'}
            </div>

            {/* Details */}
            <div className="text-gray-300 space-y-1">
              <div>
                Target: {lastResult.target_number} ({Object.keys(lastResult.direction)[0]})
              </div>
              <div>
                Win Chance: {(lastResult.win_chance * 100).toFixed(2)}%
              </div>
              {lastResult.is_win && (
                <div className="text-2xl text-green-400 font-bold mt-2">
                  +{(Number(lastResult.payout) / 100_000_000).toFixed(2)} {!isAuthenticated ? 'Virtual ' : ''}ICP
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GAME HISTORY */}
      {gameHistory.length > 0 && (
        <div className="card max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Recent Games</h3>
            {!isAuthenticated && (
              <span className="bg-yellow-900/30 border border-yellow-500/50 text-yellow-400 text-xs font-bold px-2 py-1 rounded">
                PRACTICE ROLLS
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-casino-accent">
                <tr className="text-gray-400">
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">Direction</th>
                  <th className="text-left py-2">Roll</th>
                  <th className="text-left py-2">Result</th>
                  <th className="text-right py-2">Payout</th>
                </tr>
              </thead>
              <tbody>
                {gameHistory.map((game) => (
                  <tr key={`${game.timestamp.toString()}-${game.player.toString()}`} className="border-b border-casino-primary/50">
                    <td className="py-2">{game.target_number}</td>
                    <td className="py-2">
                      <span className={Object.keys(game.direction)[0] === 'Over' ? 'text-green-400' : 'text-red-400'}>
                        {Object.keys(game.direction)[0]}
                      </span>
                    </td>
                    <td className="py-2 font-bold">{game.rolled_number}</td>
                    <td className="py-2">
                      <span className={game.is_win ? 'text-green-400' : 'text-red-400'}>
                        {game.is_win ? 'Win' : 'Loss'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {game.is_win ? `+${(Number(game.payout) / 100_000_000).toFixed(2)}` : '0.00'} {!isAuthenticated ? 'Virtual ' : ''}ICP
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Game Info */}
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-bold mb-4">Game Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Min Bet:</span>
            <span className="font-semibold">1 ICP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Max Win:</span>
            <span className="font-semibold text-casino-highlight">100x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">House Edge:</span>
            <span className="font-semibold">3%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Roll Range:</span>
            <span className="font-semibold">0-100</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Win Chance:</span>
            <span className="font-semibold">1% to 98%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
