// Grid dimensions - 512x512 divided into 16 quadrants of 128x128
export const GRID_SIZE = 512;
export const QUADRANT_SIZE = 128;
export const QUADRANTS_PER_ROW = 4;
export const TOTAL_QUADRANTS = 16;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE; // 262,144 cells

// Base dimensions (v2 base-centric system)
export const BASE_SIZE = 8;           // Total base footprint (8x8)
export const BASE_INTERIOR_SIZE = 6;  // Interior territory (6x6)
export const BASE_COST = 100;         // Cost to place a base

/** Get quadrant index (0-15) from cell coordinates */
export function getQuadrant(x: number, y: number): number {
  const qx = Math.floor(x / QUADRANT_SIZE);
  const qy = Math.floor(y / QUADRANT_SIZE);
  return qy * QUADRANTS_PER_ROW + qx;
}

/** Check if a position is within a base's wall positions */
export function isBaseWall(cellX: number, cellY: number, baseX: number, baseY: number): boolean {
  const relX = cellX - baseX;
  const relY = cellY - baseY;
  // Must be within 8x8 bounds
  if (relX < 0 || relX >= BASE_SIZE || relY < 0 || relY >= BASE_SIZE) return false;
  // Wall = on the perimeter
  return relX === 0 || relX === BASE_SIZE - 1 || relY === 0 || relY === BASE_SIZE - 1;
}

/** Check if a position is within a base's interior (6x6) */
export function isBaseInterior(cellX: number, cellY: number, baseX: number, baseY: number): boolean {
  const relX = cellX - baseX;
  const relY = cellY - baseY;
  // Interior is 1 to 6 (exclusive of perimeter)
  return relX >= 1 && relX < BASE_SIZE - 1 && relY >= 1 && relY < BASE_SIZE - 1;
}

/** Check if a position is within a base's 8x8 protection zone */
export function isInBaseZone(cellX: number, cellY: number, baseX: number, baseY: number): boolean {
  const relX = cellX - baseX;
  const relY = cellY - baseY;
  return relX >= 0 && relX < BASE_SIZE && relY >= 0 && relY < BASE_SIZE;
}

// Legacy constants for backend compatibility
export const GRID_WIDTH = GRID_SIZE;
export const GRID_HEIGHT = GRID_SIZE;

// Simulation timing - RATES MUST MATCH for proper sync
export const LOCAL_TICK_MS = 125;      // Local simulation: 8 gen/sec (1000ms / 125ms = 8)
export const BACKEND_SYNC_MS = 500;    // Sync every 500ms = 4 backend generations
// Backend runs at 8 gen/sec (GENERATIONS_PER_TICK=8, TICK_INTERVAL_MS=1000)

// Force sync with backend every N ms regardless of staleness
// This prevents drifting forever when latency > sync interval
export const FORCE_SYNC_MS = 5000;     // Force re-sync every 5 seconds

// Accept responses within this many generations of local (even if "behind")
// At 8 gen/sec, 16 gens = 2 seconds of acceptable drift
export const SYNC_TOLERANCE_GENS = 16;

// Local simulation toggle - when false, display backend state directly (more accurate, slightly choppier)
// When true, run local Conway simulation between syncs (smoother but can drift)
// ENABLED with out-of-order protection - IC latency too high for backend-only smooth display
export const ENABLE_LOCAL_SIM = true;

// Debug flag for sync verification (Part 1 of timer optimization)
// Set to true during testing, false for production
export const DEBUG_SYNC = true;

// Rendering constants
export const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';

// Swipe detection
export const SWIPE_THRESHOLD = 50;
export const DEAD_COLOR = '#000000';

// Base wall color
export const BASE_WALL_COLOR = '#4A4A4A';  // Dark gray for fortress walls

// Server definitions
export interface RiskServer {
  id: string;
  name: string;
  canisterId: string;
}

export const RISK_SERVERS: RiskServer[] = [
  { id: 'life1', name: 'Server 1', canisterId: 'pijnb-7yaaa-aaaae-qgcuq-cai' },
  { id: 'life2', name: 'Server 2', canisterId: 'qoski-4yaaa-aaaai-q4g4a-cai' },
  { id: 'life3', name: 'Server 3', canisterId: '66p3s-uaaaa-aaaad-ac47a-cai' },
];

export const DEFAULT_SERVER_ID = 'life1';

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
