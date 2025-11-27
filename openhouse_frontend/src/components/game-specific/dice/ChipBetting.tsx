import React, { useState, useCallback, useMemo } from 'react';
import {
  CHIP_DENOMINATIONS,
  ChipDenomination,
  decomposeIntoChips,
  getNextHigherChip,
} from './chipConfig';
import { ChipStack } from './ChipStack';
import { DECIMALS_PER_CKUSDT } from '../../../types/balance';

interface ChipBettingProps {
  betAmount: number;
  onBetChange: (amount: number) => void;
  gameBalance: bigint;
  maxBet: number;
  disabled?: boolean;
}

export const ChipBetting: React.FC<ChipBettingProps> = ({
  betAmount,
  onBetChange,
  gameBalance,
  maxBet,
  disabled = false,
}) => {
  // Track chip history for LIFO undo (stores chip values in order added)
  const [chipHistory, setChipHistory] = useState<number[]>([]);

  // Convert game balance to USDT for comparison
  const gameBalanceUSDT = Number(gameBalance) / DECIMALS_PER_CKUSDT;

  /**
   * Auto-consolidation: Convert lower denomination chips to higher ones
   * when we have enough. This keeps the visual stack clean.
   *
   * Example: If user clicks white 10 times, we show 1 red instead of 10 whites.
   *
   * This is purely visual - the actual bet amount stays the same.
   */
  const consolidatedDisplay = useMemo(() => {
    return decomposeIntoChips(betAmount);
  }, [betAmount]);

  // Check if adding a chip would exceed limits
  const canAddChip = useCallback((chipValue: number): boolean => {
    if (disabled) return false;
    const newAmount = betAmount + chipValue;
    // Round to avoid floating point issues
    const roundedNew = Math.round(newAmount * 100) / 100;
    return roundedNew <= maxBet && roundedNew <= gameBalanceUSDT;
  }, [betAmount, maxBet, gameBalanceUSDT, disabled]);

  // Add a chip to the bet
  const addChip = useCallback((chip: ChipDenomination) => {
    if (!canAddChip(chip.value)) return;

    const newAmount = Math.round((betAmount + chip.value) * 100) / 100;
    setChipHistory(prev => [...prev, chip.value]);
    onBetChange(newAmount);
  }, [betAmount, onBetChange, canAddChip]);

  // Remove the last chip added (LIFO)
  const undoLastChip = useCallback(() => {
    if (chipHistory.length === 0 || disabled) return;

    const lastChipValue = chipHistory[chipHistory.length - 1];
    const newAmount = Math.round((betAmount - lastChipValue) * 100) / 100;

    setChipHistory(prev => prev.slice(0, -1));
    onBetChange(Math.max(0, newAmount));
  }, [chipHistory, betAmount, onBetChange, disabled]);

  // Clear all chips
  const clearBet = useCallback(() => {
    if (disabled) return;
    setChipHistory([]);
    onBetChange(0);
  }, [onBetChange, disabled]);

  return (
    <div className="space-y-4">
      {/* Current Bet Display - Click to undo */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Your Bet</span>
          {betAmount > 0 && (
            <button
              onClick={clearBet}
              disabled={disabled}
              className="text-xs text-red-400 hover:text-red-300 transition disabled:opacity-50"
            >
              Clear All
            </button>
          )}
        </div>

        <div
          className="flex items-center justify-center min-h-[100px] cursor-pointer hover:bg-gray-700/30 rounded-lg transition"
          onClick={undoLastChip}
          title={betAmount > 0 ? "Click to remove last chip" : ""}
        >
          {betAmount > 0 ? (
            <ChipStack
              amount={betAmount}
              maxChipsShown={12}
              showValue={true}
              size="md"
            />
          ) : (
            <div className="text-gray-500 text-sm italic">
              Click chips below to place bet
            </div>
          )}
        </div>

        {betAmount > 0 && (
          <p className="text-center text-xs text-gray-500 mt-2">
            Click stack to undo last chip
          </p>
        )}
      </div>

      {/* Chip Tray - Click to add */}
      <div>
        <span className="text-xs text-gray-400 uppercase tracking-wide block mb-2">
          Add Chips
        </span>

        <div className="flex flex-wrap justify-center gap-2">
          {CHIP_DENOMINATIONS.map((chip) => {
            const canAdd = canAddChip(chip.value);

            return (
              <button
                key={chip.color}
                onClick={() => addChip(chip)}
                disabled={!canAdd}
                className={`
                  flex flex-col items-center p-2 rounded-lg transition-all
                  ${canAdd
                    ? 'bg-gray-800/50 hover:bg-gray-700/50 hover:scale-105 cursor-pointer border border-gray-700/50 hover:border-dfinity-turquoise/50'
                    : 'bg-gray-900/30 opacity-40 cursor-not-allowed border border-gray-800/30'
                  }
                `}
                title={canAdd ? `Add ${chip.label} USDT` : `Cannot add (exceeds ${betAmount + chip.value > maxBet ? 'max bet' : 'balance'})`}
              >
                <img
                  src={chip.topImg}
                  alt={`${chip.color} chip - ${chip.label} USDT`}
                  className="w-12 h-12 object-contain drop-shadow-lg"
                />
                <span className={`text-xs font-mono mt-1 ${canAdd ? 'text-gray-300' : 'text-gray-600'}`}>
                  {chip.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Limits info */}
      <div className="flex justify-between text-xs text-gray-500 px-1">
        <span>Balance: {gameBalanceUSDT.toFixed(2)} USDT</span>
        <span>Max bet: {maxBet.toFixed(2)} USDT</span>
      </div>
    </div>
  );
};
