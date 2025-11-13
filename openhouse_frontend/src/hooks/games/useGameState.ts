import { useState, useCallback } from 'react';

export interface BaseGameResult {
  is_win: boolean;
  payout: bigint;
  bet_amount: bigint;
  timestamp: bigint;
  clientId?: string;
}

export interface GameStateHook<T extends BaseGameResult = BaseGameResult> {
  // Betting state
  betAmount: number;
  setBetAmount: (amount: number) => void;
  betError: string;
  validateBet: () => boolean;

  // Game state
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  gameError: string;
  setGameError: (error: string) => void;

  // Results
  lastResult: T | null;
  setLastResult: (result: T | null) => void;
  history: T[];
  addToHistory: (result: T) => void;

  // Utilities
  clearErrors: () => void;
  reset: () => void;
}

export function useGameState<T extends BaseGameResult = BaseGameResult>(
  minBet = 0.1,
  maxBet = 100
): GameStateHook<T> {
  // Betting state
  const [betAmount, setBetAmount] = useState(1);
  const [betError, setBetError] = useState('');

  // Game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [lastResult, setLastResult] = useState<T | null>(null);
  const [history, setHistory] = useState<T[]>([]);

  // Validation
  const validateBet = useCallback(() => {
    if (betAmount < minBet || betAmount > maxBet) {
      setBetError(`Bet amount must be between ${minBet} and ${maxBet} ICP`);
      return false;
    }
    setBetError('');
    return true;
  }, [betAmount, minBet, maxBet]);

  // History management
  const addToHistory = useCallback((result: T) => {
    const resultWithId = {
      ...result,
      clientId: result.clientId || crypto.randomUUID(),
    };
    setHistory(prev => [resultWithId, ...prev.slice(0, 9)]); // Keep last 10
    setLastResult(resultWithId);
  }, []);

  // Utilities
  const clearErrors = useCallback(() => {
    setBetError('');
    setGameError('');
  }, []);

  const reset = useCallback(() => {
    setBetAmount(1);
    setBetError('');
    setGameError('');
    setIsPlaying(false);
    setLastResult(null);
  }, []);

  return {
    // Betting
    betAmount,
    setBetAmount,
    betError,
    validateBet,

    // Game state
    isPlaying,
    setIsPlaying,
    gameError,
    setGameError,

    // Results
    lastResult,
    setLastResult,
    history,
    addToHistory,

    // Utilities
    clearErrors,
    reset,
  };
}