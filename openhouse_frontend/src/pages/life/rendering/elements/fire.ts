import type { ElementRenderer } from '../types';
import { seededRandom } from '../seededRandom';
import { add3DEdges, hexToRgb, lighten, darken, rgbToCss } from '../colorUtils';

/**
 * FIRE ELEMENT
 *
 * Visual style: Aggressive, flickering - Minecraft lava/fire block inspired
 * Territory: Grid of fire blocks with flames and embers
 * Cells: Burning block with flame-like patterns
 */
export const fireRenderer: ElementRenderer = {
  name: 'Fire',

  renderTerritoryTile(ctx, size, colors) {
    const base = hexToRgb(colors.primary);
    const yellow = hexToRgb(colors.secondary);

    // Render as grid of Minecraft-style fire blocks
    const blockSize = 16;
    const gridCount = Math.floor(size / blockSize);

    for (let row = 0; row < gridCount; row++) {
      for (let col = 0; col < gridCount; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        const seed = row * gridCount + col + 300;
        const rng = seededRandom(seed);

        // Gradient base - yellow core to orange edges
        const gradient = ctx.createRadialGradient(
          x + blockSize / 2, y + blockSize * 0.6, 0,
          x + blockSize / 2, y + blockSize / 2, blockSize * 0.7
        );
        gradient.addColorStop(0, rgbToCss(yellow));
        gradient.addColorStop(0.5, rgbToCss(base));
        gradient.addColorStop(1, rgbToCss(darken(base, 0.2)));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, blockSize, blockSize);

        // Flame wisps rising up
        const wispCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < wispCount; i++) {
          const wx = x + blockSize * 0.2 + rng() * blockSize * 0.6;
          const wy = y + blockSize;
          const wh = blockSize * (0.3 + rng() * 0.4);
          const ww = blockSize * 0.15;

          ctx.fillStyle = rgbToCss(yellow, 0.7);
          ctx.beginPath();
          ctx.moveTo(wx - ww, wy);
          ctx.lineTo(wx, wy - wh);
          ctx.lineTo(wx + ww, wy);
          ctx.closePath();
          ctx.fill();
        }

        // Hot spots
        const hotspotCount = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < hotspotCount; i++) {
          const hx = x + rng() * blockSize;
          const hy = y + blockSize * 0.4 + rng() * blockSize * 0.4;
          ctx.fillStyle = `rgba(255, 255, 200, 0.6)`;
          ctx.beginPath();
          ctx.arc(hx, hy, blockSize * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3D shading (darker edges for fire - charred look)
        const lightColor = rgbToCss(yellow, 0.5);
        const darkColor = rgbToCss(darken(base, 0.5));
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
    const rng = seededRandom(44);

    // Base fill with upward gradient
    const gradient = ctx.createLinearGradient(0, size, 0, 0);
    gradient.addColorStop(0, colors.primary);
    gradient.addColorStop(0.7, colors.primary);
    gradient.addColorStop(1, colors.secondary);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Flame tips at top
    ctx.fillStyle = colors.secondary;
    ctx.globalAlpha = 0.6;
    const numFlames = Math.max(2, Math.floor(size / 4));
    for (let i = 0; i < numFlames; i++) {
      const x = (size / (numFlames + 1)) * (i + 1) + (rng() - 0.5) * 3;
      const height = size * (0.2 + rng() * 0.2);

      ctx.beginPath();
      ctx.moveTo(x - 2, 0);
      ctx.lineTo(x, -height * 0.5);
      ctx.lineTo(x + 2, 0);
      ctx.fill();
    }

    // Hot spots
    ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
    const numSpots = Math.max(1, Math.floor(size / 10));
    for (let i = 0; i < numSpots; i++) {
      const x = rng() * size;
      const y = size * 0.6 + rng() * size * 0.3;
      const r = size * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    add3DEdges(ctx, size, colors.primary);
  },

  animation: {
    territorySpeed: 1.5,
    territoryAmplitude: 2.5,
  },
};
