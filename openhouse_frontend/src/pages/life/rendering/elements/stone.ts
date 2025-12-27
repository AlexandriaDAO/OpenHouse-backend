import type { ElementRenderer } from '../types';
import { seededRandom } from '../seededRandom';
import { add3DEdges, hexToRgb, lighten, darken, rgbToCss } from '../colorUtils';

/**
 * STONE ELEMENT
 *
 * Visual style: Solid, cracked - Minecraft cobblestone inspired
 * Territory: Grid of stone blocks with cracks and texture
 * Cells: Rough hewn block
 */
export const stoneRenderer: ElementRenderer = {
  name: 'Stone',

  renderTerritoryTile(ctx, size, colors) {
    const base = hexToRgb(colors.primary);

    // Render as grid of Minecraft-style stone blocks
    const blockSize = 16;
    const gridCount = Math.floor(size / blockSize);

    for (let row = 0; row < gridCount; row++) {
      for (let col = 0; col < gridCount; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        const seed = row * gridCount + col + 400;
        const rng = seededRandom(seed);

        // Base stone fill
        ctx.fillStyle = colors.primary;
        ctx.fillRect(x, y, blockSize, blockSize);

        // Rocky texture patches
        const patchCount = 3 + Math.floor(rng() * 2);
        for (let i = 0; i < patchCount; i++) {
          const px = x + rng() * blockSize;
          const py = y + rng() * blockSize;
          const ps = blockSize * (0.15 + rng() * 0.2);
          const isLighter = rng() > 0.5;

          ctx.fillStyle = isLighter
            ? rgbToCss(lighten(base, 0.1 + rng() * 0.1))
            : rgbToCss(darken(base, 0.1 + rng() * 0.1));

          // Irregular polygon
          ctx.beginPath();
          ctx.moveTo(px, py - ps * 0.5);
          ctx.lineTo(px + ps * 0.4, py - ps * 0.2);
          ctx.lineTo(px + ps * 0.3, py + ps * 0.4);
          ctx.lineTo(px - ps * 0.3, py + ps * 0.3);
          ctx.lineTo(px - ps * 0.4, py - ps * 0.1);
          ctx.closePath();
          ctx.fill();
        }

        // Crack lines
        if (rng() > 0.3) {
          ctx.strokeStyle = rgbToCss(darken(base, 0.35));
          ctx.lineWidth = 1;
          ctx.beginPath();
          let cx = x + rng() * blockSize;
          let cy = y + rng() * blockSize;
          ctx.moveTo(cx, cy);
          const segments = 2 + Math.floor(rng() * 2);
          for (let j = 0; j < segments; j++) {
            cx += (rng() - 0.5) * 6;
            cy += (rng() - 0.5) * 6;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }

        // 3D shading - strong for solid rock
        const lightColor = rgbToCss(lighten(base, 0.25));
        const darkColor = rgbToCss(darken(base, 0.4));
        const edgeWidth = 2;

        ctx.fillStyle = lightColor;
        ctx.fillRect(x, y, blockSize, edgeWidth);
        ctx.fillRect(x, y, edgeWidth, blockSize);
        ctx.fillStyle = darkColor;
        ctx.fillRect(x, y + blockSize - edgeWidth, blockSize, edgeWidth);
        ctx.fillRect(x + blockSize - edgeWidth, y, edgeWidth, blockSize);
      }
    }
  },

  renderCellSprite(ctx, size, colors) {
    const rng = seededRandom(45);

    // Base fill
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, size, size);

    // Stone texture (small rectangles)
    const numRects = Math.max(2, Math.floor(size / 4));
    for (let i = 0; i < numRects; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const w = 2 + rng() * (size * 0.3);
      const h = 2 + rng() * (size * 0.2);

      ctx.fillStyle = colors.secondary;
      ctx.globalAlpha = 0.2 + rng() * 0.2;
      ctx.fillRect(x, y, w, h);
    }

    // Crack lines
    ctx.strokeStyle = colors.secondary;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    if (size >= 12) {
      const numCracks = Math.floor(rng() * 3);
      for (let i = 0; i < numCracks; i++) {
        const startX = rng() * size;
        const startY = rng() * size;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + (rng() - 0.5) * 8, startY + (rng() - 0.5) * 8);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    add3DEdges(ctx, size, colors.primary);
  },

  animation: {
    territorySpeed: 0.4,
    territoryAmplitude: 1,
  },
};
