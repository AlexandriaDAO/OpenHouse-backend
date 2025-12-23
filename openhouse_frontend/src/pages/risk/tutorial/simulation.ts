// Conway's Game of Life simulation for tutorial

import {
  TutorialCell,
  BaseState,
  TUTORIAL_GRID_SIZE,
  PLAYER_ID,
  ENEMY_ID,
  isWall,
  isInAnyBaseZone,
} from './types';

// Step Conway's Game of Life with multi-player support
export const stepGenerationMultiplayer = (
  cells: TutorialCell[][],
  bases: BaseState[],
  onEnemyTerritoryTouched?: (enemyOwner: number) => void
): TutorialCell[][] => {
  const height = cells.length;
  const width = cells[0]?.length || 0;
  const next: TutorialCell[][] = Array(height).fill(null).map((_, y) =>
    Array(width).fill(null).map((_, x) => ({
      alive: false,
      owner: 0,
      territory: cells[y][x].territory  // Preserve existing territory
    }))
  );

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Skip base walls - they block everything
      const inBase = isInAnyBaseZone(x, y, bases);
      if (inBase && isWall(x, y, inBase.x, inBase.y)) {
        next[y][x].territory = inBase.owner;
        continue;
      }

      let neighbors = 0;
      const ownerCounts: number[] = [0, 0, 0]; // neutral, player, enemy

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = (y + dy + height) % height;
          const nx = (x + dx + width) % width;
          if (cells[ny][nx].alive) {
            neighbors++;
            const owner = cells[ny][nx].owner;
            if (owner >= 0 && owner <= 2) ownerCounts[owner]++;
          }
        }
      }

      const current = cells[y][x];

      if (current.alive) {
        next[y][x].alive = neighbors === 2 || neighbors === 3;
        next[y][x].owner = current.owner;
      } else if (neighbors === 3) {
        next[y][x].alive = true;
        // Majority owner among parents
        next[y][x].owner = ownerCounts[PLAYER_ID] >= ownerCounts[ENEMY_ID] ? PLAYER_ID : ENEMY_ID;
      }

      // If cell becomes alive, claim territory
      if (next[y][x].alive) {
        const cellOwner = next[y][x].owner;
        const previousTerritory = cells[y][x].territory;

        // Check if this is enemy territory being touched
        if (previousTerritory !== 0 && previousTerritory !== cellOwner && onEnemyTerritoryTouched) {
          onEnemyTerritoryTouched(previousTerritory);
        }

        next[y][x].territory = cellOwner;
      }
    }
  }

  return next;
};

// Step for single player (simpler version)
export const stepGenerationSinglePlayer = (cells: TutorialCell[][]): TutorialCell[][] => {
  const height = cells.length;
  const width = cells[0]?.length || 0;
  const next: TutorialCell[][] = Array(height).fill(null).map((_, y) =>
    Array(width).fill(null).map((_, x) => ({
      alive: false,
      owner: 0,
      territory: cells[y][x].territory
    }))
  );

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = (y + dy + height) % height;
          const nx = (x + dx + width) % width;
          if (cells[ny][nx].alive) neighbors++;
        }
      }

      if (cells[y][x].alive) {
        next[y][x].alive = neighbors === 2 || neighbors === 3;
        next[y][x].owner = PLAYER_ID;
      } else if (neighbors === 3) {
        next[y][x].alive = true;
        next[y][x].owner = PLAYER_ID;
      }

      if (next[y][x].alive) {
        next[y][x].territory = PLAYER_ID;
      }
    }
  }

  return next;
};

// Simulate a wiper effect - kills all cells in a region
export const applyWiper = (
  cells: TutorialCell[][],
  startX: number,
  startY: number,
  width: number,
  height: number
): TutorialCell[][] => {
  const next = cells.map(row => row.map(cell => ({ ...cell })));

  for (let y = startY; y < startY + height && y < TUTORIAL_GRID_SIZE; y++) {
    for (let x = startX; x < startX + width && x < TUTORIAL_GRID_SIZE; x++) {
      if (y >= 0 && x >= 0) {
        next[y][x].alive = false;
        // Territory remains but cells are killed
      }
    }
  }

  return next;
};
