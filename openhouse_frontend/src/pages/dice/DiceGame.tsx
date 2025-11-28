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
  BettingRail
} from '../../components/game-ui';
import { DiceAnimation, DiceControls, type DiceDirection } from '../../components/game-specific/dice';
import { useGameMode, useGameState } from '../../hooks/games';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { useBalance } from '../../providers/BalanceProvider';
import { useAuth } from '../../providers/AuthProvider';
import { DECIMALS_PER_CKUSDT, formatUSDT } from '../../types/balance';

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
  
  const handleBalanceRefresh = useCallback(() => {
    refreshWalletBalance();
    gameBalanceContext.refresh();
  }, [refreshWalletBalance, gameBalanceContext]);

  // Game State - using minimal result type
  const [maxBet, setMaxBet] = useState(10);
  const [lastResult, setLastResult] = useState<MinimalGameResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(0.01);

  // Dice-specific State
  const [targetNumber, setTargetNumber] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>('Over');
  const [winChance, setWinChance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [animatingResult, setAnimatingResult] = useState<number | null>(null);
  const [showOddsExplainer, setShowOddsExplainer] = useState(false);

  // Helper to parse backend errors
  const parseBackendError = (errorMsg: string): string => {
    if (errorMsg.startsWith('INSUFFICIENT_BALANCE|')) {
      const parts = errorMsg.split('|');
      const userBalance = parts[1] || 'Unknown balance';
      const betAmountStr = parts[2] || 'Unknown bet';
      return `INSUFFICIENT CHIPS - BET NOT PLACED\n\n` +
        `${userBalance}\n` +
        `${betAmountStr}\n\n` +
        `${parts[3] || 'This bet was not placed and no funds were deducted.'}\n\n` +
        `Click "Buy Chips" below to add more USDT.`;
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
  }, [targetNumber, direction, actor, betAmount]);

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

  // Roll Dice
  const rollDice = async () => {
    if (!isAuthenticated) {
      setGameError('Please log in to play.');
      return;
    }
    if (!actor) return;
    if (balance.game === 0n) {
      setGameError('Your dice game balance is empty.');
      return;
    }
    if (betAmount < 0.01) {
      setGameError('Minimum bet is 0.01 USDT');
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

      {/* Main Game Area - Centered, single column */}
      <div className="max-w-2xl mx-auto pb-48"> {/* pb-48 for rail clearance */}

        {/* Auth check */}
        {!isAuthenticated && (
          <div className="text-center text-gray-400 mb-6">
            Please log in to play
          </div>
        )}

        {/* Dice Animation - Larger, centered */}
        <div className="flex flex-col items-center justify-center min-h-[350px] bg-black/20 rounded-xl border border-gray-800/50 p-6 relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-dfinity-turquoise/5 to-purple-900/10 pointer-events-none" />

          {/* Dice component - scale up */}
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
              <div className={`text-center ${lastResult.is_win ? 'text-green-400' : 'text-red-400'} animate-in fade-in slide-in-from-bottom-4 duration-300`}>
                <div className="text-4xl font-black">
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
            ) : !isPlaying && (
              <div className="text-gray-600 text-sm italic">Ready to roll...</div>
            )}
          </div>
        </div>

        {/* Controls Section */}
        <div className="mt-6 space-y-4">

          {/* Over/Under + Target Slider */}
          <DiceControls
            targetNumber={targetNumber}
            onTargetChange={setTargetNumber}
            direction={direction}
            onDirectionChange={setDirection}
            disabled={isPlaying}
          />

          {/* Payout Preview Line */}
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
                className="text-gray-500 hover:text-dfinity-turquoise"
                title="Odds info"
              >
                ?
              </button>
            </div>
          </div>

          {/* Roll Button */}
          <GameButton
            onClick={rollDice}
            disabled={!actor || betAmount === 0 || !isAuthenticated}
            loading={isPlaying}
            label="ROLL DICE"
            loadingLabel="Rolling..."
          />

          {/* Error Display (game errors only) */}
          {gameError && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-sm whitespace-pre-wrap">
              {gameError}
            </div>
          )}

        </div>

        {/* Odds Explainer Modal */}
        {showOddsExplainer && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowOddsExplainer(false)}>
            <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full border border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">How Odds Work</h3>
                <button
                  onClick={() => setShowOddsExplainer(false)}
                  className="text-gray-400 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="text-xs text-gray-300 space-y-3">
                <div>
                  <p className="font-semibold text-white mb-1">The Dice Roll (0-100)</p>
                  <p>Every roll generates a random number from <span className="font-mono text-white">0</span> to <span className="font-mono text-white">100</span> — that's <span className="font-mono text-white">101</span> total possible outcomes.</p>
                </div>

                <div>
                  <p className="font-semibold text-white mb-1">Pick Your Side</p>
                  <p>
                    Choose a target number and bet <span className="font-bold">Over</span> or <span className="font-bold">Under</span>:
                  </p>
                  <ul className="mt-1 ml-4 space-y-1 list-disc list-inside">
                    <li><span className="font-bold text-green-400">Over {targetNumber}:</span> Win if roll is {targetNumber + 1}-100</li>
                    <li><span className="font-bold text-blue-400">Under {targetNumber}:</span> Win if roll is 0-{targetNumber - 1}</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-white mb-1">Exact Payouts</p>
                  <p>
                    You get <span className="font-bold text-yellow-400">exact fair odds</span> based on probability.
                  </p>
                  <div className="mt-2 bg-gray-900 border border-gray-800 rounded p-2 font-mono text-xs">
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

      </div>

      {/* Betting Rail - Fixed bottom */}
      <BettingRail
        betAmount={betAmount}
        onBetChange={setBetAmount}
        maxBet={maxBet}
        gameBalance={balance.game}
        walletBalance={walletBalance}
        houseBalance={balance.house}
        ledgerActor={ledgerActor}
        gameActor={actor}
        onBalanceRefresh={handleBalanceRefresh}
        disabled={isPlaying}
        multiplier={multiplier}
        canisterId={DICE_BACKEND_CANISTER_ID}
      />

    </GameLayout>
  );
}