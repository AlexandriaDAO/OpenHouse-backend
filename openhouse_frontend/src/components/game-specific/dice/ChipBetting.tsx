import React, { useState, useCallback, useMemo } from 'react';
import {
  CHIP_DENOMINATIONS,
  ChipDenomination,
  decomposeIntoChips,
  getNextHigherChip,
} from './chipConfig';
import { ChipStack } from './ChipStack';
import { DECIMALS_PER_CKUSDT } from '../../../types/balance';

type HouseLimitStatus = 'healthy' | 'warning' | 'danger';

interface ChipBettingProps {
  betAmount: number;
  onBetChange: (amount: number) => void;
  gameBalance: bigint;
  maxBet: number;
  disabled?: boolean;
  houseLimitStatus?: HouseLimitStatus;
}

export const ChipBetting: React.FC<ChipBettingProps> = ({
  betAmount,
  onBetChange,
  gameBalance,
  maxBet,
  disabled = false,
  houseLimitStatus = 'healthy',
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

  // Border color based on house limit status
  const borderClass = houseLimitStatus === 'danger'
    ? 'border-red-500/70 shadow-lg shadow-red-500/20'
    : houseLimitStatus === 'warning'
    ? 'border-yellow-500/50'
    : 'border-gray-700/50';

  return (
    <div className={`bg-gray-800/30 rounded-lg p-3 border ${borderClass} transition-all`}>
      {/* House limit warning badge */}
      {houseLimitStatus !== 'healthy' && (
        <div className={`text-[10px] mb-2 px-2 py-0.5 rounded inline-block ${
          houseLimitStatus === 'danger'
            ? 'bg-red-500/20 text-red-400'
            : 'bg-yellow-500/20 text-yellow-400'
        }`}>
          {houseLimitStatus === 'danger' ? 'Near house limit!' : 'Approaching limit'}
        </div>
      )}

      {/* Unified horizontal layout: chips on left, bet on right */}
      <div className="flex items-center gap-4">
        {/* Chip buttons - compact horizontal row */}
        <div className="flex gap-1.5">
          {CHIP_DENOMINATIONS.map((chip) => {
            const canAdd = canAddChip(chip.value);
            return (
              <button
                key={chip.color}
                onClick={() => addChip(chip)}
                disabled={!canAdd}
                className={`
                  flex flex-col items-center p-1.5 rounded transition-all
                  ${canAdd
                    ? 'hover:bg-gray-700/50 hover:scale-110 cursor-pointer'
                    : 'opacity-30 cursor-not-allowed'
                  }
                `}
                title={canAdd ? `+${chip.label}` : `Max reached`}
              >
                <img
                  src={chip.topImg}
                  alt={`${chip.label}`}
                  className="w-10 h-10 object-contain drop-shadow-lg"
                />
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-12 bg-gray-700/50"></div>

        {/* Bet display - compact */}
        <div
          className="flex-1 flex items-center justify-between cursor-pointer hover:bg-gray-700/20 rounded px-2 py-1 transition"
          onClick={undoLastChip}
          title={betAmount > 0 ? "Click to undo" : ""}
        >
          <div className="flex items-center gap-3">
            {betAmount > 0 ? (
              <ChipStack
                amount={betAmount}
                maxChipsShown={6}
                showValue={false}
                size="sm"
              />
            ) : (
              <div className="text-gray-600 text-xs">No bet</div>
            )}
            <div className="text-right">
              <div className="font-mono font-bold text-lg text-white">
                {betAmount > 0 ? `$${betAmount.toFixed(2)}` : '$0.00'}
              </div>
              <div className="text-[10px] text-gray-500">
                max ${maxBet.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Clear button */}
          {betAmount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); clearBet(); }}
              disabled={disabled}
              className="text-xs text-gray-500 hover:text-red-400 transition px-2"
              title="Clear bet"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
