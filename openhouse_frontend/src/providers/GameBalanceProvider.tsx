import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Principal } from '@dfinity/principal';
import {
  GameType,
  GameBalance,
  GameStatus,
  OptimisticUpdate,
  BalanceProviderState,
  GameBalanceContextValue,
  BalanceFetchResult,
  BalanceFetchError
} from '../types/balance';
import { useAuth } from '../providers/AuthProvider';
import useLedgerActor from '../hooks/actors/useLedgerActor';
import useDiceActor from '../hooks/actors/useDiceActor';
import useCrashActor from '../hooks/actors/useCrashActor';
import usePlinkoActor from '../hooks/actors/usePlinkoActor';
import useBlackjackActor from '../hooks/actors/useBlackjackActor';

// Initial state for a game
const createInitialGameBalance = (): GameBalance => ({
  wallet: BigInt(0),
  game: BigInt(0),
  house: BigInt(0),
});

const createInitialGameStatus = (): GameStatus => ({
  loading: false,
  error: null,
  syncing: false,
  lastError: null,
  initialized: false,
});

// Initial state for the provider
const createInitialState = (): BalanceProviderState => {
  const games: GameType[] = ['dice', 'plinko', 'crash', 'blackjack'];

  return {
    balances: games.reduce((acc, game) => ({
      ...acc,
      [game]: createInitialGameBalance(),
    }), {} as Record<GameType, GameBalance>),

    status: games.reduce((acc, game) => ({
      ...acc,
      [game]: createInitialGameStatus(),
    }), {} as Record<GameType, GameStatus>),

    lastUpdated: games.reduce((acc, game) => ({
      ...acc,
      [game]: 0,
    }), {} as Record<GameType, number>),

    optimisticBalances: games.reduce((acc, game) => ({
      ...acc,
      [game]: null,
    }), {} as Record<GameType, GameBalance | null>),
  };
};

// Context
const GameBalanceContext = createContext<GameBalanceContextValue | null>(null);

interface GameBalanceProviderProps {
  children: React.ReactNode;
}

export const GameBalanceProvider: React.FC<GameBalanceProviderProps> = ({ children }) => {
  const { principal } = useAuth();
  const { actor: ledgerActor } = useLedgerActor();
  const { actor: diceActor } = useDiceActor();
  const { actor: crashActor } = useCrashActor();
  const { actor: plinkoActor } = usePlinkoActor();
  const { actor: blackjackActor } = useBlackjackActor();

  const [state, setState] = useState<BalanceProviderState>(createInitialState());
  const verificationTimers = useRef<Record<GameType, ReturnType<typeof setTimeout> | null>>({
    dice: null,
    plinko: null,
    crash: null,
    blackjack: null,
  });


  // Fetch balances for a specific game
  const fetchBalances = useCallback(async (game: GameType): Promise<BalanceFetchResult> => {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        let gameBalance: bigint;
        let houseBalance: bigint;
        let walletBalance: bigint = BigInt(0);

        // Handle each game type separately with proper typing
        switch (game) {
          case 'dice':
            if (!diceActor) throw new Error('Dice actor not available');
            [gameBalance, houseBalance] = await Promise.all([
              (diceActor as any).get_my_balance(),
              (diceActor as any).get_house_balance(),
            ]);
            break;
          case 'crash':
            if (!crashActor) throw new Error('Crash actor not available');
            [gameBalance, houseBalance] = await Promise.all([
              (crashActor as any).get_my_balance(),
              (crashActor as any).get_house_balance(),
            ]);
            break;
          case 'plinko':
            if (!plinkoActor) throw new Error('Plinko actor not available');
            [gameBalance, houseBalance] = await Promise.all([
              (plinkoActor as any).get_my_balance(),
              (plinkoActor as any).get_house_balance(),
            ]);
            break;
          case 'blackjack':
            if (!blackjackActor) throw new Error('Blackjack actor not available');
            [gameBalance, houseBalance] = await Promise.all([
              (blackjackActor as any).get_my_balance(),
              (blackjackActor as any).get_house_balance(),
            ]);
            break;
          default:
            throw new Error(`Unknown game type: ${game}`);
        }

        // Try to fetch wallet balance (optional - may not be available if not authenticated)
        if (ledgerActor && principal) {
          try {
            const principalObj = Principal.fromText(principal);
            walletBalance = await ledgerActor.icrc1_balance_of({
              owner: principalObj,
              subaccount: [],
            });
          } catch (walletError) {
            console.warn('Failed to fetch wallet balance:', walletError);
            // Continue with default walletBalance of 0
          }
        }

        // If house balance is 0 and we haven't exhausted retries, retry after delay
        if (houseBalance === BigInt(0) && retries < maxRetries - 1) {
          console.log(`House balance is 0 for ${game}, retrying (${retries + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          retries++;
          continue;
        }

        return {
          wallet: walletBalance,
          game: gameBalance,
          house: houseBalance,
          timestamp: Date.now(),
        };
      } catch (error) {
        throw new BalanceFetchError(game, error as Error);
      }
    }

    // This should never be reached due to the return in the loop, but TypeScript needs it
    throw new Error('Max retries exceeded');
  }, [ledgerActor, principal, diceActor, crashActor, plinkoActor, blackjackActor]);

  // Refresh balances for a game
  const refreshBalances = useCallback(async (game: GameType) => {
    setState(prev => ({
      ...prev,
      status: {
        ...prev.status,
        [game]: { ...prev.status[game], loading: true, error: null },
      },
    }));

    try {
      const result = await fetchBalances(game);

      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          [game]: {
            wallet: result.wallet,
            game: result.game,
            house: result.house,
          },
        },
        status: {
          ...prev.status,
          [game]: { ...prev.status[game], loading: false, error: null, initialized: true },
        },
        lastUpdated: {
          ...prev.lastUpdated,
          [game]: result.timestamp,
        },
        // Clear optimistic balance after successful fetch
        optimisticBalances: {
          ...prev.optimisticBalances,
          [game]: null,
        },
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [game]: {
            ...prev.status[game],
            loading: false,
            error: errorMessage,
            lastError: error as Error,
          },
        },
      }));
    }
  }, [fetchBalances]);

  // Optimistic update
  const optimisticUpdate = useCallback((game: GameType, update: OptimisticUpdate) => {
    setState(prev => {
      const currentBalance = prev.optimisticBalances[game] || prev.balances[game];
      let newValue: bigint;

      switch (update.operation) {
        case 'add':
          newValue = currentBalance[update.field] + update.amount;
          break;
        case 'subtract':
          // Prevent negative balances (critical for mainnet safety)
          const result = currentBalance[update.field] - update.amount;
          if (result < BigInt(0)) {
            console.error(`Attempted negative balance for ${game}.${update.field}: ${currentBalance[update.field]} - ${update.amount}`);
            newValue = BigInt(0); // Clamp to zero
          } else {
            newValue = result;
          }
          break;
        case 'set':
          newValue = update.amount;
          break;
      }

      const newOptimisticBalance = {
        ...currentBalance,
        [update.field]: newValue,
      };

      // Clear any existing verification timer
      if (verificationTimers.current[game]) {
        clearTimeout(verificationTimers.current[game]!);
      }

      // Schedule verification after 2 seconds
      verificationTimers.current[game] = setTimeout(() => {
        verifyAndSync(game);
      }, 2000);

      return {
        ...prev,
        optimisticBalances: {
          ...prev.optimisticBalances,
          [game]: newOptimisticBalance,
        },
      };
    });
  }, []);

  // Verify and sync with backend
  const verifyAndSync = useCallback(async (game: GameType): Promise<boolean> => {
    // Check if the required actor is available
    const actorAvailable =
      (game === 'dice' && diceActor) ||
      (game === 'crash' && crashActor) ||
      (game === 'plinko' && plinkoActor) ||
      (game === 'blackjack' && blackjackActor);

    if (!actorAvailable) {
      console.warn(`Actor not available for ${game}, skipping verification`);
      return false;
    }

    // Capture optimistic balance at the time of starting sync
    let capturedOptimisticBalance: GameBalance | null = null;

    setState(prev => {
      capturedOptimisticBalance = prev.optimisticBalances[game] || null;
      return {
        ...prev,
        status: {
          ...prev.status,
          [game]: { ...prev.status[game], syncing: true },
        },
      };
    });

    try {
      const result = await fetchBalances(game);

      // Check if there's a mismatch with the captured optimistic balance
      if (capturedOptimisticBalance !== null) {
        const optimBalance = capturedOptimisticBalance as GameBalance;
        const gameBalanceMismatch = optimBalance.game !== result.game;
        const houseBalanceMismatch = optimBalance.house !== result.house;

        if (gameBalanceMismatch || houseBalanceMismatch) {
          // Log the mismatch but sync to actual values
          console.warn(`Balance mismatch detected for ${game}:`, {
            optimistic: { game: optimBalance.game, house: optimBalance.house },
            actual: { game: result.game, house: result.house },
          });

          setState(prev => ({
            ...prev,
            status: {
              ...prev.status,
              [game]: {
                ...prev.status[game],
                syncing: false,
                error: 'Balance sync required - values updated',
              },
            },
          }));
        }
      }

      // Update to actual values
      setState(prev => ({
        ...prev,
        balances: {
          ...prev.balances,
          [game]: {
            wallet: result.wallet,
            game: result.game,
            house: result.house,
          },
        },
        status: {
          ...prev.status,
          [game]: { ...prev.status[game], syncing: false, initialized: true },
        },
        lastUpdated: {
          ...prev.lastUpdated,
          [game]: result.timestamp,
        },
        optimisticBalances: {
          ...prev.optimisticBalances,
          [game]: null,
        },
      }));

      return true; // Successfully synced
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      setState(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [game]: {
            ...prev.status[game],
            syncing: false,
            error: errorMessage,
            lastError: error as Error,
          },
        },
      }));
      return false; // Sync failed
    }
  }, [fetchBalances, diceActor, crashActor, plinkoActor, blackjackActor]);

  // Retry last operation
  const retryLastOperation = useCallback(async (game: GameType) => {
    await refreshBalances(game);
  }, [refreshBalances]);

  // Clear error
  const clearError = useCallback((game: GameType) => {
    setState(prev => ({
      ...prev,
      status: {
        ...prev.status,
        [game]: { ...prev.status[game], error: null, lastError: null },
      },
    }));
  }, []);

  // Helper functions
  const isLoading = useCallback((game: GameType) => state.status[game].loading, [state.status]);
  const hasError = useCallback((game: GameType) => !!state.status[game].error, [state.status]);
  const isSyncing = useCallback((game: GameType) => state.status[game].syncing, [state.status]);
  const isInitialized = useCallback((game: GameType) => state.status[game].initialized, [state.status]);

  const getBalance = useCallback((game: GameType): GameBalance => {
    // Return optimistic balance if available, otherwise actual balance
    return state.optimisticBalances[game] || state.balances[game];
  }, [state.balances, state.optimisticBalances]);

  const getLastUpdated = useCallback((game: GameType) => state.lastUpdated[game], [state.lastUpdated]);

  // Auto-refresh on mount when actors are ready - centralized for all games
  useEffect(() => {
    if (diceActor) refreshBalances('dice').catch(console.error);
  }, [diceActor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (plinkoActor) refreshBalances('plinko').catch(console.error);
  }, [plinkoActor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (crashActor) refreshBalances('crash').catch(console.error);
  }, [crashActor]); // eslint-disable-line react-hooks/exhaustive-deps


  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(verificationTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const value: GameBalanceContextValue = {
    balances: Object.keys(state.balances).reduce((acc, game) => ({
      ...acc,
      [game]: getBalance(game as GameType),
    }), {} as Record<GameType, GameBalance>),
    status: state.status,
    isLoading,
    hasError,
    isSyncing,
    isInitialized,
    refreshBalances,
    optimisticUpdate,
    verifyAndSync,
    retryLastOperation,
    clearError,
    getBalance,
    getLastUpdated,
  };

  return (
    <GameBalanceContext.Provider value={value}>
      {children}
    </GameBalanceContext.Provider>
  );
};

// Type for the scoped return value
interface ScopedGameBalance {
  balance: GameBalance;
  status: GameStatus;
  isLoading: boolean;
  hasError: boolean;
  isSyncing: boolean;
  isInitialized: boolean;
  refresh: () => Promise<void>;
  optimisticUpdate: (update: OptimisticUpdate) => void;
  verifyAndSync: () => Promise<boolean>;
  retry: () => Promise<void>;
  clearError: () => void;
  lastUpdated: number;
}

// Custom hook to use the game balance context
export function useGameBalance(): GameBalanceContextValue;
export function useGameBalance(game: GameType): ScopedGameBalance;
export function useGameBalance(game?: GameType): GameBalanceContextValue | ScopedGameBalance {
  const context = useContext(GameBalanceContext);

  if (!context) {
    throw new Error('useGameBalance must be used within GameBalanceProvider');
  }

  // Memoize scoped callbacks for specific game - prevents infinite render loops
  const scopedRefresh = useCallback(() => {
    if (game) return context.refreshBalances(game);
    return Promise.resolve();
  }, [context.refreshBalances, game]);

  const scopedOptimisticUpdate = useCallback((update: OptimisticUpdate) => {
    if (game) context.optimisticUpdate(game, update);
  }, [context.optimisticUpdate, game]);

  const scopedVerifyAndSync = useCallback(() => {
    if (game) return context.verifyAndSync(game);
    return Promise.resolve(false);
  }, [context.verifyAndSync, game]);

  const scopedRetry = useCallback(() => {
    if (game) return context.retryLastOperation(game);
    return Promise.resolve();
  }, [context.retryLastOperation, game]);

  const scopedClearError = useCallback(() => {
    if (game) context.clearError(game);
  }, [context.clearError, game]);

  // Memoize the scoped return object to prevent new object on every render
  const scopedValue = useMemo((): ScopedGameBalance | null => {
    if (!game) return null;
    return {
      balance: context.getBalance(game),
      status: context.status[game],
      isLoading: context.isLoading(game),
      hasError: context.hasError(game),
      isSyncing: context.isSyncing(game),
      isInitialized: context.isInitialized(game),
      refresh: scopedRefresh,
      optimisticUpdate: scopedOptimisticUpdate,
      verifyAndSync: scopedVerifyAndSync,
      retry: scopedRetry,
      clearError: scopedClearError,
      lastUpdated: context.getLastUpdated(game),
    };
  }, [
    game,
    context.getBalance,
    context.status,
    context.isLoading,
    context.hasError,
    context.isSyncing,
    context.isInitialized,
    context.getLastUpdated,
    scopedRefresh,
    scopedOptimisticUpdate,
    scopedVerifyAndSync,
    scopedRetry,
    scopedClearError,
  ]);

  // If a specific game is provided, return memoized scoped functions
  if (game && scopedValue) {
    return scopedValue;
  }

  return context;
}