import { GRID_WIDTH, GRID_HEIGHT } from './lifeConstants';

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
