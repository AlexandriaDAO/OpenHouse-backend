// Conway's Game of Life simulation for tutorial

import {
  TutorialCell,
  BaseState,
  TUTORIAL_GRID_SIZE,
  PLAYER_ID,
  ENEMY_ID,
} from './types';
import { BASE_SIZE } from '../../lifeConstants';

// Check if position is inside a base's 8x8 protection zone
const isInBaseZone = (x: number, y: number, base: BaseState): boolean => {
  const relX = x - base.x;
  const relY = y - base.y;
  return relX >= 0 && relX < BASE_SIZE && relY >= 0 && relY < BASE_SIZE;
};

// Find which base owns this protection zone (if any)
const findProtectionZoneOwner = (x: number, y: number, bases: BaseState[]): BaseState | null => {
  for (const base of bases) {
    if (isInBaseZone(x, y, base)) {
      return base;
    }
  }
  return null;
};

// Step Conway's Game of Life with multi-player support and SIEGE MECHANIC
export const stepGenerationMultiplayer = (
  cells: TutorialCell[][],
  bases: BaseState[],
  onEnemyTerritoryTouched?: (enemyOwner: number, x: number, y: number) => void
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
      let wouldBeAlive = false;
      let newOwner = 0;

      if (current.alive) {
        wouldBeAlive = neighbors === 2 || neighbors === 3;
        newOwner = current.owner;
      } else if (neighbors === 3) {
        wouldBeAlive = true;
        // Majority owner among parents
        newOwner = ownerCounts[PLAYER_ID] >= ownerCounts[ENEMY_ID] ? PLAYER_ID : ENEMY_ID;
      }

      // SIEGE MECHANIC: Check if birth/survival is blocked by enemy base protection zone
      if (wouldBeAlive) {
        const protectionBase = findProtectionZoneOwner(x, y, bases);

        if (protectionBase && protectionBase.owner !== newOwner) {
          // Birth/survival blocked by enemy base! (Siege)
          // Drain coins from enemy base
          if (onEnemyTerritoryTouched) {
            onEnemyTerritoryTouched(protectionBase.owner, x, y);
          }
          // Cell is NOT created - siege prevents birth
          wouldBeAlive = false;
        }
      }

      if (wouldBeAlive) {
        next[y][x].alive = true;
        next[y][x].owner = newOwner;

        // Claim territory
        const previousTerritory = cells[y][x].territory;
        if (previousTerritory !== 0 && previousTerritory !== newOwner && onEnemyTerritoryTouched) {
          // Touching enemy territory (but NOT in protection zone - that's handled above)
          onEnemyTerritoryTouched(previousTerritory, x, y);
        }
        next[y][x].territory = newOwner;
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

// Check territory connectivity using BFS flood fill from base
// Returns the set of coordinates that are disconnected (should be lost)
export const checkTerritoryConnectivity = (
  cells: TutorialCell[][],
  baseX: number,
  baseY: number,
  playerId: number
): { x: number; y: number }[] => {
  const height = cells.length;
  const width = cells[0]?.length || 0;
  const visited = new Set<string>();
  const connected = new Set<string>();

  // BFS from all interior cells of the base
  const queue: [number, number][] = [];

  // Start from base interior
  for (let dy = 1; dy < 7; dy++) {
    for (let dx = 1; dx < 7; dx++) {
      const x = baseX + dx;
      const y = baseY + dy;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        queue.push([x, y]);
        const key = `${x},${y}`;
        visited.add(key);
        connected.add(key);
      }
    }
  }

  // BFS through connected territory (4-directional connectivity)
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;

    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (visited.has(key)) continue;

      visited.add(key);

      // Can only traverse through player's territory (not through enemy cells)
      const cell = cells[ny][nx];
      if (cell.territory === playerId && !cell.alive) {
        // Empty territory cell - can traverse
        connected.add(key);
        queue.push([nx, ny]);
      } else if (cell.territory === playerId && cell.alive && cell.owner === playerId) {
        // Player's own live cell - can traverse
        connected.add(key);
        queue.push([nx, ny]);
      }
      // Enemy cells or enemy-owned living cells block connectivity
    }
  }

  // Find all player territory that is NOT connected
  const disconnected: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].territory === playerId) {
        const key = `${x},${y}`;
        if (!connected.has(key)) {
          disconnected.push({ x, y });
        }
      }
    }
  }

  return disconnected;
};

// Apply territory cutoff - removes disconnected territory
export const applyTerritoryCutoff = (
  cells: TutorialCell[][],
  disconnected: { x: number; y: number }[]
): TutorialCell[][] => {
  const next = cells.map(row => row.map(cell => ({ ...cell })));

  for (const { x, y } of disconnected) {
    next[y][x].territory = 0; // Reset to neutral
    // Optionally kill cells in disconnected territory
    if (next[y][x].alive && next[y][x].owner === PLAYER_ID) {
      next[y][x].alive = false;
      next[y][x].owner = 0;
    }
  }

  return next;
};
