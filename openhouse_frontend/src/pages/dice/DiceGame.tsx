import React, { useEffect, useState, useCallback } from 'react';
import useDiceActor from '../../hooks/actors/useDiceActor';
import useLedgerActor from '../../hooks/actors/useLedgerActor';
import { GameLayout } from '../../components/game-ui';
import { BettingRail } from '../../components/betting';
import { DiceAnimation, DiceControls, type DiceDirection } from '../../components/game-specific/dice';
import { useGameBalance } from '../../providers/GameBalanceProvider';
import { useBalance } from '../../providers/BalanceProvider';
import { useAuth } from '../../providers/AuthProvider';
import { DECIMALS_PER_CKUSDT, formatUSDT } from '../../types/balance';
import type { MultiDiceGameResult, SingleDiceResult } from '../../declarations/dice_backend/dice_backend.did';

const DICE_BACKEND_CANISTER_ID = 'whchi-hyaaa-aaaao-a4ruq-cai';

export function DiceGame() {
  const { actor } = useDiceActor();
  const { actor: ledgerActor } = useLedgerActor();
  const { isAuthenticated } = useAuth();

  // Global Balance State
  const { balance: walletBalance, refreshBalance: refreshWalletBalance } = useBalance();
  const gameBalanceContext = useGameBalance('dice');
  const balance = gameBalanceContext.balance;

  const handleBalanceRefresh = useCallback(() => {
    refreshWalletBalance();
    gameBalanceContext.refresh();
  }, [refreshWalletBalance, gameBalanceContext]);

  // Game State
  const [maxBet, setMaxBet] = useState(10);
  const [lastResult, setLastResult] = useState<MultiDiceGameResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(0.01);  // Per-dice bet amount

  // Dice-specific State
  const [diceCount, setDiceCount] = useState<1 | 2 | 3>(1);  // Default: 1 (conservative)
  const [targetNumber, setTargetNumber] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>('Over');
  const [winChance, setWinChance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [animatingResults, setAnimatingResults] = useState<SingleDiceResult[] | null>(null);
  const [showOddsExplainer, setShowOddsExplainer] = useState(false);

  // Computed values
  const totalBet = betAmount * diceCount;
  const maxPayout = totalBet * multiplier;

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
    if (errorMsg.includes('timed out') || errorMsg.includes('504') || errorMsg.includes('Gateway')) {
      return `NETWORK TIMEOUT - YOUR FUNDS ARE SAFE\n\n` +
        `The network was slow to respond. This does NOT affect your money.\n\n` +
        `• If the bet wasn't processed: your balance is unchanged\n` +
        `• If the bet was processed: the result is already applied\n\n` +
        `Refresh the page to see your current balance.`;
    }
    return errorMsg;
  };

  // Calculate odds and max bet
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

        // Use get_max_bet_per_dice for multi-dice aware max bet calculation
        try {
          const maxBetResult = await actor.get_max_bet_per_dice(diceCount, targetNumber, directionVariant);
          if ('Ok' in maxBetResult) {
            // Apply 10% safety margin for UI
            const maxBetPerDiceUSDT = (Number(maxBetResult.Ok) / DECIMALS_PER_CKUSDT) * 0.9;
            setMaxBet(maxBetPerDiceUSDT);
            if (betAmount > maxBetPerDiceUSDT) {
              setBetAmount(maxBetPerDiceUSDT);
            }
          }
        } catch (e) {
          setMaxBet(10);
        }
      } catch (err) {
        console.error('Failed to calculate odds:', err);
      }
    };
    updateOdds();
  }, [targetNumber, direction, diceCount, actor, betAmount]);

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

  // Roll Dice (Multi-dice)
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

    // Frontend limit check - use 15% to match backend
    const totalBetE8s = BigInt(Math.floor(totalBet * DECIMALS_PER_CKUSDT));
    const maxPayoutE8s = BigInt(Math.floor(maxPayout * DECIMALS_PER_CKUSDT));
    const maxAllowedPayout = (balance.house * BigInt(15)) / BigInt(100);
    if (maxPayoutE8s > maxAllowedPayout) {
      setGameError('Potential payout exceeds house limit. Reduce bet or dice count.');
      return;
    }

    // Check user has enough balance for total bet
    if (totalBetE8s > balance.game) {
      setGameError(`Insufficient balance for ${diceCount} dice. Total bet: $${totalBet.toFixed(2)}`);
      return;
    }

    setIsPlaying(true);
    setGameError(null);
    setAnimatingResults(null);
    setLastResult(null);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Game timed out.')), 15000);
    });

    try {
      const betPerDiceE8s = BigInt(Math.floor(betAmount * DECIMALS_PER_CKUSDT));
      const directionVariant = direction === 'Over' ? { Over: null } : { Under: null };
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const clientSeed = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');

      const result = await Promise.race([
        actor.play_multi_dice(diceCount, betPerDiceE8s, targetNumber, directionVariant, clientSeed),
        timeoutPromise
      ]);

      if ('Ok' in result) {
        const gameResult = result.Ok;
        // Start animation with results
        setAnimatingResults(gameResult.dice_results);
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
      // On timeout, refresh balance so user can see actual state
      if (errorMsg.includes('timed out') || errorMsg.includes('504') || errorMsg.includes('Gateway')) {
        gameBalanceContext.refresh().catch(console.error);
      }
    }
  };

  const handleAnimationComplete = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return (
    <GameLayout hideFooter noScroll>
      {/* Main container - grows to fill space, pushes BettingRail to bottom */}
      <div className="flex-1 flex flex-col max-w-xl mx-auto px-4 overflow-hidden min-h-0">

        {/* Auth check - compact */}
        {!isAuthenticated && (
          <div className="text-center text-gray-400 text-sm py-2">
            Please log in to play
          </div>
        )}

        {/* Dice Animation - Centerpiece, Clickable */}
        <div className="flex-shrink-0 flex justify-center pt-2 pb-4 relative">
          <div className="relative">
            <DiceAnimation
              results={animatingResults}
              diceCount={diceCount}
              isRolling={isPlaying}
              targetNumber={targetNumber}
              direction={direction}
              onAnimationComplete={handleAnimationComplete}
              onClick={rollDice}
            />

            {/* Click hint - visible only when idle and logged in */}
            {!isPlaying && isAuthenticated && (
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 text-[10px] text-gray-500 font-mono tracking-widest opacity-60 pointer-events-none">
                TAP TO ROLL
              </div>
            )}
          </div>
        </div>

        {/* Result display - Shows net result for multi-dice */}
        <div className="h-14 flex items-center justify-center flex-shrink-0">
          {lastResult && !isPlaying ? (
            <div className={`text-center animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              {/* Win count for multi-dice */}
              {lastResult.dice_count > 1 && (
                <span className={`font-black text-lg mr-2 ${lastResult.total_wins > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {lastResult.total_wins}/{lastResult.dice_count}
                </span>
              )}
              {/* Net result */}
              <span className={`font-black text-xl mr-2 ${Number(lastResult.net_result) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {Number(lastResult.net_result) >= 0 ? 'WON' : 'LOST'}
              </span>
              {Number(lastResult.net_result) > 0 && (
                <span className="text-dfinity-turquoise font-mono font-bold text-lg">
                  +{formatUSDT(lastResult.total_payout)}
                </span>
              )}
              {/* Rolled numbers for single dice */}
              {lastResult.dice_count === 1 && lastResult.dice_results[0] && (
                <span className="text-gray-600 text-xs ml-3 border-l border-gray-700 pl-3">
                  Rolled {lastResult.dice_results[0].rolled_number}
                </span>
              )}
            </div>
          ) : (
            /* Placeholder to prevent layout jump */
            <div className="h-full w-full"></div>
          )}
        </div>

        {/* Direction buttons row - Underneath Dice */}
        <div className="flex gap-4 justify-center mb-2 flex-shrink-0">
          <button
            onClick={() => setDirection('Under')}
            className={`flex-1 md:flex-none md:w-32 px-4 py-3 text-sm font-bold rounded-xl transition ${
              direction === 'Under'
                ? 'border-2 border-white text-white bg-white/5'
                : 'border border-gray-700 text-gray-500 hover:text-gray-300 bg-black/20'
            }`}
            disabled={isPlaying}
          >
            UNDER
          </button>

          <button
            onClick={() => setDirection('Over')}
            className={`flex-1 md:flex-none md:w-32 px-4 py-3 text-sm font-bold rounded-xl transition ${
              direction === 'Over'
                ? 'border-2 border-white text-white bg-white/5'
                : 'border border-gray-700 text-gray-500 hover:text-gray-300 bg-black/20'
            }`}
            disabled={isPlaying}
          >
            OVER
          </button>
        </div>

        {/* Controls Section */}
        <div className="flex-1 flex flex-col justify-start space-y-4 pt-2">

          {/* Target slider with inline dice count stepper */}
          <DiceControls
            targetNumber={targetNumber}
            onTargetChange={setTargetNumber}
            diceCount={diceCount}
            onDiceCountChange={setDiceCount}
            disabled={isPlaying}
          />

          {/* Stats row - includes Total Bet */}
          <div className="flex justify-between items-center bg-black/20 rounded-lg p-3 border border-gray-800/50">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Chance</span>
              <span className="text-yellow-400 font-mono font-bold">{winChance.toFixed(0)}%</span>
            </div>
            <div className="h-6 w-px bg-gray-800 mx-2"></div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Multiplier</span>
              <span className="text-green-400 font-mono font-bold">{multiplier.toFixed(2)}x</span>
            </div>
            <div className="h-6 w-px bg-gray-800 mx-2"></div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total Bet</span>
              <span className="text-white font-mono font-bold">${totalBet.toFixed(2)}</span>
            </div>
            <div className="h-6 w-px bg-gray-800 mx-2"></div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Max Payout</span>
              <span className="text-dfinity-turquoise font-mono font-bold">${maxPayout.toFixed(2)}</span>
            </div>
            <button
              onClick={() => setShowOddsExplainer(true)}
              className="ml-3 text-gray-600 hover:text-gray-400"
              title="How odds work"
            >
              ?
            </button>
          </div>

          {/* Error display */}
          {gameError && (
            <div className="text-red-400 text-xs text-center p-2 bg-red-900/10 border border-red-900/30 rounded">
              {gameError}
            </div>
          )}
        </div>
      </div>

      {/* BettingRail - Stays at bottom, shows per-dice bet */}
      <div className="flex-shrink-0">
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
                    <li><span className="font-bold text-gray-300">Under {targetNumber}:</span> Win if roll is 0-{targetNumber - 1}</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-white mb-1">Multi-Dice Mode</p>
                  <p>
                    Roll 1-3 dice at once! Each dice is an <span className="font-bold">independent bet</span> with the same target and direction.
                    You can win some and lose others.
                  </p>
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
                    <p className="mt-1">Bet $1 → Win $100</p>
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
                      <li>• <span className="text-gray-300">Under 50:</span> 0-49 = 50 winning outcomes</li>
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
    </GameLayout>
  );
}
