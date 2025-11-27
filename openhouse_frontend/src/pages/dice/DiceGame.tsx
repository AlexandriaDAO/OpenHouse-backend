import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Principal } from '@dfinity/principal';
import useDiceActor from '../../hooks/actors/useDiceActor';
import useLedgerActor from '../../hooks/actors/useLedgerActor';
import {
  GameLayout,
  GameButton,
  GameStats,
  type GameStat,
} from '../../components/game-ui';
import { DiceAnimation, DiceControls, type DiceDirection, ChipBetting, ChipStack } from '../../components/game-specific/dice';
import { useGameMode, useGameState } from '../../hooks/games';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { useBalance } from '../../providers/BalanceProvider';
import { useAuth } from '../../providers/AuthProvider';
import { ApproveArgs } from '../../types/ledger';
import { DECIMALS_PER_CKUSDT, formatUSDT, TRANSFER_FEE } from '../../types/balance';

const DICE_BACKEND_CANISTER_ID = 'whchi-hyaaa-aaaao-a4ruq-cai';

// Minimal game result from backend (simplified - 3 fields only)
interface MinimalGameResult {
  rolled_number: number;
  is_win: boolean;
  payout: bigint;
}

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

  // Game State - using minimal result type
  const [maxBet, setMaxBet] = useState(10);
  const [lastResult, setLastResult] = useState<MinimalGameResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(0.01);
  const [betError, setBetError] = useState<string | null>(null);

  // Dice-specific State
  const [targetNumber, setTargetNumber] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>('Over');
  const [winChance, setWinChance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [animatingResult, setAnimatingResult] = useState<number | null>(null);
  const [showDepositAnimation, setShowDepositAnimation] = useState(false);
  const [showOddsExplainer, setShowOddsExplainer] = useState(false);

  // Accounting State
  const [depositAmount, setDepositAmount] = useState('1');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<'idle' | 'approving' | 'depositing'>('idle');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [accountingError, setAccountingError] = useState<string | null>(null);
  const [accountingSuccess, setAccountingSuccess] = useState<string | null>(null);

  // Bet validation
  const validateBet = () => {
    if (betAmount < 0.01) {
      setBetError('Minimum bet is 0.01 USDT');
      return false;
    }
    if (betAmount > maxBet) {
      setBetError(`Maximum bet is ${maxBet.toFixed(2)} USDT`);
      return false;
    }
    setBetError(null);
    return true;
  };

  // Helper to parse backend errors
  const parseBackendError = (errorMsg: string): string => {
    if (errorMsg.startsWith('INSUFFICIENT_BALANCE|')) {
      const parts = errorMsg.split('|');
      const userBalance = parts[1] || 'Unknown balance';
      const betAmountStr = parts[2] || 'Unknown bet';
      setShowDepositAnimation(true);
      return `INSUFFICIENT CHIPS - BET NOT PLACED\n\n` +
        `${userBalance}\n` +
        `${betAmountStr}\n\n` +
        `${parts[3] || 'This bet was not placed and no funds were deducted.'}\n\n` +
        `Click "Buy Chips" above to add more USDT.`;
    }
    if (errorMsg.includes('exceeds house limit') || errorMsg.includes('house balance')) {
      return `BET REJECTED - NO MONEY LOST\n\n` +
        `The house doesn't have enough funds to cover this bet's potential payout. ` +
        `Try lowering your bet or changing odds.`;
    }
    if (errorMsg.includes('Randomness seed initializing')) {
      return `WARMING UP - PLEASE WAIT\n\n` +
        `The randomness generator is initializing (happens once after updates). ` +
        `Please try again in a few seconds. No funds were deducted.`;
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

      // Min deposit 1 USDT for game balance
      if (amount < BigInt(1_000_000)) {
        setAccountingError('Minimum deposit is 1 USDT');
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
        setAccountingSuccess(`Bought ${depositAmount} USDT in chips!`);
        setDepositAmount('1');
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
        setAccountingSuccess(`Cashed out ${withdrawnAmount.toFixed(2)} USDT!`);
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
          setGameError(result.Err);
        }

        try {
          const maxPayoutE8s = await actor.get_max_allowed_payout();
          const maxPayoutUSDT = Number(maxPayoutE8s) / DECIMALS_PER_CKUSDT;
          const maxBetUSDT = mult > 0 ? maxPayoutUSDT / mult : 0;
          setMaxBet(maxBetUSDT);
          if (betAmount > maxBetUSDT) {
            setBetAmount(maxBetUSDT);
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
      setGameError('Please log in to play.');
      return;
    }
    if (!actor || !validateBet()) return;
    if (balance.game === 0n) {
      setGameError('Your dice game balance is empty.');
      setShowDepositAnimation(true);
      return;
    }

    // Frontend limit check
    const maxPayout = BigInt(Math.floor(betAmount * multiplier * DECIMALS_PER_CKUSDT));
    const maxAllowedPayout = (balance.house * BigInt(10)) / BigInt(100);
    if (maxPayout > maxAllowedPayout) {
      setGameError('Potential payout exceeds house limit.');
      return;
    }

    setIsPlaying(true);
    setGameError(null);
    setAnimatingResult(null);
    setAccountingError(null);
    setAccountingSuccess(null);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Game timed out.')), 15000);
    });

    try {
      const betAmountBigInt = BigInt(Math.floor(betAmount * DECIMALS_PER_CKUSDT));
      const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const clientSeed = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');

      const result = await Promise.race([
        actor.play_dice(betAmountBigInt, targetNumber, directionVariant, clientSeed),
        timeoutPromise
      ]);

      if ('Ok' in result) {
        const gameResult: MinimalGameResult = {
          rolled_number: result.Ok.rolled_number,
          is_win: result.Ok.is_win,
          payout: result.Ok.payout,
        };
        setAnimatingResult(gameResult.rolled_number);
        setLastResult(gameResult);
        gameBalanceContext.refresh().catch(console.error);
      } else {
        const userFriendlyError = parseBackendError(result.Err);
        setGameError(userFriendlyError);
        setIsPlaying(false);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to roll dice';
      setGameError(parseBackendError(errorMsg));
      setIsPlaying(false);
    }
  };

  const handleAnimationComplete = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return (
    <GameLayout minBet={0.01} maxWin={10} houseEdge={0.99}>

      {/* UNIFIED GAME CARD */}
      <div className="card max-w-5xl mx-auto bg-gray-900/50 border border-gray-700/50">

        {/* COMPACT TOP BAR */}
        <div className="mb-4 flex items-center justify-between text-xs">
          {!isAuthenticated ? (
            <p className="text-gray-400">Please log in to play</p>
          ) : (
            <>
              {/* Compact balance display */}
              <div className="flex items-center gap-3 text-gray-400">
                <span>
                  Chips: <span className="font-mono text-blue-400">{formatUSDT(balance.game)}</span>
                </span>
                <span className="text-gray-600">|</span>
                <span>
                  Wallet: <span className="font-mono text-gray-500">{formatUSDT(walletBalance)}</span>
                </span>
              </div>

              {/* Compact actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDepositModal(true)}
                  className={`px-3 py-1 text-xs font-bold rounded transition ${
                    showDepositAnimation
                      ? 'bg-yellow-500 text-black animate-pulse'
                      : 'bg-dfinity-turquoise/80 text-black hover:bg-dfinity-turquoise'
                  }`}
                >
                  + Chips
                </button>
                <button
                  onClick={handleWithdrawAll}
                  disabled={isWithdrawing || balance.game === 0n}
                  className="px-3 py-1 text-xs text-gray-400 hover:text-white transition disabled:opacity-30"
                >
                  Cash Out
                </button>
              </div>
            </>
          )}
        </div>

        {/* Accounting Messages */}
        {(accountingError || accountingSuccess) && (
          <div className={`mb-4 text-center text-xs py-1.5 rounded ${accountingError ? 'text-red-400 bg-red-900/20' : 'text-green-400 bg-green-900/20'}`}>
            {accountingError || accountingSuccess}
          </div>
        )}

        {/* MAIN GAME AREA: Side-by-Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

          {/* LEFT COLUMN: CONTROLS */}
          <div className="space-y-6">

            <ChipBetting
              betAmount={betAmount}
              onBetChange={setBetAmount}
              gameBalance={balance.game}
              maxBet={maxBet}
              disabled={isPlaying}
              houseLimitStatus={
                (() => {
                  const houseBalanceUSDT = Number(balance.house) / DECIMALS_PER_CKUSDT;
                  const maxAllowedPayout = houseBalanceUSDT * 0.1;
                  const currentPotentialPayout = betAmount * multiplier;
                  const utilizationPct = maxAllowedPayout > 0 ? (currentPotentialPayout / maxAllowedPayout) * 100 : 0;
                  if (utilizationPct > 90) return 'danger';
                  if (utilizationPct > 70) return 'warning';
                  return 'healthy';
                })()
              }
            />

            <DiceControls
              targetNumber={targetNumber}
              onTargetChange={setTargetNumber}
              direction={direction}
              onDirectionChange={setDirection}
              disabled={isPlaying}
            />

            {/* Compact payout summary - just potential win and multiplier inline */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-4 text-gray-400">
                <span>
                  <span className="text-yellow-400 font-bold">{winChance.toFixed(0)}%</span> chance
                </span>
                <span>
                  <span className="text-green-400 font-bold">{multiplier.toFixed(2)}x</span> payout
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-dfinity-turquoise font-mono font-bold">
                  Win ${(betAmount * multiplier).toFixed(2)}
                </span>
                <button
                  onClick={() => setShowOddsExplainer(true)}
                  className="text-gray-500 hover:text-dfinity-turquoise transition"
                  title="How odds work"
                >
                  ?
                </button>
              </div>
            </div>

            {/* Odds Explainer Modal/Overlay */}
            {showOddsExplainer && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowOddsExplainer(false)}>
                <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full border border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-dfinity-turquoise">How Odds Work</h3>
                    <button
                      onClick={() => setShowOddsExplainer(false)}
                      className="text-gray-400 hover:text-white text-2xl leading-none"
                    >
                      ×
                    </button>
                  </div>

                  <div className="text-xs text-gray-300 space-y-3">
                    <div>
                      <p className="font-semibold text-dfinity-turquoise mb-1">The Dice Roll (0-100)</p>
                      <p>Every roll generates a random number from <span className="font-mono text-white">0</span> to <span className="font-mono text-white">100</span> — that's <span className="font-mono text-white">101</span> total possible outcomes.</p>
                    </div>

                    <div>
                      <p className="font-semibold text-dfinity-turquoise mb-1">Pick Your Side</p>
                      <p>
                        Choose a target number and bet <span className="font-bold">Over</span> or <span className="font-bold">Under</span>:
                      </p>
                      <ul className="mt-1 ml-4 space-y-1 list-disc list-inside">
                        <li><span className="font-bold text-green-400">Over {targetNumber}:</span> Win if roll is {targetNumber + 1}-100</li>
                        <li><span className="font-bold text-blue-400">Under {targetNumber}:</span> Win if roll is 0-{targetNumber - 1}</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold text-dfinity-turquoise mb-1">Exact Payouts</p>
                      <p>
                        You get <span className="font-bold text-yellow-400">exact fair odds</span> based on probability.
                      </p>
                      <div className="mt-2 bg-black/30 rounded p-2 font-mono text-xs">
                        <p className="text-gray-400">Example: <span className="text-white">Under 1</span></p>
                        <p className="mt-1">• Only <span className="text-white">0</span> wins (1 out of 101 outcomes)</p>
                        <p>• Win chance: <span className="text-yellow-400">~0.99%</span></p>
                        <p>• Fair payout: <span className="text-green-400">~100x</span></p>
                        <p className="mt-1">Bet $1 → Win $100 💰</p>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold text-red-400 mb-1">The House Edge (0.99%)</p>
                      <p>
                        If you land <span className="font-bold text-red-400">exactly on {targetNumber}</span>, the <span className="font-bold">house wins</span> and takes your bet.
                        This single outcome creates the transparent <span className="font-mono text-white">0.99%</span> house edge.
                      </p>
                      <div className="mt-2 bg-red-900/10 rounded p-2 border border-red-500/20">
                        <p className="text-xs text-gray-400">
                          Example at target <span className="text-white">50</span>:
                        </p>
                        <ul className="mt-1 ml-4 space-y-0.5 text-xs">
                          <li>• <span className="text-green-400">Over 50:</span> 51-100 = 50 winning outcomes</li>
                          <li>• <span className="text-red-400">Exactly 50:</span> House wins (1 outcome)</li>
                          <li>• <span className="text-blue-400">Under 50:</span> 0-49 = 50 winning outcomes</li>
                        </ul>
                        <p className="mt-1 text-xs text-gray-300">
                          That middle slot is how the house maintains its edge!
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-700/30">
                      <p className="text-xs text-gray-400 italic">
                        All rolls use the Internet Computer's verifiable random function (VRF) for provably fair results.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <GameButton
              onClick={rollDice}
              disabled={!actor}
              loading={isPlaying}
              label="ROLL DICE"
              loadingLabel="Rolling..."
            />

            {gameError && (
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-sm whitespace-pre-wrap">
                {gameError}
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
                isRolling={isPlaying}
                onAnimationComplete={handleAnimationComplete}
              />
            </div>

            {/* Result Display */}
            <div className="h-24 flex items-center justify-center w-full relative z-10">
              {lastResult && !isPlaying ? (
                <div className={`text-center ${lastResult.is_win ? 'text-green-400' : 'text-red-400'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                  <div className="text-4xl font-black tracking-tight mb-1">
                    {lastResult.is_win ? 'YOU WON!' : 'YOU LOST'}
                  </div>

                  {lastResult.is_win && (
                    <div className="text-2xl font-mono text-dfinity-turquoise">
                      +{formatUSDT(lastResult.payout)}
                    </div>
                  )}

                  <div className="text-xs text-gray-500 mt-2 font-mono">
                     Rolled: {lastResult.rolled_number} | Target: {targetNumber} ({direction})
                  </div>
                </div>
              ) : (
                !isPlaying && (
                  <div className="text-gray-600 text-sm text-center italic">
                    Ready to roll...
                  </div>
                )
              )}
            </div>
          </div>

        </div>
      </div>

      {/* DEPOSIT MODAL */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowDepositModal(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>Buy Chips</span>
            </h3>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Amount (USDT)</label>
              <div className="relative">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-black/50 border border-gray-600 rounded-lg px-4 py-3 text-white text-lg focus:border-dfinity-turquoise focus:outline-none transition"
                  placeholder="1.0"
                  min="1"
                  step="1"
                  disabled={isDepositing}
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-mono">USDT</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-500">Wallet: {formatUSDT(walletBalance)}</p>
                <p className="text-xs text-gray-500">Min: 1 USDT</p>
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
                    <span className="animate-spin">...</span>
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
