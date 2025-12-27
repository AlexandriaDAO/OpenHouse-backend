import type { ElementRenderer } from '../types';
import { seededRandom } from '../seededRandom';
import { add3DEdges, hexToRgb, lighten, darken, rgbToCss } from '../colorUtils';

/**
 * EARTH ELEMENT
 *
 * Visual style: Organic, soil-like - Minecraft dirt block inspired
 * Territory: Grid of dirt blocks with grass patches
 * Cells: Mossy block with organic spots
 */
export const earthRenderer: ElementRenderer = {
  name: 'Earth',

  renderTerritoryTile(ctx, size, colors) {
    const base = hexToRgb(colors.primary);
    const green = hexToRgb(colors.secondary);

    // Render as grid of Minecraft-style blocks
    const blockSize = 16;
    const gridCount = Math.floor(size / blockSize);

    for (let row = 0; row < gridCount; row++) {
      for (let col = 0; col < gridCount; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        const seed = row * gridCount + col + 100;
        const rng = seededRandom(seed);

        // Base dirt fill
        ctx.fillStyle = colors.primary;
        ctx.fillRect(x, y, blockSize, blockSize);

        // Soil variation - darker blotches
        const blotchCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < blotchCount; i++) {
          const bx = x + rng() * blockSize;
          const by = y + rng() * blockSize;
          const br = blockSize * (0.15 + rng() * 0.2);
          ctx.fillStyle = rgbToCss(darken(base, 0.1 + rng() * 0.15));
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }

        // Green grass patches (mostly on top half of block)
        const grassCount = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < grassCount; i++) {
          const gx = x + rng() * blockSize;
          const gy = y + rng() * blockSize * 0.5;
          const gr = blockSize * (0.12 + rng() * 0.15);
          ctx.fillStyle = rgbToCss(green, 0.5 + rng() * 0.3);
          ctx.beginPath();
          ctx.arc(gx, gy, gr, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3D shading - highlight top and left edges
        const lightColor = rgbToCss(lighten(base, 0.3));
        const darkColor = rgbToCss(darken(base, 0.4));
        const edgeWidth = 2;

        // Top highlight
        ctx.fillStyle = lightColor;
        ctx.fillRect(x, y, blockSize, edgeWidth);
        // Left highlight
        ctx.fillRect(x, y, edgeWidth, blockSize);
        // Bottom shadow
        ctx.fillStyle = darkColor;
        ctx.fillRect(x, y + blockSize - edgeWidth, blockSize, edgeWidth);
        // Right shadow
        ctx.fillRect(x + blockSize - edgeWidth, y, edgeWidth, blockSize);
      }
    }
  },

  renderCellSprite(ctx, size, colors) {
    const rng = seededRandom(42);

    // Base fill
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, size, size);

    // Organic spots
    const numSpots = Math.max(2, Math.floor(size / 6));
    for (let i = 0; i < numSpots; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = size * (0.1 + rng() * 0.15);

      ctx.fillStyle = colors.secondary;
      ctx.globalAlpha = 0.3 + rng() * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    add3DEdges(ctx, size, colors.primary);
  },

  animation: {
    territorySpeed: 0.8,
    territoryAmplitude: 1.5,
  },
};
