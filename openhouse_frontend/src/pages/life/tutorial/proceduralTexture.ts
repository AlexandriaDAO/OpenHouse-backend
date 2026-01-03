// Procedural texture generation for territory cells
// Creates animated, randomized visual elements based on elemental themes
// Uses REGIONS from lifeConstants to match main game faction colors
//
// PERFORMANCE: Hash values are cached since they're deterministic per cell position.
// This eliminates redundant calculations on every frame.

import { REGIONS, getRegion } from '../../lifeConstants';

// Simple hash function for deterministic randomness per cell
function hashCell(x: number, y: number, seed: number = 0): number {
  let h = seed;
  h = Math.imul(h ^ x, 0x9e3779b9);
  h = Math.imul(h ^ y, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return (h >>> 0) / 0xffffffff; // Normalize to 0-1
}

// Cache for precomputed hash values (key: "x,y,count" -> hash array)
const hashCache = new Map<string, number[]>();
const MAX_CACHE_SIZE = 2000; // Limit memory usage

// Generate multiple hash values from one cell position (with caching)
function hashCellMulti(x: number, y: number, count: number): number[] {
  const key = `${x},${y},${count}`;

  const cached = hashCache.get(key);
  if (cached) return cached;

  const values: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    values[i] = hashCell(x, y, i * 12345);
  }

  // Simple cache eviction: clear when too large
  if (hashCache.size >= MAX_CACHE_SIZE) {
    hashCache.clear();
  }
  hashCache.set(key, values);

  return values;
}

// Element configurations for different territory types
export interface ElementConfig {
  primaryColor: string;
  secondaryColor: string;
  circleCount: number;       // Number of circles per cell
  minRadius: number;         // Min circle radius (fraction of cell size)
  maxRadius: number;         // Max circle radius (fraction of cell size)
  animationSpeed: number;    // How fast elements move (0-1)
  pulseAmount: number;       // How much circles grow/shrink (0-1)
}

// Helper to convert hex color to rgba with alpha
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(100, 100, 100, ${alpha})`;
}

// Create element config from a region ID - derives colors from REGIONS
export function getElementConfigForRegion(regionId: number): ElementConfig {
  const region = getRegion(regionId);
  return {
    primaryColor: hexToRgba(region.primaryColor, 0.25),
    secondaryColor: hexToRgba(region.secondaryColor || region.primaryColor, 0.2),
    circleCount: 4,
    minRadius: 0.15,
    maxRadius: 0.35,
    animationSpeed: 0.3 + (regionId % 3) * 0.05,  // Slight variation by region
    pulseAmount: 0.15 + (regionId % 2) * 0.05,
  };
}

// Default configs derived from REGIONS for backwards compatibility
// Player = Region 1 (Earth), Enemy = Region 2 (Water) - matches PLAYER_ID/ENEMY_ID in types.ts
export const PLAYER_ELEMENT: ElementConfig = getElementConfigForRegion(1);
export const ENEMY_ELEMENT: ElementConfig = getElementConfigForRegion(2);

// Parse a color string and return rgba components
function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  // Handle rgba format
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  // Fallback
  return { r: 100, g: 100, b: 100, a: 0.2 };
}

// Interpolate between two colors
function lerpColor(color1: string, color2: string, t: number): string {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  const a = c1.a + (c2.a - c1.a) * t;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Draw a single cell's procedural texture
export function drawProceduralCell(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  pixelX: number,
  pixelY: number,
  cellSize: number,
  config: ElementConfig,
  time: number
): void {
  const hashes = hashCellMulti(cellX, cellY, config.circleCount * 5);

  // Draw each circle
  for (let i = 0; i < config.circleCount; i++) {
    const baseIdx = i * 5;

    // Base position (0-1 within cell)
    const basePosX = hashes[baseIdx];
    const basePosY = hashes[baseIdx + 1];

    // Animation offset based on time
    const animPhase = hashes[baseIdx + 2] * Math.PI * 2;
    const animSpeed = config.animationSpeed * (0.5 + hashes[baseIdx + 3] * 0.5);

    // Animated position
    const offsetX = Math.sin(time * animSpeed + animPhase) * 0.1;
    const offsetY = Math.cos(time * animSpeed * 1.3 + animPhase) * 0.1;

    const posX = ((basePosX + offsetX) % 1 + 1) % 1; // Keep in 0-1 range
    const posY = ((basePosY + offsetY) % 1 + 1) % 1;

    // Animated radius
    const baseRadius = config.minRadius + hashes[baseIdx + 4] * (config.maxRadius - config.minRadius);
    const pulsePhase = hashes[baseIdx] * Math.PI * 2;
    const pulse = Math.sin(time * 0.5 + pulsePhase) * config.pulseAmount;
    const radius = baseRadius * (1 + pulse);

    // Color - alternate between primary and secondary based on hash
    const useSecondary = hashes[baseIdx + 2] > 0.6;
    const colorT = hashes[baseIdx + 3];
    const color = useSecondary
      ? lerpColor(config.secondaryColor, config.primaryColor, colorT * 0.3)
      : lerpColor(config.primaryColor, config.secondaryColor, colorT * 0.3);

    // Draw the circle
    const centerX = pixelX + posX * cellSize;
    const centerY = pixelY + posY * cellSize;
    const radiusPixels = radius * cellSize;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusPixels, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

// Draw territory with procedural textures (batch version for performance)
export function drawProceduralTerritory(
  ctx: CanvasRenderingContext2D,
  cells: { territory: number }[][],
  cellSize: number,
  time: number,
  playerConfig: ElementConfig = PLAYER_ELEMENT,
  enemyConfig: ElementConfig = ENEMY_ELEMENT,
  playerId: number = 1,
  enemyId: number = 2,
  skipCells?: Set<string> // Optional set of "x,y" strings to skip (e.g., for fading effect)
): void {
  const height = cells.length;
  const width = cells[0]?.length || 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const territory = cells[y][x].territory;
      if (territory === 0) continue;

      // Skip if in the skip set
      if (skipCells?.has(`${x},${y}`)) continue;

      const config = territory === playerId ? playerConfig : enemyConfig;
      const pixelX = x * cellSize;
      const pixelY = y * cellSize;

      // Draw background using region colors
      const baseAlpha = 0.08;
      const region = getRegion(territory);
      ctx.fillStyle = hexToRgba(region.primaryColor, baseAlpha);
      ctx.fillRect(pixelX, pixelY, cellSize, cellSize);

      // Draw procedural elements
      drawProceduralCell(ctx, x, y, pixelX, pixelY, cellSize, config, time);
    }
  }
}

// Cache for single hash values used in drawVariedTerritory
const singleHashCache = new Map<string, number>();

// Get cached single hash value
function getCachedHash(x: number, y: number): number {
  const key = `${x},${y}`;
  const cached = singleHashCache.get(key);
  if (cached !== undefined) return cached;

  const hash = hashCell(x, y, 0);
  if (singleHashCache.size >= MAX_CACHE_SIZE) {
    singleHashCache.clear();
  }
  singleHashCache.set(key, hash);
  return hash;
}

// Simpler version: just draw variation without full procedural circles
// Uses color modulation for a more subtle effect
// Now uses REGIONS colors for consistency with main game
export function drawVariedTerritory(
  ctx: CanvasRenderingContext2D,
  cells: { territory: number }[][],
  cellSize: number,
  time: number,
  playerId: number = 1,
  enemyId: number = 2,
  skipCells?: Set<string>
): void {
  const height = cells.length;
  const width = cells[0]?.length || 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const territory = cells[y][x].territory;
      if (territory === 0) continue;
      if (skipCells?.has(`${x},${y}`)) continue;

      // Get deterministic variation for this cell (cached)
      const hash = getCachedHash(x, y);

      // Time-based variation
      const timeFactor = Math.sin(time * 0.3 + hash * Math.PI * 2) * 0.5 + 0.5;

      // Base alpha varies per cell
      const baseAlpha = 0.1 + hash * 0.08;
      const animatedAlpha = baseAlpha + timeFactor * 0.04;

      // Get region colors from REGIONS (matches main game)
      const region = getRegion(territory);
      ctx.fillStyle = hexToRgba(region.primaryColor, animatedAlpha);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}
