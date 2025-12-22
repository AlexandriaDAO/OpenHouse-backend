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

// Simulation timing
export const LOCAL_TICK_MS = 50;       // Local simulation: 20 generations/second (when enabled)
export const BACKEND_SYNC_MS = 500;    // Sync every 500ms - balance between freshness and spam

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
  { id: 'risk', name: 'Risk', canisterId: '66p3s-uaaaa-aaaad-ac47a-cai' },
];

export const DEFAULT_SERVER_ID = 'risk';

// View modes
export type ViewMode = 'overview' | 'quadrant';

// Pattern types - re-exported from organized pattern library
export type { PatternInfo, PatternCategory } from './risk/patterns';
export { PATTERNS, CATEGORY_INFO, getPatternsByCategory, getPatternByName } from './risk/patterns';

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

// Note: CATEGORY_INFO and PATTERNS are now imported from './risk/patterns'
// See src/pages/risk/patterns/ for the organized pattern library
