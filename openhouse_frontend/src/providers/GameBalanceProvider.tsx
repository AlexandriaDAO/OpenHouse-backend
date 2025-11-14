import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
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
import useMinesActor from '../hooks/actors/useMinesActor';

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
});

// Initial state for the provider
const createInitialState = (): BalanceProviderState => {
  const games: GameType[] = ['dice', 'crash', 'plinko', 'mines'];

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
  const { actor: minesActor } = useMinesActor();

  const [state, setState] = useState<BalanceProviderState>(createInitialState());
  const verificationTimers = useRef<Record<GameType, ReturnType<typeof setTimeout> | null>>({
    dice: null,
    crash: null,
    plinko: null,
    mines: null,
  });


  // Fetch balances for a specific game
  const fetchBalances = useCallback(async (game: GameType): Promise<BalanceFetchResult> => {
    if (!ledgerActor || !principal) {
      throw new Error(`Cannot fetch balances: missing dependencies for ${game}`);
    }

    try {
      // Convert principal string to Principal object
      const principalObj = Principal.fromText(principal);

      let gameBalance: bigint;
      let houseBalance: bigint;

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
        case 'mines':
          if (!minesActor) throw new Error('Mines actor not available');
          [gameBalance, houseBalance] = await Promise.all([
            (minesActor as any).get_my_balance(),
            (minesActor as any).get_house_balance(),
          ]);
          break;
        default:
          throw new Error(`Unknown game type: ${game}`);
      }

      // Fetch wallet balance
      const walletBalance = await ledgerActor.icrc1_balance_of({
        owner: principalObj,
        subaccount: [],
      });

      return {
        wallet: walletBalance,
        game: gameBalance,
        house: houseBalance,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new BalanceFetchError(game, error as Error);
    }
  }, [ledgerActor, principal, diceActor, crashActor, plinkoActor, minesActor]);

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
          [game]: { ...prev.status[game], loading: false, error: null },
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
          newValue = currentBalance[update.field] - update.amount;
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
    setState(prev => ({
      ...prev,
      status: {
        ...prev.status,
        [game]: { ...prev.status[game], syncing: true },
      },
    }));

    try {
      const result = await fetchBalances(game);
      const optimisticBalance = state.optimisticBalances[game];

      // Check if there's a mismatch
      if (optimisticBalance) {
        const gameBalanceMismatch = optimisticBalance.game !== result.game;
        const houseBalanceMismatch = optimisticBalance.house !== result.house;

        if (gameBalanceMismatch || houseBalanceMismatch) {
          // Log the mismatch but sync to actual values
          console.warn(`Balance mismatch detected for ${game}:`, {
            optimistic: { game: optimisticBalance.game, house: optimisticBalance.house },
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
          [game]: { ...prev.status[game], syncing: false },
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
  }, [fetchBalances, state.optimisticBalances]);

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

  const getBalance = useCallback((game: GameType): GameBalance => {
    // Return optimistic balance if available, otherwise actual balance
    return state.optimisticBalances[game] || state.balances[game];
  }, [state.balances, state.optimisticBalances]);

  const getLastUpdated = useCallback((game: GameType) => state.lastUpdated[game], [state.lastUpdated]);

  // Auto-refresh on mount and when principal changes
  useEffect(() => {
    if (principal) {
      // Only refresh dice initially as it's the active game
      // Other games will refresh when their pages are visited
      refreshBalances('dice').catch(console.error);
    }
  }, [principal]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // If a specific game is provided, return scoped functions
  if (game) {
    return {
      balance: context.getBalance(game),
      status: context.status[game],
      isLoading: context.isLoading(game),
      hasError: context.hasError(game),
      isSyncing: context.isSyncing(game),
      refresh: () => context.refreshBalances(game),
      optimisticUpdate: (update: OptimisticUpdate) => context.optimisticUpdate(game, update),
      verifyAndSync: () => context.verifyAndSync(game),
      retry: () => context.retryLastOperation(game),
      clearError: () => context.clearError(game),
      lastUpdated: context.getLastUpdated(game),
    };
  }

  return context;
}