import React, { useEffect, useState } from 'react';
import useMinesActor from '../hooks/actors/useMinesActor';
import { useAuth } from '../providers/AuthProvider';
import type { GameInfo } from '../declarations/mines_backend/mines_backend.did';

export const Mines: React.FC = () => {
  const { actor } = useMinesActor();
  const { isAuthenticated } = useAuth();
  const [greeting, setGreeting] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [testingConnection, setTestingConnection] = useState(false);
  const actorLoading = !actor;

  // Game state
  const [betAmount, setBetAmount] = useState<string>('0.1');
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(null);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [message, setMessage] = useState<string>('');

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
        console.error('Failed to connect to Mines backend:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setTestingConnection(false);
      }
    };

    testConnection();
  }, [actor]);

  // Fetch game state
  const fetchGameState = async (gameId: bigint) => {
    if (!actor) return;
    try {
      const result = await actor.get_game(gameId);
      if ('Ok' in result) {
        setGameInfo(result.Ok);
      }
    } catch (err) {
      console.error('Failed to fetch game state:', err);
    }
  };

  // Start new game
  const startGame = async () => {
    if (!actor || !isAuthenticated) {
      setMessage('Please login to play');
      return;
    }

    const bet = parseFloat(betAmount);
    if (bet < 0.1 || bet > 1) {
      setMessage('Bet must be between 0.1 and 1 ICP');
      return;
    }

    setMessage('Starting game...');
    setError('');

    try {
      const betE8s = BigInt(Math.floor(bet * 100_000_000));
      const result = await actor.start_game(betE8s);

      if ('Ok' in result) {
        const gameId = result.Ok;
        setCurrentGameId(gameId);
        setIsPlaying(true);
        setMessage(`Game started! Bet: ${bet} ICP`);
        await fetchGameState(gameId);
      } else {
        setError(result.Err);
        setMessage('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessage('');
    }
  };

  // Reveal a tile
  const revealTile = async (position: number) => {
    if (!actor || !currentGameId || !isPlaying) return;

    try {
      const result = await actor.reveal_tile(currentGameId, position);

      if ('Ok' in result) {
        if (result.Ok.busted) {
          setMessage('💥 BUSTED! You hit a mine!');
          setIsPlaying(false);
        } else {
          setMessage(`Safe! Multiplier: ${result.Ok.multiplier.toFixed(2)}x`);
        }
        await fetchGameState(currentGameId);
      } else {
        setError(result.Err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Cash out
  const cashOut = async () => {
    if (!actor || !currentGameId) return;

    setMessage('Cashing out...');

    try {
      const result = await actor.cash_out(currentGameId);

      if ('Ok' in result) {
        const payoutE8s = result.Ok;
        const payoutICP = Number(payoutE8s) / 100_000_000;
        setMessage(`🎉 You won ${payoutICP.toFixed(4)} ICP!`);
        setIsPlaying(false);
        setCurrentGameId(null);
        setGameInfo(null);
      } else {
        setError(result.Err);
        setMessage('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessage('');
    }
  };

  const currentMultiplier = gameInfo?.current_multiplier || 1.0;
  const potentialWin = parseFloat(betAmount) * currentMultiplier;

  return (
    <div className="space-y-6">
      {/* DEMO MODE Warning Banner */}
      <div className="card max-w-4xl mx-auto bg-red-900/30 border-2 border-red-500">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⚠️</span>
          <div className="flex-1">
            <h3 className="font-bold text-red-400 text-lg mb-1">DEMO MODE - NO REAL ICP TRANSFERS</h3>
            <p className="text-sm text-red-300">
              This is a demonstration version for testing game mechanics only.
              All ICP transfers are SIMULATED. Balances shown are fictional.
              <strong className="text-red-200"> DO NOT use with real funds!</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Game Header */}
      <div className="text-center">
        <div className="text-6xl mb-4">💣</div>
        <h1 className="text-4xl font-bold mb-2">Mines Game <span className="text-sm text-red-400">(DEMO)</span></h1>
        <p className="text-gray-400">Navigate the minefield to increase your multiplier!</p>
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
              <span className="font-semibold">Connected to Mines Backend</span>
            </div>
            <div className="bg-casino-primary rounded p-3 text-sm">
              <div className="text-gray-400 mb-1">Backend Response:</div>
              <div className="font-mono">{greeting}</div>
            </div>
            <div className="text-sm text-gray-400">
              Canister ID: <span className="font-mono">wvrcw-3aaaa-aaaah-arm4a-cai</span>
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

      {/* Authentication Notice */}
      {!isAuthenticated && (
        <div className="card max-w-2xl mx-auto bg-casino-accent">
          <div className="flex items-start gap-3">
            <span className="text-2xl">ℹ️</span>
            <div>
              <h3 className="font-bold mb-1">Login Required to Play</h3>
              <p className="text-sm text-gray-300">
                You're currently in anonymous mode. Click "Login to Play" in the header to authenticate
                with Internet Identity and start placing bets.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {message && (
        <div className="card max-w-2xl mx-auto bg-blue-900/20 border border-blue-500/50">
          <p className="text-center text-blue-300">{message}</p>
        </div>
      )}

      {/* Bet Controls */}
      {!isPlaying && (
        <div className="card max-w-2xl mx-auto">
          <h3 className="font-bold mb-4">Place Your Bet</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Bet Amount (ICP)</label>
              <input
                type="number"
                min="0.1"
                max="1"
                step="0.1"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-full bg-casino-primary border border-casino-accent rounded px-4 py-2 text-white"
                disabled={!isAuthenticated}
              />
              <div className="text-xs text-gray-500 mt-1">Min: 0.1 ICP | Max: 1 ICP</div>
            </div>
            <button
              onClick={startGame}
              disabled={!isAuthenticated || actorLoading}
              className="btn-primary w-full"
            >
              Start Game ({betAmount} ICP)
            </button>
          </div>
        </div>
      )}

      {/* Game Area */}
      {isPlaying && gameInfo && (
        <div className="card max-w-4xl mx-auto">
          <div className="mb-4 flex justify-between items-center">
            <h3 className="font-bold">5×5 Minefield</h3>
            <div className="text-right">
              <div className="text-sm text-gray-400">Current Multiplier</div>
              <div className="text-2xl font-bold text-casino-highlight">
                {currentMultiplier.toFixed(2)}x
              </div>
              <div className="text-sm text-gray-400">
                Potential Win: {potentialWin.toFixed(4)} ICP
              </div>
              {currentMultiplier >= 10 && (
                <div className="text-xs text-yellow-400 font-bold">MAX WIN REACHED!</div>
              )}
            </div>
          </div>

          {/* 5x5 Grid */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {Array.from({ length: 25 }).map((_, index) => {
              const isRevealed = gameInfo.revealed[index];
              return (
                <button
                  key={index}
                  onClick={() => revealTile(index)}
                  disabled={isRevealed || !gameInfo.is_active}
                  className={`aspect-square rounded-lg text-2xl font-bold transition-all ${
                    isRevealed
                      ? 'bg-green-600 text-white'
                      : 'bg-casino-accent hover:bg-casino-highlight hover:scale-105'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isRevealed ? '✓' : '?'}
                </button>
              );
            })}
          </div>

          {/* Cash Out Button */}
          {gameInfo.is_active && (
            <button onClick={cashOut} className="btn-secondary w-full">
              Cash Out - Win {potentialWin.toFixed(4)} ICP
            </button>
          )}
        </div>
      )}

      {/* Game Info */}
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-bold mb-4">Game Information <span className="text-xs text-red-400">(DEMO VALUES)</span></h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Min Bet:</span>
            <span className="font-semibold">0.1 ICP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Max Bet:</span>
            <span className="font-semibold">1 ICP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Max Win:</span>
            <span className="font-semibold text-casino-highlight">10 ICP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Max Multiplier:</span>
            <span className="font-semibold text-casino-highlight">10x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">House Edge:</span>
            <span className="font-semibold">1%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Grid Size:</span>
            <span className="font-semibold">5x5</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Mines:</span>
            <span className="font-semibold">5 (fixed)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
