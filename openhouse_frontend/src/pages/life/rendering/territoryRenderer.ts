import { getElementRenderer, getRegisteredElementIds } from './elementRegistry';
import { REGIONS } from '../../lifeConstants';

const TILE_SIZE = 128; // Pixels - larger = more variety before repeat

/** Cached territory patterns by region ID */
const territoryPatterns: Map<number, CanvasPattern> = new Map();

/** Animation offsets per region (for subtle drift) */
const animationOffsets: Map<number, { speedX: number; speedY: number; amplitude: number }> = new Map();

/** Whether patterns have been initialized */
let patternsInitialized = false;

/**
 * Generate a territory tile for a specific region
 */
function generateTerritoryTile(regionId: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d')!;

  const renderer = getElementRenderer(regionId);
  const region = REGIONS[regionId];

  if (renderer && region) {
    renderer.renderTerritoryTile(ctx, TILE_SIZE, {
      primary: region.primaryColor,
      secondary: region.secondaryColor || region.primaryColor,
    });

    // Store animation config
    const anim = renderer.animation || {};
    animationOffsets.set(regionId, {
      speedX: (anim.territorySpeed || 1.0) * 0.1,
      speedY: (anim.territorySpeed || 1.0) * 0.13,
      amplitude: anim.territoryAmplitude || 2,
    });
  }

  return canvas;
}

/**
 * Initialize all territory patterns - call once at startup
 * @param ctx - A canvas context to create patterns from
 */
export function initTerritoryPatterns(ctx: CanvasRenderingContext2D): void {
  if (patternsInitialized) return;

  const regionIds = getRegisteredElementIds();

  for (const regionId of regionIds) {
    const tile = generateTerritoryTile(regionId);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      territoryPatterns.set(regionId, pattern);
    }
  }

  patternsInitialized = true;
}

/**
 * Get the pattern for a region ID
 */
export function getTerritoryPattern(regionId: number): CanvasPattern | null {
  return territoryPatterns.get(regionId) ?? null;
}

/**
 * Check if patterns are initialized
 */
export function arePatternsInitialized(): boolean {
  return patternsInitialized;
}

// Timing stats for territory rendering
let territoryStats = {
  groupMs: 0,
  fillMs: 0,
  callCount: 0,
  lastLog: Date.now(),
  totalCells: 0,
};

/**
 * Render territory layer using pattern fills
 *
 * This is the main optimization: instead of 100k individual fillRect calls,
 * we batch all cells of the same owner into ONE fill() call.
 *
 * @param ctx - Canvas context
 * @param getCellOwner - Function to get owner at (x, y)
 * @param cellSize - Size of each cell in pixels
 * @param startX - Start X coordinate in grid
 * @param startY - Start Y coordinate in grid
 * @param width - Number of cells wide
 * @param height - Number of cells tall
 * @param time - Animation time (for pattern drift)
 */
export function renderTerritoryLayer(
  ctx: CanvasRenderingContext2D,
  getCellOwner: (x: number, y: number) => number,
  cellSize: number,
  startX: number,
  startY: number,
  width: number,
  height: number,
  time: number
): void {
  const t0 = performance.now();

  // Group cells by owner
  const cellsByOwner: Map<number, Array<[number, number]>> = new Map();

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const gridX = startX + col;
      const gridY = startY + row;
      const owner = getCellOwner(gridX, gridY);

      if (owner > 0) {
        if (!cellsByOwner.has(owner)) {
          cellsByOwner.set(owner, []);
        }
        cellsByOwner.get(owner)!.push([col, row]);
      }
    }
  }

  const tGroup = performance.now();
  territoryStats.groupMs += tGroup - t0;
  territoryStats.totalCells += width * height;

  // Render each owner's territory with ONE fill call
  for (const [owner, cells] of cellsByOwner) {
    const pattern = territoryPatterns.get(owner);
    if (!pattern) continue;

    // Animate via transform offset (essentially FREE)
    const animConfig = animationOffsets.get(owner) || { speedX: 0.1, speedY: 0.13, amplitude: 2 };
    const offsetX = Math.sin(time * animConfig.speedX) * animConfig.amplitude;
    const offsetY = Math.cos(time * animConfig.speedY) * animConfig.amplitude;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.fillStyle = pattern;

    // Build path for ALL cells of this owner
    ctx.beginPath();
    for (const [col, row] of cells) {
      ctx.rect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
    ctx.fill(); // ONE GPU CALL

    ctx.restore();
  }

  const tFill = performance.now();
  territoryStats.fillMs += tFill - tGroup;
  territoryStats.callCount++;

  // Log every 5 seconds
  const now = Date.now();
  if (now - territoryStats.lastLog > 5000) {
    console.log('[PERF] Territory Render:', {
      calls: territoryStats.callCount,
      avgGroupMs: (territoryStats.groupMs / territoryStats.callCount).toFixed(1),
      avgFillMs: (territoryStats.fillMs / territoryStats.callCount).toFixed(1),
      avgCells: Math.round(territoryStats.totalCells / territoryStats.callCount),
    });
    territoryStats = { groupMs: 0, fillMs: 0, callCount: 0, lastLog: now, totalCells: 0 };
  }
}

/**
 * Reset patterns (for hot reload or testing)
 */
export function resetTerritoryPatterns(): void {
  territoryPatterns.clear();
  animationOffsets.clear();
  patternsInitialized = false;
}
