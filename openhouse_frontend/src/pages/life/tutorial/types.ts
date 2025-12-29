// Tutorial types and constants
// Uses same colors as main game from REGIONS/PLAYER_COLORS

import { PLAYER_COLORS, TERRITORY_COLORS, BASE_SIZE, REGIONS } from '../../lifeConstants';

// Grid size for tutorial demonstrations
export const TUTORIAL_GRID_SIZE = 24;

// Player IDs - must match region IDs for color consistency
export const PLAYER_ID = 1;  // Earth faction
export const ENEMY_ID = 2;   // Water faction

// Cell colors - derived from REGIONS via PLAYER_COLORS
export const PLAYER_COLOR = PLAYER_COLORS[PLAYER_ID];  // Earth brown (#8B4513)
export const ENEMY_COLOR = PLAYER_COLORS[ENEMY_ID];    // Water blue (#00BFFF)

// Territory colors - derived from REGIONS via TERRITORY_COLORS
export const PLAYER_TERRITORY_COLOR = TERRITORY_COLORS[PLAYER_ID];
export const ENEMY_TERRITORY_COLOR = TERRITORY_COLORS[ENEMY_ID];

// Cell state with alive status and owner
export interface TutorialCell {
  alive: boolean;
  owner: number;      // 0 = neutral, 1 = player, 2 = enemy
  territory: number;  // 0 = neutral, 1 = player, 2 = enemy
}

// Base state
export interface BaseState {
  x: number;
  y: number;
  owner: number;
  coins: number;
}

// Slide definition
export interface SlideDefinition {
  id: string;
  title: string;
  description: string;
  // Future: each slide can have its own component for custom rendering
  implemented: boolean;
}

// Glider patterns - each moves diagonally in the named direction
export const GLIDER_DOWN_RIGHT: [number, number][] = [
  [1, 0], [2, 1], [0, 2], [1, 2], [2, 2]
];

export const GLIDER_UP_LEFT: [number, number][] = [
  [1, 2], [0, 1], [2, 0], [1, 0], [0, 0]
];

// UP_RIGHT glider - moves diagonally up and to the right (for attacking from bottom-left to top-right)
export const GLIDER_UP_RIGHT: [number, number][] = [
  [0, 0], [1, 0], [2, 0], [2, 1], [1, 2]
];

// DOWN_LEFT glider - moves diagonally down and to the left
export const GLIDER_DOWN_LEFT: [number, number][] = [
  [0, 0], [1, 0], [2, 0], [0, 1], [1, 2]
];

// Block pattern (2x2 still life)
export const BLOCK_PATTERN: [number, number][] = [
  [0, 0], [1, 0], [0, 1], [1, 1]
];

// Create empty grid
export const createEmptyGrid = (): TutorialCell[][] =>
  Array(TUTORIAL_GRID_SIZE).fill(null).map(() =>
    Array(TUTORIAL_GRID_SIZE).fill(null).map(() => ({ alive: false, owner: 0, territory: 0 }))
  );

// Check if position is inside base (8x8 zone)
export const isInBase = (x: number, y: number, baseX: number, baseY: number): boolean => {
  const relX = x - baseX;
  const relY = y - baseY;
  return relX >= 0 && relX < BASE_SIZE && relY >= 0 && relY < BASE_SIZE;
};

// Check if position is in any base zone
export const isInAnyBaseZone = (x: number, y: number, bases: BaseState[]): BaseState | null => {
  for (const base of bases) {
    const relX = x - base.x;
    const relY = y - base.y;
    if (relX >= 0 && relX < BASE_SIZE && relY >= 0 && relY < BASE_SIZE) {
      return base;
    }
  }
  return null;
};
