// Grid dimensions - 512x512 divided into 16 quadrants of 128x128
export const GRID_SIZE = 512;
export const QUADRANT_SIZE = 128;
export const QUADRANTS_PER_ROW = 4;
export const TOTAL_QUADRANTS = 16;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE; // 262,144 cells

// Base dimensions (v2 base-centric system)
export const BASE_SIZE = 8;           // Total base footprint (8x8)
export const BASE_COST = 100;         // Cost to place a base

/** Get quadrant index (0-15) from cell coordinates */
export function getQuadrant(x: number, y: number): number {
  const qx = Math.floor(x / QUADRANT_SIZE);
  const qy = Math.floor(y / QUADRANT_SIZE);
  return qy * QUADRANTS_PER_ROW + qx;
}

/** Check if a position is within a base's 8x8 zone */
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


// Server definitions
export interface LifeServer {
  id: string;
  name: string;
  canisterId: string;
  locked?: boolean;  // When true, server is unavailable for play
}

export const LIFE_SERVERS: LifeServer[] = [
  { id: 'life1', name: 'Server 1', canisterId: 'pijnb-7yaaa-aaaae-qgcuq-cai' },
  { id: 'life2', name: 'Server 2', canisterId: 'qoski-4yaaa-aaaai-q4g4a-cai', locked: true },
  { id: 'life3', name: 'Server 3', canisterId: '66p3s-uaaaa-aaaad-ac47a-cai', locked: true },
];

// Legacy alias for backwards compatibility
export const RISK_SERVERS = LIFE_SERVERS;
export type RiskServer = LifeServer;

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

// Region definitions - elemental themes for each player slot
export interface RegionInfo {
  id: number;
  name: string;
  element: string;
  primaryColor: string;      // Main cell color
  secondaryColor?: string;   // For gradients/effects
  territoryColor: string;    // Semi-transparent for territory overlay
  description: string;
  cssGradient?: string;      // Optional gradient for preview cells
}

export const REGIONS: Record<number, RegionInfo> = {
  1: {
    id: 1,
    name: 'Earth',
    element: '🌍',
    primaryColor: '#8B4513',      // Saddle brown
    secondaryColor: '#228B22',    // Forest green
    territoryColor: 'rgba(139, 69, 19, 0.15)',
    description: 'Sturdy and resilient, drawing strength from the land',
    cssGradient: 'linear-gradient(135deg, #8B4513 0%, #228B22 50%, #6B8E23 100%)',
  },
  2: {
    id: 2,
    name: 'Water',
    element: '💧',
    primaryColor: '#00BFFF',      // Deep sky blue
    secondaryColor: '#1E90FF',    // Dodger blue
    territoryColor: 'rgba(0, 191, 255, 0.15)',
    description: 'Fluid and adaptive, flowing around obstacles',
    cssGradient: 'linear-gradient(135deg, #00BFFF 0%, #1E90FF 50%, #87CEEB 100%)',
  },
  3: {
    id: 3,
    name: 'Fire',
    element: '🔥',
    primaryColor: '#FF4500',      // Orange red
    secondaryColor: '#FFD700',    // Gold/yellow
    territoryColor: 'rgba(255, 69, 0, 0.15)',
    description: 'Aggressive and consuming, spreading rapidly',
    cssGradient: 'linear-gradient(135deg, #FF4500 0%, #FF6B35 50%, #FFD700 100%)',
  },
  4: {
    id: 4,
    name: 'Stone',
    element: '🪨',
    primaryColor: '#708090',      // Slate gray
    secondaryColor: '#A9A9A9',    // Dark gray
    territoryColor: 'rgba(112, 128, 144, 0.15)',
    description: 'Unyielding and persistent, like mountains',
    cssGradient: 'linear-gradient(135deg, #708090 0%, #A9A9A9 50%, #C0C0C0 100%)',
  },
  5: {
    id: 5,
    name: 'Light',
    element: '✨',
    primaryColor: '#FFFACD',      // Lemon chiffon (warm white)
    secondaryColor: '#FFFFFF',    // Pure white
    territoryColor: 'rgba(255, 250, 205, 0.15)',
    description: 'Pure and radiant, illuminating the darkness',
    cssGradient: 'linear-gradient(135deg, #FFFACD 0%, #FFFFFF 50%, #FFF8DC 100%)',
  },
  6: {
    id: 6,
    name: 'Ice',
    element: '❄️',
    primaryColor: '#E0FFFF',      // Light cyan
    secondaryColor: '#B0E0E6',    // Powder blue
    territoryColor: 'rgba(224, 255, 255, 0.15)',
    description: 'Cold and precise, crystalline structures',
    cssGradient: 'linear-gradient(135deg, #E0FFFF 0%, #B0E0E6 50%, #ADD8E6 100%)',
  },
  7: {
    id: 7,
    name: 'Plasma',
    element: '⚡',
    primaryColor: '#9932CC',      // Dark orchid (purple)
    secondaryColor: '#FFD700',    // Yellow for electric streaks
    territoryColor: 'rgba(153, 50, 204, 0.15)',
    description: 'Chaotic energy, unpredictable and powerful',
    cssGradient: 'linear-gradient(135deg, #9932CC 0%, #DA70D6 50%, #FFD700 100%)',
  },
  8: {
    id: 8,
    name: 'Void',
    element: '🌑',
    primaryColor: '#1a1a2e',      // Very dark blue-black
    secondaryColor: '#16213e',    // Slightly lighter dark
    territoryColor: 'rgba(26, 26, 46, 0.20)',
    description: 'Consuming emptiness, absorbing all',
    cssGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
  },
};

// Legacy PLAYER_COLORS for backwards compatibility - now derived from REGIONS
export const PLAYER_COLORS: Record<number, string> = Object.fromEntries(
  Object.entries(REGIONS).map(([id, region]) => [id, region.primaryColor])
);

// Add extra slots for 9-10 if needed later
PLAYER_COLORS[9] = '#F472B6';  // Pink
PLAYER_COLORS[10] = '#A3E635'; // Lime

export const TERRITORY_COLORS: Record<number, string> = Object.fromEntries(
  Object.entries(REGIONS).map(([id, region]) => [id, region.territoryColor])
);

// Add extra slots for 9-10 if needed later
TERRITORY_COLORS[9] = 'rgba(244, 114, 182, 0.15)';
TERRITORY_COLORS[10] = 'rgba(163, 230, 53, 0.15)';

/** Get region info by player number, with fallback */
export function getRegion(playerNum: number): RegionInfo {
  return REGIONS[playerNum] || REGIONS[1];
}

// Note: CATEGORY_INFO and PATTERNS are now imported from './life/patterns'
// See src/pages/life/patterns/ for the organized pattern library
