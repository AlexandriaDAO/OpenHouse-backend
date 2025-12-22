import React, { useState, useCallback } from 'react';
import useRouletteActor from '@/hooks/actors/useRouletteActor';
import useLedgerActor from '@/hooks/actors/useLedgerActor';
import { GameLayout } from '@/components/game-ui';
import { BettingRail } from '@/components/betting';
import {
  RouletteWheel,
  BettingBoard,
  PlacedBet
} from '@/components/game-specific/roulette';
import { useGameBalance } from '@/providers/GameBalanceProvider';
import { useBalance } from '@/providers/BalanceProvider';
import { useAuth } from '@/providers/AuthProvider';
import { DECIMALS_PER_CKUSDT, formatUSDT } from '@/types/balance';
import { useBalanceRefresh } from '@/hooks/games';
import type { BetType, Bet, SpinResult } from '@/declarations/roulette_backend/roulette_backend.did';

const ROULETTE_BACKEND_CANISTER_ID = 'wvrcw-3aaaa-aaaah-arm4a-cai';

export function RouletteGame() {
  const { actor } = useRouletteActor();
  const { actor: ledgerActor } = useLedgerActor();
  const { isAuthenticated } = useAuth();

  // Balance
  const { balance: walletBalance, refreshBalance: refreshWalletBalance } = useBalance();
  const gameBalanceContext = useGameBalance('roulette');
  const balance = gameBalanceContext.balance;

  const handleBalanceRefresh = useCallback(() => {
    refreshWalletBalance();
    gameBalanceContext.refresh();
  }, [refreshWalletBalance, gameBalanceContext]);

  // Game State
  const [bets, setBets] = useState<PlacedBet[]>([]);
  const [selectedChipValue, setSelectedChipValue] = useState(1); // Selected chip denomination
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningNumber, setWinningNumber] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [maxBet] = useState(100); // Could be dynamic based on house balance

  // Balance management - periodic refresh and focus handler
  useBalanceRefresh({
    actor,
    refresh: gameBalanceContext.refresh,
  });

  const totalBetAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);

  // Calculate max potential payout (sum of all bet payouts if they hit)
  const getPayoutMultiplier = (betType: BetType): number => {
    if ('Straight' in betType) return 36; // 35:1 + stake
    if ('Split' in betType) return 18;     // 17:1 + stake
    if ('Street' in betType) return 12;    // 11:1 + stake
    if ('Corner' in betType) return 9;     // 8:1 + stake
    if ('SixLine' in betType) return 6;    // 5:1 + stake
    if ('Column' in betType) return 3;     // 2:1 + stake
    if ('Dozen' in betType) return 3;      // 2:1 + stake
    if ('Red' in betType || 'Black' in betType) return 2;
    if ('Odd' in betType || 'Even' in betType) return 2;
    if ('High' in betType || 'Low' in betType) return 2;
    return 2; // Default for even money
  };

  const maxPayout = bets.reduce((sum, bet) => sum + (bet.amount * getPayoutMultiplier(bet.betType)), 0);

  const handlePlaceBet = useCallback((newBet: PlacedBet) => {
    if (isSpinning) return;

    setBets(prevBets => {
      // Check if bet already exists for these numbers
      const existingIndex = prevBets.findIndex(b => {
        const bNumbers = b.numbers.sort().join(',');
        const newNumbers = newBet.numbers.sort().join(',');
        return bNumbers === newNumbers;
      });

      if (existingIndex >= 0) {
        // Add to existing bet
        const updated = [...prevBets];
        updated[existingIndex] = {
          ...updated[existingIndex],
          amount: updated[existingIndex].amount + newBet.amount
        };
        return updated;
      } else {
        // New bet
        return [...prevBets, newBet];
      }
    });
  }, [isSpinning]);

  const handleRemoveBet = useCallback((betToRemove: PlacedBet) => {
    if (isSpinning) return;

    setBets(prevBets => {
      const existingIndex = prevBets.findIndex(b => {
        const bNumbers = b.numbers.sort().join(',');
        const removeNumbers = betToRemove.numbers.sort().join(',');
        return bNumbers === removeNumbers;
      });

      if (existingIndex >= 0) {
        const updated = [...prevBets];
        const currentAmount = updated[existingIndex].amount;

        if (currentAmount <= selectedChipValue) {
          // Remove bet entirely
          updated.splice(existingIndex, 1);
        } else {
          // Reduce bet amount
          updated[existingIndex] = {
            ...updated[existingIndex],
            amount: currentAmount - selectedChipValue
          };
        }
        return updated;
      }
      return prevBets;
    });
  }, [selectedChipValue, isSpinning]);

  const handleClearBets = useCallback(() => {
    if (!isSpinning) {
      setBets([]);
    }
  }, [isSpinning]);

  const handleSpin = async () => {
    if (!actor || !isAuthenticated || isSpinning || bets.length === 0) return;

    const totalBet = BigInt(Math.floor(totalBetAmount * DECIMALS_PER_CKUSDT));
    if (totalBet > balance.game) {
      setError('Insufficient balance for this bet');
      return;
    }

    setIsSpinning(true);
    setError(null);
    setLastResult(null);

    try {
      // Convert PlacedBet[] to Bet[] for backend
      const backendBets: Bet[] = bets.map(bet => ({
        bet_type: bet.betType,
        amount: BigInt(Math.floor(bet.amount * DECIMALS_PER_CKUSDT))
      }));

      const result = await actor.spin(backendBets);

      if ('Ok' in result) {
        const spinResult = result.Ok;
        setWinningNumber(spinResult.winning_number);
        setLastResult(spinResult);

        // Clear bets after spin completes (10 seconds)
        setTimeout(() => {
          setBets([]);
          setIsSpinning(false);
          gameBalanceContext.refresh();
        }, 10000);

      } else if ('Err' in result) {
        setError(result.Err);
        setIsSpinning(false);
      }
    } catch (err) {
      setError('Failed to spin: ' + String(err));
      setIsSpinning(false);
    }
  };

  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col items-center w-full max-w-7xl mx-auto px-2 sm:px-4 overflow-y-auto py-4">

        {!isAuthenticated && (
          <div className="text-center text-gray-400 text-sm py-2 mb-4">
            Please log in to play
          </div>
        )}

        {/* Wheel + Controls Section */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-8 mb-4">
          {/* Wheel */}
          <div className="flex-shrink-0">
            <RouletteWheel winningNumber={winningNumber} isSpinning={isSpinning} />
          </div>

          {/* Controls & Info Panel */}
          <div className="flex flex-col items-center gap-3">
            {/* Result display */}
            {lastResult && !isSpinning && (
              <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="text-2xl font-bold">
                  {Number(lastResult.net_result) > 0 ? (
                    <span className="text-green-400">WON ${formatUSDT(lastResult.total_payout)}</span>
                  ) : Number(lastResult.net_result) < 0 ? (
                    <span className="text-red-400">LOST ${formatUSDT(lastResult.total_bet)}</span>
                  ) : (
                    <span className="text-gray-400">PUSH</span>
                  )}
                </div>
              </div>
            )}

            {/* Stats Row - Signature info bar */}
            <div className="flex items-center justify-between bg-[#0a0a14] rounded-lg p-3 border border-gray-800/50 w-full max-w-xs">
              <div className="flex flex-col items-center flex-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Bets</span>
                <span className="text-yellow-400 font-mono font-bold">{bets.length}</span>
              </div>
              <div className="h-6 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center flex-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Total Bet</span>
                <span className="text-white font-mono font-bold">${totalBetAmount.toFixed(2)}</span>
              </div>
              <div className="h-6 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center flex-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Max Payout</span>
                <span className="text-dfinity-turquoise font-mono font-bold">${maxPayout.toFixed(2)}</span>
              </div>
              <div className="h-6 w-px bg-gray-800"></div>
              <div className="flex flex-col items-center flex-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">House Edge</span>
                <span className="text-red-400 font-mono font-bold">2.7%</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <button
                onClick={handleClearBets}
                disabled={isSpinning || bets.length === 0}
                className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                CLEAR BETS
              </button>
              <button
                onClick={handleSpin}
                disabled={isSpinning || !isAuthenticated || bets.length === 0}
                className="px-8 py-2.5 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-lg shadow-lg transform active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                {isSpinning ? 'SPINNING...' : `SPIN ($${totalBetAmount.toFixed(2)})`}
              </button>
            </div>

            {/* Error display */}
            {error && (
              <div className="text-red-400 bg-red-900/20 border border-red-900/50 p-3 rounded-lg text-sm max-w-xs">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Betting board - uses chip value from betting rail */}
        <div className="mb-4">
          <BettingBoard
            bets={bets}
            chipValue={selectedChipValue}
            onPlaceBet={handlePlaceBet}
            onRemoveBet={handleRemoveBet}
            disabled={isSpinning}
          />
        </div>
      </div>

      {/* Betting Rail - roulette mode: chips select denomination, not accumulate */}
      <div className="flex-shrink-0">
        <BettingRail
          betAmount={totalBetAmount}
          onBetChange={() => {}} // Bets managed via chip placement on board
          maxBet={maxBet}
          gameBalance={balance.game}
          walletBalance={walletBalance}
          houseBalance={balance.house}
          ledgerActor={ledgerActor}
          gameActor={actor}
          onBalanceRefresh={handleBalanceRefresh}
          disabled={isSpinning}
          multiplier={35} // Max straight-up payout
          canisterId={ROULETTE_BACKEND_CANISTER_ID}
          isBalanceLoading={gameBalanceContext.isLoading}
          isBalanceInitialized={gameBalanceContext.isInitialized}
          rouletteMode={true}
          selectedChipValue={selectedChipValue}
          onChipSelect={setSelectedChipValue}
          onClearBets={handleClearBets}
        />
      </div>
    </GameLayout>
  );
}
