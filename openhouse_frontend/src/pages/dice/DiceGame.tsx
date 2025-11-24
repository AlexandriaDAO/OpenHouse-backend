import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Principal } from '@dfinity/principal';
import useDiceActor from '../../hooks/actors/useDiceActor';
import useLedgerActor from '../../hooks/actors/useLedgerActor';
import {
  GameLayout,
  BetAmountInput,
  GameButton,
  GameHistory,
  GameStats,
  type GameStat,
} from '../../components/game-ui';
import { DiceAnimation, DiceControls, type DiceDirection } from '../../components/game-specific/dice';
import { useGameMode, useGameState } from '../../hooks/games';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { useBalance } from '../../providers/BalanceProvider';
import { useAuth } from '../../providers/AuthProvider';
import { ApproveArgs } from '../../types/ledger';
import { DECIMALS_PER_CKUSDT, formatUSDT, TRANSFER_FEE } from '../../types/balance';

const DICE_BACKEND_CANISTER_ID = 'whchi-hyaaa-aaaao-a4ruq-cai';

interface DiceGameResult {
  game_id?: bigint;
  player: Principal;
  bet_amount: bigint;
  target_number: number;
  direction: { Over: null } | { Under: null };
  rolled_number: number;
  win_chance: number;
  multiplier: number;
  payout: bigint;
  is_win: boolean;
  is_house_hit?: boolean;
  timestamp: bigint;
  clientId?: string;
}

// Detailed history interface
interface DetailedGameHistory {
  game_id: bigint;
  player: string;
  bet_usdt: number;
  won_usdt: number;
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

// Helper component for inline house status
const HouseStatusInline: React.FC <{
  houseBalance: bigint;
  betAmount: number;
  multiplier: number;
}> = ({ houseBalance, betAmount, multiplier }) => {
  const houseBalanceUSDT = Number(houseBalance) / DECIMALS_PER_CKUSDT;
  const maxAllowedPayout = houseBalanceUSDT * 0.1;
  const currentPotentialPayout = betAmount * multiplier;
  const utilizationPct = maxAllowedPayout > 0
    ? (currentPotentialPayout / maxAllowedPayout) * 100
    : 0;

  let statusColor = 'text-green-400';
  let statusText = 'Healthy';

  if (utilizationPct > 90) {
    statusColor = 'text-red-400';
    statusText = 'At Limit';
  } else if (utilizationPct > 70) {
    statusColor = 'text-yellow-400';
    statusText = 'Near Limit';
  }

  return (
    <div className="text-xs text-gray-400 bg-gray-800/30 rounded p-2 mt-4">
      <div className="flex justify-between items-center">
        <span>House Status</span>
        <span className={`font-bold ${statusColor}`}>{statusText}</span>
      </div>
      {utilizationPct > 70 && (
        <div className={`text-center mt-1 ${statusColor}`}>
          ⚠️ Using {utilizationPct.toFixed(0)}% of house limit
        </div>
      )}
    </div>
  );
};

export function DiceGame() {
  const { actor } = useDiceActor();
  const { actor: ledgerActor } = useLedgerActor();
  const { isAuthenticated } = useAuth();
  const gameMode = useGameMode();
  
  // Global Balance State
  const { balance: walletBalance, refreshBalance: refreshWalletBalance } = useBalance();
  const gameBalanceContext = useGameBalance('dice');
  const balance = gameBalanceContext.balance;
  const refreshGameBalance = gameBalanceContext.refresh;

  // Game State
  const [maxBet, setMaxBet] = useState(10);
  const gameState = useGameState<DiceGameResult>(0.01, maxBet);
  
  // Dice-specific State
  const [targetNumber, setTargetNumber] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>('Over');
  const [winChance, setWinChance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [animatingResult, setAnimatingResult] = useState<number | null>(null);
  const [showDepositAnimation, setShowDepositAnimation] = useState(false);

  // Accounting State
  const [depositAmount, setDepositAmount] = useState('10');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<'idle' | 'approving' | 'depositing'>('idle');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [accountingError, setAccountingError] = useState<string | null>(null);
  const [accountingSuccess, setAccountingSuccess] = useState<string | null>(null);

  // History State
  const [detailedHistory, setDetailedHistory] = useState<DetailedGameHistory[]>([]);
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [csvExport, setCsvExport] = useState<string>('');

  // Helper to parse backend errors
  const parseBackendError = (errorMsg: string): string => {
    if (errorMsg.startsWith('INSUFFICIENT_BALANCE|')) {
      const parts = errorMsg.split('|');
      const userBalance = parts[1] || 'Unknown balance';
      const betAmount = parts[2] || 'Unknown bet';
      setShowDepositAnimation(true);
      return `💰 INSUFFICIENT CHIPS - BET NOT PLACED\n\n` +
        `${userBalance}\n` +
        `${betAmount}\n\n` +
        `${parts[3] || 'This bet was not placed and no funds were deducted.'}\n\n` +
        `👇 Click "Buy Chips" above to add more USDT.`;
    }
    if (errorMsg.includes('exceeds house limit') || errorMsg.includes('house balance')) {
      return `⚠️ BET REJECTED - NO MONEY LOST\n\n` +
        `The house doesn't have enough funds to cover this bet's potential payout. ` +
        `Try lowering your bet or changing odds.`;
    }
    return errorMsg;
  };

  // Accounting Handlers
  const handleDeposit = async () => {
    if (!actor || !ledgerActor || !isAuthenticated) return;

    setIsDepositing(true);
    setAccountingError(null);
    setAccountingSuccess(null);

    try {
      const amount = BigInt(Math.floor(parseFloat(depositAmount) * DECIMALS_PER_CKUSDT));

      // Min deposit 10 USDT for game balance
      if (amount < BigInt(10_000_000)) {
        setAccountingError('Minimum deposit is 10 USDT');
        setIsDepositing(false);
        return;
      }

      if (walletBalance && amount > walletBalance) {
        setAccountingError('Insufficient wallet balance');
        setIsDepositing(false);
        return;
      }

      setDepositStep('approving');
      const approveArgs: ApproveArgs = {
        spender: {
          owner: Principal.fromText(DICE_BACKEND_CANISTER_ID),
          subaccount: [],
        },
        amount: amount + BigInt(TRANSFER_FEE),
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
        expected_allowance: [],
        expires_at: [],
      };

      const approveResult = await ledgerActor.icrc2_approve(approveArgs);

      if ('Err' in approveResult) {
        setAccountingError(`Approval failed: ${JSON.stringify(approveResult.Err)}`);
        setIsDepositing(false);
        setDepositStep('idle');
        return;
      }

      setDepositStep('depositing');
      const result = await actor.deposit(amount);

      if ('Ok' in result) {
        const newBalance = result.Ok;
        setAccountingSuccess(`💰 Bought ${depositAmount} USDT in chips!`);
        setDepositAmount('10');
        setShowDepositModal(false);
        await refreshWalletBalance();
        gameBalanceContext.refresh();
      } else {
        setAccountingError(result.Err);
      }
    } catch (err) {
      setAccountingError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsDepositing(false);
      setDepositStep('idle');
    }
  };

  const handleWithdrawAll = async () => {
    if (!actor || !isAuthenticated) return;

    setIsWithdrawing(true);
    setAccountingError(null);
    setAccountingSuccess(null);

    try {
      const result = await actor.withdraw_all();

      if ('Ok' in result) {
        const newBalance = result.Ok;
        const withdrawnAmount = (Number(balance.game) - Number(newBalance)) / DECIMALS_PER_CKUSDT;
        setAccountingSuccess(`💵 Cashed out ${withdrawnAmount.toFixed(2)} USDT!`);
        await refreshWalletBalance();
        gameBalanceContext.refresh();
      } else {
        setAccountingError(result.Err);
      }
    } catch (err) {
      setAccountingError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Calculate odds
  useEffect(() => {
    const updateOdds = async () => {
      if (!actor) return;
      try {
        const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };
        let mult = 0;
        
        const result = await actor.calculate_payout_info(targetNumber, directionVariant);
        if ('Ok' in result) {
          const [chance, multiplier] = result.Ok;
          mult = multiplier;
          setWinChance(chance * 100);
          setMultiplier(mult);
        } else if ('Err' in result) {
          gameState.setGameError(result.Err);
        }

        try {
          const maxPayoutE8s = await actor.get_max_allowed_payout();
          const maxPayoutUSDT = Number(maxPayoutE8s) / DECIMALS_PER_CKUSDT;
          const maxBetUSDT = mult > 0 ? maxPayoutUSDT / mult : 0;
          setMaxBet(maxBetUSDT);
          if (gameState.betAmount > maxBetUSDT) {
            gameState.setBetAmount(maxBetUSDT);
          }
        } catch (e) {
          setMaxBet(10);
        }
      } catch (err) {
        console.error('Failed to calculate odds:', err);
      }
    };
    updateOdds();
  }, [targetNumber, direction, actor]);

  // Load history
  useEffect(() => {
    const loadHistory = async () => {
      if (!actor) return;
      try {
        const games = await actor.get_recent_games(10);
        const processedGames = games.map((game: DiceGameResult) => ({
          ...game,
          clientId: crypto.randomUUID()
        }));
        processedGames.forEach((game: DiceGameResult) => {
          gameState.addToHistory(game);
        });
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };
    loadHistory();
  }, [actor]);

  // Balance management
  useEffect(() => {
    if (actor) {
      gameBalanceContext.refresh().catch(console.error);
      const intervalId = setInterval(() => {
        gameBalanceContext.refresh().catch(console.error);
      }, 30000);
      const handleFocus = () => {
        gameBalanceContext.refresh().catch(console.error);
      };
      window.addEventListener('focus', handleFocus);
      return () => {
        clearInterval(intervalId);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [actor]);

  useEffect(() => {
    if (balance.game > 0n) {
      setShowDepositAnimation(false);
    }
  }, [balance.game]);

  // Roll Dice
  const rollDice = async () => {
    if (!isAuthenticated) {
      gameState.setGameError('Please log in to play.');
      return;
    }
    if (!actor || !gameState.validateBet()) return;
    if (balance.game === 0n) {
      gameState.setGameError('Your dice game balance is empty.');
      setShowDepositAnimation(true);
      return;
    }

    // Frontend limit check
    const maxPayout = BigInt(Math.floor(gameState.betAmount * multiplier * DECIMALS_PER_CKUSDT));
    const maxAllowedPayout = (balance.house * BigInt(10)) / BigInt(100);
    if (maxPayout > maxAllowedAllowedPayout) {
      gameState.setGameError('Potential payout exceeds house limit.');
      return;
    }

    gameState.setIsPlaying(true);
    gameState.clearErrors();
    setAnimatingResult(null);
    setAccountingError(null);
    setAccountingSuccess(null);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Game timed out.')), 15000);
    });

    try {
      const betAmount = BigInt(Math.floor(gameState.betAmount * DECIMALS_PER_CKUSDT));
      const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const clientSeed = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');

      const result = await Promise.race([
        actor.play_dice(betAmount, targetNumber, directionVariant, clientSeed),
        timeoutPromise
      ]);

      if ('Ok' in result) {
        setAnimatingResult(result.Ok.rolled_number);
        gameState.addToHistory(result.Ok);
        gameBalanceContext.refresh().catch(console.error);
      } else {
        const userFriendlyError = parseBackendError(result.Err);
        gameState.setGameError(userFriendlyError);
        gameState.setIsPlaying(false);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to roll dice';
      gameState.setGameError(parseBackendError(errorMsg));
      gameState.setIsPlaying(false);
    }
  };

  const handleAnimationComplete = useCallback(() => {
    gameState.setIsPlaying(false);
  }, []);

  const renderHistoryItem = (item: DiceGameResult) => (
    <>
      <span className="font-mono">{item.rolled_number}</span>
      <span className={item.is_win ? 'text-green-400' : 'text-red-400'}>
        {item.is_win ? '✓' : '✗'}
      </span>
    </>
  );

  const copyHistoryToCSV = () => {
     // Simple CSV generation from current history
     const headers = "Time,Bet,Target,Roll,Outcome,Payout\n";
     const rows = gameState.history.map(g => 
       `${new Date(Number(g.timestamp) / 1_000_000).toISOString()},${Number(g.bet_amount)/DECIMALS_PER_CKUSDT},${g.target_number},${g.rolled_number},${g.is_win ? 'WIN' : 'LOSS'},${Number(g.payout)/DECIMALS_PER_CKUSDT}`
     ).join('\n');
     setCsvExport(headers + rows);
     navigator.clipboard.writeText(headers + rows);
     alert("History copied to clipboard!");
  };

  return (
    <GameLayout minBet={0.01} maxWin={10} houseEdge={0.99}> 
      
      {/* UNIFIED GAME CARD */}
      <div className="card max-w-5xl mx-auto bg-gray-900/50 border border-gray-700/50">

        {/* INLINE BALANCE BAR */}
        <div className="mb-6 pb-4 border-b border-gray-700/50">
          {!isAuthenticated ? (
            <p className="text-center text-gray-400 text-sm">Please log in to play</p>
          ) : (
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Left: Balances */}
              <div className="flex gap-6 text-sm bg-gray-800/40 px-4 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Wallet:</span>
                  <span className="font-mono font-bold text-green-400">{formatUSDT(walletBalance)}</span>
                </div>
                <div className="w-px h-4 bg-gray-700"></div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Game:</span>
                  <span className="font-mono font-bold text-blue-400">{formatUSDT(balance.game)}</span>
                </div>
                <div className="w-px h-4 bg-gray-700 hidden sm:block"></div>
                <div className="flex items-center gap-2 hidden sm:flex">
                  <span className="text-gray-400">House:</span>
                  <span className="font-mono font-bold text-yellow-400">{formatUSDT(balance.house)}</span>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDepositModal(true)}
                  className={`px-4 py-1.5 bg-dfinity-turquoise text-pure-black text-sm font-bold rounded hover:bg-dfinity-turquoise/90 transition ${showDepositAnimation ? 'animate-pulse ring-2 ring-yellow-400' : ''}`}
                >
                  💰 Buy Chips
                </button>
                <button
                  onClick={handleWithdrawAll}
                  disabled={isWithdrawing || balance.game === 0n}
                  className="px-4 py-1.5 bg-gray-700 text-white text-sm font-bold rounded hover:bg-gray-600 transition disabled:opacity-50"
                >
                  {isWithdrawing ? '...' : '💵 Cash Out'}
                </button>
                <button
                  onClick={() => {
                    refreshWalletBalance();
                    gameBalanceContext.refresh();
                  }}
                  className="px-3 py-1.5 bg-gray-800 text-gray-400 hover:text-white rounded transition"
                  title="Refresh Balances"
                >
                  🔄
                </button>
              </div>
            </div>
          )}
          
          {/* Accounting Messages */}
          {(accountingError || accountingSuccess) && (
            <div className={`mt-3 text-center text-xs py-1 rounded ${accountingError ? 'text-red-400 bg-red-900/20' : 'text-green-400 bg-green-900/20'}`}>
              {accountingError || accountingSuccess}
            </div>
          )}
        </div>

        {/* MAIN GAME AREA: Side-by-Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

          {/* LEFT COLUMN: CONTROLS */}
          <div className="space-y-6">
            
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

            {/* Inline Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/30 rounded p-3 flex justify-between items-center">
                <span className="text-gray-400 text-xs">Win Chance</span>
                <span className="font-bold text-yellow-400">{winChance.toFixed(1)}%</span>
              </div>
              <div className="bg-gray-800/30 rounded p-3 flex justify-between items-center">
                <span className="text-gray-400 text-xs">Multiplier</span>
                <span className="font-bold text-green-400">{multiplier.toFixed(2)}x</span>
              </div>
              <div className="bg-gray-800/30 rounded p-3 flex justify-between items-center">
                <span className="text-gray-400 text-xs">Max Bet</span>
                <span className="font-bold text-blue-400">{maxBet.toFixed(2)} USDT</span>
              </div>
              <div className="bg-gray-800/30 rounded p-3 flex justify-between items-center border border-dfinity-turquoise/20">
                <span className="text-gray-400 text-xs">Potential Win</span>
                <span className="font-bold text-dfinity-turquoise">{(gameState.betAmount * multiplier).toFixed(2)} USDT</span>
              </div>
            </div>

            <HouseStatusInline 
              houseBalance={balance.house} 
              betAmount={gameState.betAmount} 
              multiplier={multiplier} 
            />

            <GameButton
              onClick={rollDice}
              disabled={!actor}
              loading={gameState.isPlaying}
              label="ROLL DICE"
              loadingLabel="Rolling..."
              icon="🎲"
            />

            {gameState.gameError && (
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-sm whitespace-pre-wrap">
                {gameState.gameError}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: ANIMATION & RESULT */}
          <div className="flex flex-col items-center justify-center min-h-[300px] bg-black/20 rounded-xl border border-gray-800/50 p-6 relative overflow-hidden">
            
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-dfinity-turquoise/5 to-purple-900/10 pointer-events-none"></div>

            <div className="scale-125 mb-8 relative z-10">
              <DiceAnimation
                targetNumber={animatingResult}
                isRolling={gameState.isPlaying}
                onAnimationComplete={handleAnimationComplete}
              />
            </div>

            {/* Result Display */}
            <div className="h-24 flex items-center justify-center w-full relative z-10">
              {gameState.lastResult && !gameState.isPlaying ? (
                <div className={`text-center ${gameState.lastResult.is_win ? 'text-green-400' : 'text-red-400'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                  <div className="text-4xl font-black tracking-tight mb-1">
                    {gameState.lastResult.is_win ? 'YOU WON!' : 'YOU LOST'}
                  </div>
                  
                  {gameState.lastResult.is_win && (
                    <div className="text-2xl font-mono text-dfinity-turquoise">
                      +{formatUSDT(gameState.lastResult.payout)}
                    </div>
                  )}

                  {!gameState.lastResult.is_win && gameState.lastResult.is_house_hit && (
                     <div className="text-sm text-yellow-400 mt-1 font-bold">
                       🎯 Exact Hit! (House Edge)
                     </div>
                  )}
                  
                  <div className="text-xs text-gray-500 mt-2 font-mono">
                     {gameState.lastResult.rolled_number} vs {gameState.lastResult.target_number} ({'Over' in gameState.lastResult.direction ? 'Over' : 'Under'})
                  </div>
                </div>
              ) : (
                !gameState.isPlaying && (
                  <div className="text-gray-600 text-sm text-center italic">
                    Ready to roll...
                  </div>
                )
              )}
            </div>

            {/* Game History (Right column bottom) */}
             <details className="mt-auto pt-4 w-full border-t border-gray-800/50 relative z-10">
              <summary className="flex justify-between items-center cursor-pointer p-2">
                <span className="text-lg font-bold text-gray-300">Game History</span>
                <span className="text-xs text-gray-500">Click to expand</span>
              </summary>
              
              <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="flex justify-end gap-2 mb-4">
                  <button 
                    className="text-xs px-2 py-1 bg-gray-800 rounded hover:bg-gray-700"
                    onClick={copyHistoryToCSV}
                  >
                    📋 Copy CSV
                  </button>
                </div>

                <GameHistory<DiceGameResult>
                  items={gameState.history}
                  maxDisplay={10}
                  title=""
                  renderCustom={renderHistoryItem}
                />
              </div>
            </details>
          </div>

        </div>
      </div>

      {/* DEPOSIT MODAL */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowDepositModal(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>💰</span> Buy Chips
            </h3>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Amount (USDT)</label>
              <div className="relative">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-black/50 border border-gray-600 rounded-lg px-4 py-3 text-white text-lg focus:border-dfinity-turquoise focus:outline-none transition"
                  placeholder="10.0"
                  min="10"
                  step="1"
                  disabled={isDepositing}
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-mono">USDT</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-500">Wallet: {formatUSDT(walletBalance)}</p>
                <p className="text-xs text-gray-500">Min: 10 USDT</p>
              </div>
            </div>

            {accountingError && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-500/20 rounded text-red-400 text-xs">
                {accountingError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowDepositModal(false)}
                disabled={isDepositing}
                className="flex-1 px-4 py-3 font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={isDepositing}
                className="flex-1 px-4 py-3 bg-dfinity-turquoise text-black font-bold rounded-lg hover:bg-dfinity-turquoise/90 disabled:opacity-50 disabled:cursor-not-allowed transition relative overflow-hidden"
              >
                {isDepositing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">↻</span>
                    {depositStep === 'approving' ? 'Approving...' : 'Depositing...'}
                  </span>
                ) : (
                  'Confirm Deposit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </GameLayout>
  );
}