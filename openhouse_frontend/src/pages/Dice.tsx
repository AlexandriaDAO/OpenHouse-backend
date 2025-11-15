import React, { useEffect, useState, useCallback } from 'react';
import useDiceActor from '../hooks/actors/useDiceActor';
import {
  GameLayout,
  BetAmountInput,
  GameButton,
  GameHistory,
  GameStats,
  type GameStat,
} from '../components/game-ui';
import { DiceAnimation, DiceControls, DiceAccountingPanel, type DiceDirection } from '../components/game-specific/dice';
import { useGameMode, useGameState } from '../hooks/games';
import { useGameBalance } from '../providers/GameBalanceProvider';
import type { Principal } from '@dfinity/principal';

// ICP conversion constant
const E8S_PER_ICP = 100_000_000; // 1 ICP = 100,000,000 e8s

interface DiceGameResult {
  game_id?: bigint;  // Add game_id field
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
  clientId?: string;
}

// Add new interface for detailed history
interface DetailedGameHistory {
  game_id: bigint;
  player: string;
  bet_icp: number;
  won_icp: number;
  target_number: number;
  direction: string;
  rolled_number: number;
  win_chance: number;
  multiplier: number;
  is_win: boolean;
  timestamp: bigint;
  profit_loss: bigint;
  expected_value: number;
  house_edge_actual: number;
}

export const Dice: React.FC = () => {
  const { actor } = useDiceActor();
  const gameMode = useGameMode();
  // Initialize with conservative default, will be updated dynamically
  const [maxBet, setMaxBet] = useState(10); // Dynamic max bet in ICP
  const gameState = useGameState<DiceGameResult>(0.01, maxBet);
  // Use global balance state
  const gameBalanceContext = useGameBalance('dice');
  const balance = gameBalanceContext.balance;
  const refreshBalance = gameBalanceContext.refresh;
  // Note: Disabled useGameHistory to prevent infinite loop - using gameState.history instead
  // const { history } = useGameHistory<DiceGameResult>(actor, 'get_recent_games', 10);

  // Dice-specific state
  const [targetNumber, setTargetNumber] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>('Over');
  const [winChance, setWinChance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [animatingResult, setAnimatingResult] = useState<number | null>(null);

  // State for detailed history (TODO: implement when backend methods are available)
  // @ts-ignore - Keeping for future implementation
  const [detailedHistory, setDetailedHistory] = useState<DetailedGameHistory[]>([]);
  const [showDetailedView, setShowDetailedView] = useState(false);
  // @ts-ignore - Keeping for future implementation
  const [csvExport, setCsvExport] = useState<string>('');

  // Calculate odds when target or direction changes
  useEffect(() => {
    const updateOdds = async () => {
      if (!actor) return;

      try {
        const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };

        // Get payout info (existing)
        const result = await actor.calculate_payout_info(targetNumber, directionVariant);

        if ('Ok' in result) {
          const [chance, mult] = result.Ok;
          setWinChance(chance * 100);
          setMultiplier(mult);
        } else if ('Err' in result) {
          gameState.setGameError(result.Err);
        }

        // Get max bet (NEW) - with error handling
        try {
          const maxBetE8s = await actor.get_max_bet(targetNumber, directionVariant);
          const maxBetICP = Number(maxBetE8s) / E8S_PER_ICP;
          setMaxBet(maxBetICP);

          // Adjust current bet if it exceeds new max (NEW)
          if (gameState.betAmount > maxBetICP) {
            gameState.setBetAmount(maxBetICP);
          }
        } catch (maxBetError) {
          console.error('Failed to get max bet, using default:', maxBetError);
          // Use a safe default if the call fails
          setMaxBet(10);
        }
      } catch (err) {
        console.error('Failed to calculate odds:', err);
      }
    };

    updateOdds();
  }, [targetNumber, direction, actor]);

  // Load initial game history on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!actor) return;

      try {
        // Load regular history for animation
        const games = await actor.get_recent_games(10);
        // Process all games at once to avoid multiple state updates
        const processedGames = games.map((game: DiceGameResult) => ({
          ...game,
          clientId: crypto.randomUUID()
        }));

        // Add all games in a single batch if we have a batch method
        processedGames.forEach((game: DiceGameResult) => {
          gameState.addToHistory(game);
        });

        // TODO: Load detailed history for display (method not yet implemented)
        // const detailed = await actor.get_detailed_history(20);
        // setDetailedHistory(detailed);

        // TODO: Get CSV export (method not yet implemented)
        // const csv = await actor.export_history_csv(100);
        // setCsvExport(csv);
      } catch (err) {
        console.error('Failed to load game history:', err);
      }
    };

    loadHistory();
  }, [actor]); // Only depend on actor, not gameState to avoid loops

  // Load initial balances on mount and set up periodic refresh
  useEffect(() => {
    if (actor) {
      // Pre-fetch balances immediately on mount
      refreshBalance().catch(console.error);

      // Set up periodic refresh every 30 seconds
      const intervalId = setInterval(() => {
        refreshBalance().catch(console.error);
      }, 30000);

      // Refresh when tab regains focus
      const handleFocus = () => {
        refreshBalance().catch(console.error);
      };
      window.addEventListener('focus', handleFocus);

      // Cleanup
      return () => {
        clearInterval(intervalId);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [actor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh callback for accounting panel
  const handleBalanceChange = useCallback(async () => {
    await refreshBalance();
  }, [refreshBalance]);

  // Handle dice roll
  const rollDice = async () => {
    if (!actor || !gameState.validateBet()) return;

    // Frontend validation: Check if house can afford the potential payout BEFORE starting animation
    const maxPayout = BigInt(Math.floor(gameState.betAmount * multiplier * E8S_PER_ICP));
    if (maxPayout > balance.house) {
      const houseBalanceICP = Number(balance.house) / E8S_PER_ICP;
      const maxPayoutICP = Number(maxPayout) / E8S_PER_ICP;
      gameState.setGameError(
        `Bet too large. House only has ${houseBalanceICP.toFixed(4)} ICP, ` +
        `but max payout would be ${maxPayoutICP.toFixed(4)} ICP (${multiplier.toFixed(2)}x multiplier). ` +
        `Please lower your bet or choose different odds.`
      );
      return;
    }

    gameState.setIsPlaying(true);
    gameState.clearErrors();
    setAnimatingResult(null);

    // Create a timeout promise that rejects after 15 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Game timed out. Please try again.')), 15000);
    });

    try {
      const betAmountE8s = BigInt(Math.floor(gameState.betAmount * E8S_PER_ICP));
      const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };

      // Generate client seed for provable fairness
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const clientSeed = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');

      // Race between the actual call and timeout
      const result = await Promise.race([
        actor.play_dice(betAmountE8s, targetNumber, directionVariant, clientSeed),
        timeoutPromise
      ]);

      if ('Ok' in result) {
        setAnimatingResult(result.Ok.rolled_number);
        gameState.addToHistory(result.Ok);

        // TODO: Refresh detailed history after each game (method not yet implemented)
        // const detailed = await actor.get_detailed_history(20);
        // setDetailedHistory(detailed);

        // TODO: Refresh CSV export (method not yet implemented)
        // const csv = await actor.export_history_csv(100);
        // setCsvExport(csv);

        // P1 fix: Refresh balance after game completes (non-blocking to avoid UI delay)
        refreshBalance().catch(console.error);
      } else {
        gameState.setGameError(result.Err);
        gameState.setIsPlaying(false);
      }
    } catch (err) {
      console.error('Failed to roll dice:', err);
      gameState.setGameError(err instanceof Error ? err.message : 'Failed to roll dice');
      gameState.setIsPlaying(false);
    }
  };

  const handleAnimationComplete = useCallback(() => {
    gameState.setIsPlaying(false);
  }, []);

  // Prepare stats for GameStats component
  const stats: GameStat[] = [
    { label: 'Win Chance', value: `${winChance.toFixed(2)}%`, highlight: true, color: 'yellow' },
    { label: 'Multiplier', value: `${multiplier.toFixed(2)}x`, highlight: true, color: 'green' },
    { label: 'Max Bet', value: `${maxBet.toFixed(4)} ICP`, highlight: true, color: 'blue' },
    { label: 'Win Amount', value: `${(gameState.betAmount * multiplier).toFixed(2)} ICP` },
  ];

  // Custom renderer for history items
  const renderHistoryItem = (item: DiceGameResult) => (
    <>
      <span className="font-mono">{item.rolled_number}</span>
      <span className={item.is_win ? 'text-green-400' : 'text-red-400'}>
        {item.is_win ? '✓' : '✗'}
      </span>
    </>
  );

  return (
    <GameLayout
      title="Dice"
      icon="🎲"
      description="Roll the dice and predict over or under!"
      minBet={1}
      maxWin={100}
      houseEdge={3}
    >
      {/* ACCOUNTING PANEL */}
      <DiceAccountingPanel
        gameBalance={balance.game}
        onBalanceChange={handleBalanceChange}
      />

      {/* BETTING CONTROLS */}
      <div className="card max-w-2xl mx-auto">
        <BetAmountInput
          value={gameState.betAmount}
          onChange={gameState.setBetAmount}
          min={0.01}
          max={maxBet}
          disabled={gameState.isPlaying}
          isPracticeMode={gameMode.isPracticeMode}
          error={gameState.betError}
          variant="slider"
        />

        <DiceControls
          targetNumber={targetNumber}
          onTargetChange={setTargetNumber}
          direction={direction}
          onDirectionChange={setDirection}
          disabled={gameState.isPlaying}
        />

        <GameStats stats={stats} />

        <GameButton
          onClick={rollDice}
          disabled={!actor}
          loading={gameState.isPlaying}
          label="ROLL"
          loadingLabel="Rolling..."
          icon="🎲"
        />

        {gameState.gameError && (
          <div className="mt-4 text-red-400 text-sm text-center">
            {gameState.gameError}
          </div>
        )}
      </div>

      {/* Dice Animation */}
      <div className="card max-w-2xl mx-auto">
        <DiceAnimation
          targetNumber={animatingResult}
          isRolling={gameState.isPlaying}
          onAnimationComplete={handleAnimationComplete}
        />

        {/* Win/Loss message */}
        {gameState.lastResult && !gameState.isPlaying && (
          <div className={`text-center mt-6 ${
            gameState.lastResult.is_win ? 'text-green-400' : 'text-red-400'
          }`}>
            <div className="text-3xl font-bold mb-2">
              {gameState.lastResult.is_win ? '🎉 WIN!' : '😢 LOSE'}
            </div>
            {gameState.lastResult.is_win && (
              <div className="text-xl">
                +{(Number(gameState.lastResult.payout) / 100_000_000).toFixed(2)} ICP
              </div>
            )}
          </div>
        )}
      </div>

      {/* Game History Section */}
      <div className="card max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Game History</h3>
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              onClick={() => setShowDetailedView(!showDetailedView)}
            >
              {showDetailedView ? 'Simple' : 'Detailed'} View
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(csvExport);
                alert('History copied to clipboard!');
              }}
            >
              Copy CSV
            </button>
          </div>
        </div>

        {showDetailedView ? (
          // Detailed table view
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Bet (ICP)</th>
                  <th>Target</th>
                  <th>Dir</th>
                  <th>Roll</th>
                  <th>Chance</th>
                  <th>Multi</th>
                  <th>Won (ICP)</th>
                  <th>P/L</th>
                </tr>
              </thead>
              <tbody>
                {detailedHistory.slice(0, 10).map((game) => (
                  <tr key={String(game.game_id)} className={game.is_win ? 'text-green-400' : 'text-red-400'}>
                    <td>{String(game.game_id)}</td>
                    <td>{game.bet_icp.toFixed(4)}</td>
                    <td>{game.target_number}</td>
                    <td>{game.direction}</td>
                    <td>{game.rolled_number}</td>
                    <td>{game.win_chance.toFixed(1)}%</td>
                    <td>{game.multiplier.toFixed(2)}x</td>
                    <td>{game.won_icp.toFixed(4)}</td>
                    <td>{game.is_win ? '+' : '-'}{Math.abs(Number(game.profit_loss) / E8S_PER_ICP).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary Stats */}
            <div className="mt-4 p-4 bg-gray-800 rounded">
              <h4 className="font-bold mb-2">Session Statistics</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  Total Games: {detailedHistory.length}
                </div>
                <div>
                  Win Rate: {detailedHistory.length > 0 ? ((detailedHistory.filter(g => g.is_win).length / detailedHistory.length) * 100).toFixed(1) : '0.0'}%
                </div>
                <div>
                  Total P/L: {(detailedHistory.reduce((sum, g) => sum + Number(g.profit_loss), 0) / E8S_PER_ICP).toFixed(4)} ICP
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Simple view (existing)
          <GameHistory<DiceGameResult>
            items={gameState.history}
            maxDisplay={5}
            title="Recent Rolls"
            renderCustom={renderHistoryItem}
          />
        )}

        {/* Copy-pasteable text area for analysis */}
        {showDetailedView && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-400">
              Raw Data for Analysis (Click to expand)
            </summary>
            <textarea
              className="w-full h-32 mt-2 p-2 bg-gray-900 text-xs font-mono"
              readOnly
              value={csvExport}
              onClick={(e) => e.currentTarget.select()}
            />
          </details>
        )}
      </div>
    </GameLayout>
  );
};