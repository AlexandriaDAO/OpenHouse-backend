// Grid dimensions - 512x512 divided into 16 quadrants of 128x128
export const GRID_SIZE = 512;
export const QUADRANT_SIZE = 128;
export const QUADRANTS_PER_ROW = 4;
export const TOTAL_QUADRANTS = 16;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE; // 262,144 cells

// Quadrant control system
export const CONTROLLER_THRESHOLD_PERCENT = 80;

/** Get quadrant index (0-15) from cell coordinates */
export function getQuadrant(x: number, y: number): number {
  const qx = Math.floor(x / QUADRANT_SIZE);
  const qy = Math.floor(y / QUADRANT_SIZE);
  return qy * QUADRANTS_PER_ROW + qx;
}

/** Coin display states for quadrant control */
export type CoinState = 'locked' | 'unlocked' | 'own';

/** Get the coin state based on ownership and quadrant control */
export function getCoinState(
  coinOwner: number,
  myPlayer: number | null,
  quadrant: number,
  controllers: number[]
): CoinState {
  // Your own coins are always locked (can't collect your own)
  if (myPlayer !== null && coinOwner === myPlayer) {
    return 'own';
  }

  // Check if current player controls this quadrant
  const controller = controllers[quadrant] ?? 0;
  if (myPlayer !== null && controller === myPlayer) {
    return 'unlocked';  // Gold - can collect!
  }

  return 'locked';  // Steel - cannot collect
}

/** Coin colors based on state */
export const COIN_COLORS = {
  locked: '#8B8B8B',    // Steel gray
  unlocked: '#FFD700',  // Gold
  own: '#8B8B8B',       // Steel gray (same as locked - can't collect own coins)
};

// Legacy constants for backend compatibility
export const GRID_WIDTH = GRID_SIZE;
export const GRID_HEIGHT = GRID_SIZE;

// Simulation timing
export const LOCAL_TICK_MS = 100;      // Local simulation: 10 generations/second
export const BACKEND_SYNC_MS = 5000;   // Sync with backend every 5 seconds

// Rendering constants
export const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';

// Swipe detection
export const SWIPE_THRESHOLD = 50;
export const DEAD_COLOR = '#000000';

// Gold border for cells with coins
export const GOLD_BORDER_MIN_OPACITY = 0.3;
export const GOLD_BORDER_MAX_OPACITY = 1.0;

// Server definitions
export interface LifeServer {
  id: string;
  name: string;
  canisterId: string;
}

export const LIFE_SERVERS: LifeServer[] = [
  { id: 'server1', name: 'Server 1', canisterId: 'pijnb-7yaaa-aaaae-qgcuq-cai' },
  { id: 'server2', name: 'Server 2', canisterId: 'qoski-4yaaa-aaaai-q4g4a-cai' },
];

export const DEFAULT_SERVER_ID = 'server1';

// View modes
export type ViewMode = 'overview' | 'quadrant';

// Pattern types - re-exported from organized pattern library
export type { PatternInfo, PatternCategory } from './life/patterns';
export { PATTERNS, CATEGORY_INFO, getPatternsByCategory, getPatternByName } from './life/patterns';

// Batch placement support
export interface PendingPlacement {
  id: string;
  cells: [number, number][];
  patternName: string;
  centroid: [number, number]; // For display purposes
}

// 10 Player colors
export const PLAYER_COLORS: Record<number, string> = {
  1: '#39FF14',  // Neon Green
  2: '#FF3939',  // Red
  3: '#3939FF',  // Blue
  4: '#FFD700',  // Gold
  5: '#FF39FF',  // Magenta
  6: '#39FFFF',  // Cyan
  7: '#FF8C00',  // Orange
  8: '#8B5CF6',  // Purple
  9: '#F472B6',  // Pink
  10: '#A3E635', // Lime
};

export const TERRITORY_COLORS: Record<number, string> = {
  1: 'rgba(57, 255, 20, 0.15)',
  2: 'rgba(255, 57, 57, 0.15)',
  3: 'rgba(57, 57, 255, 0.15)',
  4: 'rgba(255, 215, 0, 0.15)',
  5: 'rgba(255, 57, 255, 0.15)',
  6: 'rgba(57, 255, 255, 0.15)',
  7: 'rgba(255, 140, 0, 0.15)',
  8: 'rgba(139, 92, 246, 0.15)',
  9: 'rgba(244, 114, 182, 0.15)',
  10: 'rgba(163, 230, 53, 0.15)',
};

// Note: CATEGORY_INFO and PATTERNS are now imported from './life/patterns'
// See src/pages/life/patterns/ for the organized pattern library
