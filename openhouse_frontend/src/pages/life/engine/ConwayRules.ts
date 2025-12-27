/**
 * Conway's Game of Life Rules
 *
 * Pure functions for GOL simulation with siege mechanics.
 * No React dependencies - fully testable.
 */

import type { Cell, BaseInfo } from './types';
import { isInBaseZone } from '../../lifeConstants';

/**
 * Find which player's base protection zone contains this cell (if any).
 *
 * @param x - Cell X coordinate
 * @param y - Cell Y coordinate
 * @param bases - Map of player number to base info
 * @returns Player number who owns the protection zone, or null
 */
export function findProtectionZoneOwner(
  x: number,
  y: number,
  bases: Map<number, BaseInfo>
): number | null {
  for (const [playerNum, base] of bases) {
    if (isInBaseZone(x, y, base.x, base.y)) {
      return playerNum;
    }
  }
  return null;
}

/**
 * Run one generation of Conway's Game of Life with siege mechanics.
 *
 * Rules:
 * - Living cell survives with 2-3 neighbors
 * - Dead cell born with exactly 3 neighbors
 * - New cell owner = majority owner among 3 parents
 * - Births blocked in enemy base protection zones (siege)
 * - Territory (owner) persists even when cells die
 *
 * @param cells - Current dense grid (gridSize x gridSize)
 * @param bases - Map of player bases for siege checking
 * @param gridSize - Grid dimension (default 512)
 * @returns New cell array after one generation
 */
export function stepGeneration(
  cells: Cell[],
  bases: Map<number, BaseInfo>,
  gridSize: number = 512
): Cell[] {
  if (cells.length === 0) return cells;

  const newCells: Cell[] = new Array(gridSize * gridSize);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col;
      const current = cells[idx];

      // Count neighbors and track owner counts
      let neighborCount = 0;
      const ownerCounts: number[] = new Array(11).fill(0); // 0-10 players

      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (di === 0 && dj === 0) continue;

          // Toroidal wrap
          const nRow = (row + di + gridSize) % gridSize;
          const nCol = (col + dj + gridSize) % gridSize;
          const neighbor = cells[nRow * gridSize + nCol];

          if (neighbor.alive) {
            neighborCount++;
            if (neighbor.owner > 0 && neighbor.owner <= 10) {
              ownerCounts[neighbor.owner]++;
            }
          }
        }
      }

      // Apply Conway's rules
      let newAlive = false;
      let newOwner = current.owner;

      if (current.alive) {
        // Living cell survives with 2-3 neighbors
        newAlive = neighborCount === 2 || neighborCount === 3;
      } else {
        // Dead cell born with exactly 3 neighbors
        if (neighborCount === 3) {
          newAlive = true;

          // New owner = majority owner among parents
          let maxCount = 0;
          let majorityOwner = 1;
          for (let o = 1; o <= 10; o++) {
            if (ownerCounts[o] > maxCount) {
              maxCount = ownerCounts[o];
              majorityOwner = o;
            }
          }
          newOwner = majorityOwner;

          // SIEGE MECHANIC: Births blocked in enemy base protection zones
          const protectionOwner = findProtectionZoneOwner(col, row, bases);
          if (protectionOwner !== null && protectionOwner !== newOwner) {
            // Birth blocked - enemy base's protection zone prevents birth
            newAlive = false;
            newOwner = current.owner; // Preserve existing owner/territory
          }
        }
      }

      // Preserve owner (territory) - persists even when cells die
      newCells[idx] = {
        owner: newOwner,
        alive: newAlive,
      };
    }
  }

  return newCells;
}

/**
 * Count alive cells in a grid.
 */
export function countAlive(cells: Cell[]): number {
  let count = 0;
  for (const cell of cells) {
    if (cell.alive) count++;
  }
  return count;
}

/**
 * Count cells by owner.
 */
export function countByOwner(cells: Cell[]): Map<number, { alive: number; territory: number }> {
  const counts = new Map<number, { alive: number; territory: number }>();

  for (const cell of cells) {
    if (cell.owner > 0) {
      const existing = counts.get(cell.owner) || { alive: 0, territory: 0 };
      existing.territory++;
      if (cell.alive) existing.alive++;
      counts.set(cell.owner, existing);
    }
  }

  return counts;
}
