import React, { useEffect, useState, useCallback } from 'react';
import useDiceActor from '../hooks/actors/useDiceActor';
import {
  GameLayout,
  GameModeToggle,
  BetAmountInput,
  GameButton,
  GameHistory,
  GameStats,
  type GameStat,
} from '../components/game-ui';
import { DiceAnimation, DiceControls, DiceAccountingPanel, type DiceDirection } from '../components/game-specific/dice';
import { useGameMode, useGameState } from '../hooks/games';
import { useGameBalance } from '../providers/GameBalanceProvider';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';
import type { Principal } from '@dfinity/principal';

interface DiceGameResult {
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

export const Dice: React.FC = () => {
  const { actor } = useDiceActor();
  const gameMode = useGameMode();
  const gameState = useGameState<DiceGameResult>();
  // Use global balance state
  const gameBalanceContext = useGameBalance('dice');
  const balance = gameBalanceContext.balance;
  const refreshBalance = gameBalanceContext.refresh;
  const optimisticUpdate = gameBalanceContext.optimisticUpdate;
  // Note: Disabled useGameHistory to prevent infinite loop - using gameState.history instead
  // const { history } = useGameHistory<DiceGameResult>(actor, 'get_recent_games', 10);

  // Dice-specific state
  const [targetNumber, setTargetNumber] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>('Over');
  const [winChance, setWinChance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [animatingResult, setAnimatingResult] = useState<number | null>(null);

  // Calculate odds when target or direction changes
  useEffect(() => {
    const updateOdds = async () => {
      if (!actor) return;

      try {
        const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };
        const result = await actor.calculate_payout_info(targetNumber, directionVariant);

        if ('Ok' in result) {
          const [chance, mult] = result.Ok;
          setWinChance(chance * 100);
          setMultiplier(mult);
        } else if ('Err' in result) {
          gameState.setGameError(result.Err);
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
        const games = await actor.get_recent_games(10);
        // Add each game to history with a unique ID
        games.forEach((game: DiceGameResult) => {
          gameState.addToHistory({
            ...game,
            clientId: crypto.randomUUID()
          });
        });
      } catch (err) {
        console.error('Failed to load game history:', err);
      }
    };

    loadHistory();
  }, [actor]); // Only depend on actor, not gameState to avoid loops

  // Load initial balances on mount
  useEffect(() => {
    refreshBalance();
  }, [actor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh callback for accounting panel
  const handleBalanceChange = useCallback(async () => {
    await refreshBalance();
  }, [refreshBalance]);

  // Handle dice roll
  const rollDice = async () => {
    if (!actor || !gameState.validateBet()) return;

    gameState.setIsPlaying(true);
    gameState.clearErrors();
    setAnimatingResult(null);

    try {
      const betAmountE8s = BigInt(Math.floor(gameState.betAmount * 100_000_000));
      const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };

      // Generate client seed for provable fairness
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const clientSeed = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');

      const result = await actor.play_dice(betAmountE8s, targetNumber, directionVariant, clientSeed);

      if ('Ok' in result) {
        setAnimatingResult(result.Ok.rolled_number);
        gameState.addToHistory(result.Ok);

        // Apply optimistic update immediately
        if (result.Ok.is_win) {
          // Win: add payout to game balance
          optimisticUpdate({
            field: 'game',
            amount: result.Ok.payout,
            operation: 'add'
          });
        } else {
          // Loss: subtract bet from game balance
          optimisticUpdate({
            field: 'game',
            amount: result.Ok.bet_amount,
            operation: 'subtract'
          });
        }

        // Note: Background verification is handled automatically by GameBalanceProvider
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
      <GameModeToggle {...gameMode} />

      {/* CONNECTION STATUS */}
      <ConnectionStatus game="dice" />

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
          max={1}
          disabled={gameState.isPlaying}
          isPracticeMode={gameMode.isPracticeMode}
          error={gameState.betError}
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

      {/* Game History */}
      <GameHistory<DiceGameResult>
        items={gameState.history}
        maxDisplay={5}
        title="Recent Rolls"
        renderCustom={renderHistoryItem}
      />
    </GameLayout>
  );
};