// Game types supported by the balance provider
export type GameType = 'dice' | 'crash' | 'plinko' | 'blackjack';

// Balance information for a single game
export interface GameBalance {
  wallet: bigint;  // User's USDT wallet balance
  game: bigint;    // User's balance in the specific game canister
  house: bigint;   // House pot balance for the game
}

// Status tracking for each game
export interface GameStatus {
  loading: boolean;
  error: string | null;
  syncing: boolean;  // True when verifying after optimistic update
  lastError: Error | null;
  initialized: boolean;  // True after first successful balance fetch
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
  isInitialized: (game: GameType) => boolean;

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

export const DECIMALS_PER_CKUSDT = 1_000_000;
export const TRANSFER_FEE = 10_000;

export function formatUSDT(amount: bigint): string {
  const usdt = Number(amount) / DECIMALS_PER_CKUSDT;
  return `$${usdt.toFixed(2)}`;
}