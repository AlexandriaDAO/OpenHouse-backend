import type { ElementRenderer } from '../types';
import { seededRandom } from '../seededRandom';
import { add3DEdges, hexToRgb, lighten, darken, rgbToCss } from '../colorUtils';

/**
 * WATER ELEMENT
 *
 * Visual style: Fluid, rippling - Minecraft water block inspired
 * Territory: Grid of water blocks with waves and shimmer
 * Cells: Liquid cube with wave patterns
 */
export const waterRenderer: ElementRenderer = {
  name: 'Water',

  renderTerritoryTile(ctx, size, colors) {
    const base = hexToRgb(colors.primary);

    // Render as grid of Minecraft-style water blocks
    const blockSize = 16;
    const gridCount = Math.floor(size / blockSize);

    for (let row = 0; row < gridCount; row++) {
      for (let col = 0; col < gridCount; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        const seed = row * gridCount + col + 200;
        const rng = seededRandom(seed);

        // Gradient base - lighter top, darker bottom (depth)
        const gradient = ctx.createLinearGradient(x, y, x, y + blockSize);
        gradient.addColorStop(0, rgbToCss(lighten(base, 0.15)));
        gradient.addColorStop(1, rgbToCss(darken(base, 0.15)));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, blockSize, blockSize);

        // Wave lines
        ctx.strokeStyle = rgbToCss(lighten(base, 0.25));
        ctx.lineWidth = 1;
        const waveCount = 3;
        for (let i = 0; i < waveCount; i++) {
          const wy = y + (blockSize / (waveCount + 1)) * (i + 1);
          ctx.beginPath();
          for (let wx = 0; wx <= blockSize; wx += 2) {
            const waveY = wy + Math.sin((wx + col * 5) * 0.4 + i) * 1.5;
            if (wx === 0) {
              ctx.moveTo(x + wx, waveY);
            } else {
              ctx.lineTo(x + wx, waveY);
            }
          }
          ctx.stroke();
        }

        // Shimmer highlight
        if (rng() > 0.5) {
          const sx = x + rng() * blockSize;
          const sy = y + rng() * blockSize * 0.4;
          ctx.fillStyle = `rgba(255, 255, 255, 0.4)`;
          ctx.beginPath();
          ctx.ellipse(sx, sy, 2, 1, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3D shading
        const lightColor = rgbToCss(lighten(base, 0.25));
        const darkColor = rgbToCss(darken(base, 0.35));
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
    const rng = seededRandom(43);

    // Base fill
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, size, size);

    // Wave pattern overlay
    ctx.strokeStyle = colors.secondary;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;

    const numLines = Math.max(2, Math.floor(size / 5));
    for (let i = 0; i < numLines; i++) {
      const y = (size / (numLines + 1)) * (i + 1);
      ctx.beginPath();
      for (let x = 0; x < size; x += 2) {
        const waveY = y + Math.sin(x * 0.3 + i) * 1.5;
        if (x === 0) {
          ctx.moveTo(x, waveY);
        } else {
          ctx.lineTo(x, waveY);
        }
      }
      ctx.stroke();
    }

    // Small bubbles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    const numBubbles = Math.max(1, Math.floor(size / 8));
    for (let i = 0; i < numBubbles; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = size * 0.06;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    add3DEdges(ctx, size, colors.primary);
  },

  animation: {
    territorySpeed: 1.2,
    territoryAmplitude: 3,
  },
};
