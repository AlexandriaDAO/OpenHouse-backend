import { useState, useCallback } from 'react';

export interface BetValidationOptions {
  minBet?: number;
  maxBet?: number;
  requireAuth?: boolean;
  customValidation?: (amount: number) => string | null;
}

export function useBetValidation(options: BetValidationOptions = {}) {
  const {
    minBet = 0.1,
    maxBet = 100,
    requireAuth = false,
    customValidation,
  } = options;

  const [error, setError] = useState('');

  const validate = useCallback((amount: number, isAuthenticated?: boolean): boolean => {
    // Clear previous errors
    setError('');

    // Check authentication if required
    if (requireAuth && !isAuthenticated) {
      setError('Please login to place bets');
      return false;
    }

    // Check min/max bounds
    if (amount < minBet) {
      setError(`Minimum bet is ${minBet} ICP`);
      return false;
    }

    if (amount > maxBet) {
      setError(`Maximum bet is ${maxBet} ICP`);
      return false;
    }

    // Check if amount is a valid number
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid bet amount');
      return false;
    }

    // Run custom validation if provided
    if (customValidation) {
      const customError = customValidation(amount);
      if (customError) {
        setError(customError);
        return false;
      }
    }

    return true;
  }, [minBet, maxBet, requireAuth, customValidation]);

  const clearError = useCallback(() => {
    setError('');
  }, []);

  return {
    validate,
    error,
    clearError,
    minBet,
    maxBet,
  };
}