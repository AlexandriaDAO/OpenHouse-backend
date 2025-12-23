import { GRID_WIDTH, GRID_HEIGHT, TOTAL_CELLS } from './lifeConstants';

/**
 * Parse RLE (Run Length Encoded) pattern format into coordinate array
 * RLE is a standard format for Conway's Game of Life patterns
 */
export function parseRLE(rle: string): [number, number][] {
  const coords: [number, number][] = [];
  const lines = rle.split('\n');
  let patternData = '';
  let width = 0;
  let height = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('x')) {
      const match = trimmed.match(/x\s*=\s*(\d+).*y\s*=\s*(\d+)/);
      if (match) {
        width = parseInt(match[1]);
        height = parseInt(match[2]);
      }
      continue;
    }
    patternData += trimmed;
  }

  let x = 0, y = 0, countStr = '';
  for (const char of patternData) {
    if (char >= '0' && char <= '9') {
      countStr += char;
    } else if (char === 'b') {
      x += countStr ? parseInt(countStr) : 1;
      countStr = '';
    } else if (char === 'o') {
      const count = countStr ? parseInt(countStr) : 1;
      for (let i = 0; i < count; i++) coords.push([x + i, y]);
      x += count;
      countStr = '';
    } else if (char === '$') {
      y += countStr ? parseInt(countStr) : 1;
      x = 0;
      countStr = '';
    } else if (char === '!') break;
  }

  // Center the pattern
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  return coords.map(([cx, cy]) => [cx - centerX, cy - centerY]);
}

/**
 * Rotate pattern coordinates clockwise
 * @param coords - Original pattern coordinates
 * @param rot - Rotation: 0=0°, 1=90°, 2=180°, 3=270° clockwise
 */
export function rotatePattern(coords: [number, number][], rot: number): [number, number][] {
  if (rot === 0) return coords;
  return coords.map(([x, y]) => {
    switch (rot) {
      case 1: return [y, -x];      // 90° clockwise
      case 2: return [-x, -y];     // 180°
      case 3: return [-y, x];      // 270° clockwise
      default: return [x, y];
    }
  });
}

// =============================================================================
// SYNC VERIFICATION UTILITIES (Part 1 of timer optimization)
// =============================================================================

// Minimal interface for hash functions
interface CellLike {
  alive: boolean;
}

/**
 * Hash cell state for sync verification.
 * Returns "aliveCount:xorOfPositions" as a simple fingerprint.
 *
 * The XOR of positions is order-independent and catches single-cell
 * differences. Combined with alive count, it's a good quick check.
 */
export function hashCellState(cells: CellLike[]): string {
  let alive = 0;
  let xor = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]?.alive) {
      alive++;
      xor ^= i;
    }
  }
  return `${alive}:${xor}`;
}

/**
 * Hash backend bitmap state for sync verification.
 * Converts bitmap to same format as hashCellState for comparison.
 *
 * @param bitmap - Array of bigint, each representing 64 cells
 */
export function hashBitmapState(bitmap: bigint[]): string {
  let alive = 0;
  let xor = 0;
  for (let wordIdx = 0; wordIdx < bitmap.length; wordIdx++) {
    let word = bitmap[wordIdx];
    for (let bit = 0; bit < 64; bit++) {
      if ((word >> BigInt(bit)) & 1n) {
        const idx = wordIdx * 64 + bit;
        if (idx < TOTAL_CELLS) {
          alive++;
          xor ^= idx;
        }
      }
    }
  }
  return `${alive}:${xor}`;
}

/**
 * Find specific differences between local cell state and backend bitmap.
 * Use this to debug when hashes don't match.
 *
 * @returns Array of cell indices where local and backend states differ
 */
export function findCellDifferences(
  localCells: CellLike[],
  bitmap: bigint[]
): Array<{ idx: number; local: boolean; backend: boolean; coords: { x: number; y: number } }> {
  const diffs: Array<{ idx: number; local: boolean; backend: boolean; coords: { x: number; y: number } }> = [];

  for (let wordIdx = 0; wordIdx < bitmap.length; wordIdx++) {
    const word = bitmap[wordIdx];
    for (let bit = 0; bit < 64; bit++) {
      const idx = wordIdx * 64 + bit;
      if (idx >= localCells.length) break;

      const backendAlive = Boolean((word >> BigInt(bit)) & 1n);
      const localAlive = localCells[idx]?.alive ?? false;

      if (backendAlive !== localAlive) {
        diffs.push({
          idx,
          local: localAlive,
          backend: backendAlive,
          coords: { x: idx % 512, y: Math.floor(idx / 512) }
        });
      }
    }
  }

  return diffs;
}
