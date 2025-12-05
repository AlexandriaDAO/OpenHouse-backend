import { useState, useCallback, useEffect } from 'react';
import { ChipDenomination } from '../chipConfig';
import { DECIMALS_PER_CKUSDT } from '../../../types/balance';
import { RailStyle, BettingState, BettingRailProps } from '../types';

// Utility: round to 2 decimal places (USDT cents)
const roundUSDT = (amount: number): number => Math.round(amount * 100) / 100;

export function useBettingState(props: BettingRailProps): BettingState {
  const {
    betAmount,
    onBetChange,
    maxBet,
    gameBalance,
    walletBalance,
    houseBalance,
    onBalanceRefresh,
    disabled = false,
    isBalanceLoading = false,
    isBalanceInitialized = true,  // Default true for backward compatibility
  } = props;

  // Rail style (persisted)
  const [railStyle, setRailStyle] = useState<RailStyle>(() => {
    const saved = localStorage.getItem('openhouse-rail-style');
    return (saved as RailStyle) || 'classic';
  });
  const [showStylePicker, setShowStylePicker] = useState(false);

  // Deposit animation trigger
  const [showDepositAnimation, setShowDepositAnimation] = useState(false);

  // Persist rail style
  useEffect(() => {
    localStorage.setItem('openhouse-rail-style', railStyle);
  }, [railStyle]);

  // Trigger deposit animation ONLY when:
  // 1. Balance has been initialized (first load completed)
  // 2. Not currently loading
  // 3. Balance is actually zero
  // 4. Component is not disabled
  // This prevents false "deposit" prompts during auth/actor initialization
  useEffect(() => {
    const shouldShowAnimation =
      isBalanceInitialized &&
      !isBalanceLoading &&
      gameBalance === 0n &&
      !disabled;
    setShowDepositAnimation(shouldShowAnimation);
  }, [gameBalance, disabled, isBalanceLoading, isBalanceInitialized]);

  // Convert game balance to USDT
  const gameBalanceUSDT = Number(gameBalance) / DECIMALS_PER_CKUSDT;

  // Check if a chip can be added
  const canAddChip = useCallback((chipValue: number): boolean => {
    if (disabled) return false;
    const newAmount = roundUSDT(betAmount + chipValue);
    return newAmount <= maxBet && newAmount <= gameBalanceUSDT;
  }, [betAmount, maxBet, gameBalanceUSDT, disabled]);

  // Add a chip to the bet
  const addChip = useCallback((chip: ChipDenomination) => {
    if (!canAddChip(chip.value)) return;
    onBetChange(roundUSDT(betAmount + chip.value));
  }, [betAmount, onBetChange, canAddChip]);

  // Remove a chip from the bet
  const removeChip = useCallback((chipValue: number) => {
    if (disabled) return;
    onBetChange(Math.max(0, roundUSDT(betAmount - chipValue)));
  }, [betAmount, onBetChange, disabled]);

  // Clear the entire bet
  const clearBet = useCallback(() => {
    if (disabled) return;
    onBetChange(0);
  }, [onBetChange, disabled]);

  // Set bet to maximum allowed
  const setMaxBet = useCallback(() => {
    if (disabled) return;
    onBetChange(Math.min(maxBet, gameBalanceUSDT));
  }, [onBetChange, maxBet, gameBalanceUSDT, disabled]);

  return {
    // Current bet
    betAmount,
    gameBalanceUSDT,

    // Chip operations
    canAddChip,
    addChip,
    removeChip,
    clearBet,
    setMaxBet,

    // Limits
    maxBet,
    disabled,

    // Styling
    railStyle,
    setRailStyle,
    showStylePicker,
    setShowStylePicker,

    // Balances
    gameBalance,
    walletBalance,
    houseBalance,
    onBalanceRefresh,

    // Animation
    showDepositAnimation,
  };
}
