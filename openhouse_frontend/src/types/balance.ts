// Game types supported by the balance provider
export type GameType = 'dice' | 'crash' | 'plinko' | 'mines';

// Balance information for a single game
export interface GameBalance {
  wallet: bigint;  // User's ICP wallet balance
  game: bigint;    // User's balance in the specific game canister
  house: bigint;   // House pot balance for the game
}

// Status tracking for each game
export interface GameStatus {
  loading: boolean;
  error: string | null;
  syncing: boolean;  // True when verifying after optimistic update
  lastError: Error | null;
}

// Optimistic update payload
export interface OptimisticUpdate {
  field: 'game' | 'house';
  amount: bigint;
  operation: 'add' | 'subtract' | 'set';
}

// Balance provider state structure
export interface BalanceProviderState {
  balances: Record<GameType, GameBalance>;
  status: Record<GameType, GameStatus>;
  lastUpdated: Record<GameType, number>;
  optimisticBalances: Record<GameType, GameBalance | null>;  // Temporary optimistic state
}

// Context value exposed by the provider
export interface GameBalanceContextValue {
  // State
  balances: Record<GameType, GameBalance>;
  status: Record<GameType, GameStatus>;
  isLoading: (game: GameType) => boolean;
  hasError: (game: GameType) => boolean;
  isSyncing: (game: GameType) => boolean;

  // Actions
  refreshBalances: (game: GameType) => Promise<void>;
  optimisticUpdate: (game: GameType, update: OptimisticUpdate) => void;
  verifyAndSync: (game: GameType) => Promise<boolean>; // Returns true if in sync
  retryLastOperation: (game: GameType) => Promise<void>;
  clearError: (game: GameType) => void;

  // Utilities
  getBalance: (game: GameType) => GameBalance;
  getLastUpdated: (game: GameType) => number;
}

// Result type for balance fetching
export interface BalanceFetchResult {
  wallet: bigint;
  game: bigint;
  house: bigint;
  timestamp: number;
}

// Error types
export class BalanceSyncError extends Error {
  constructor(
    public game: GameType,
    public expected: bigint,
    public actual: bigint,
    message?: string
  ) {
    super(message || `Balance mismatch for ${game}: expected ${expected}, got ${actual}`);
    this.name = 'BalanceSyncError';
  }
}

export class BalanceFetchError extends Error {
  constructor(
    public game: GameType,
    public originalError: Error,
    message?: string
  ) {
    super(message || `Failed to fetch balance for ${game}: ${originalError.message}`);
    this.name = 'BalanceFetchError';
  }
}