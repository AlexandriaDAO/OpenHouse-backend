// Tutorial types and constants

import { PLAYER_COLORS, BASE_SIZE } from '../../lifeConstants';

// Grid size for tutorial demonstrations
export const TUTORIAL_GRID_SIZE = 24;

// Player IDs
export const PLAYER_ID = 1;
export const ENEMY_ID = 2;

// Colors
export const PLAYER_COLOR = PLAYER_COLORS[1];  // Green
export const ENEMY_COLOR = PLAYER_COLORS[2];   // Red
export const PLAYER_TERRITORY_COLOR = 'rgba(57, 255, 20, 0.15)';
export const ENEMY_TERRITORY_COLOR = 'rgba(255, 57, 57, 0.15)';

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

// Check if position is base wall
export const isWall = (x: number, y: number, baseX: number, baseY: number): boolean => {
  const relX = x - baseX;
  const relY = y - baseY;
  if (relX < 0 || relX >= BASE_SIZE || relY < 0 || relY >= BASE_SIZE) return false;
  return relX === 0 || relX === BASE_SIZE - 1 || relY === 0 || relY === BASE_SIZE - 1;
};

// Check if position is inside base interior
export const isInterior = (x: number, y: number, baseX: number, baseY: number): boolean => {
  const relX = x - baseX;
  const relY = y - baseY;
  return relX >= 1 && relX < BASE_SIZE - 1 && relY >= 1 && relY < BASE_SIZE - 1;
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
