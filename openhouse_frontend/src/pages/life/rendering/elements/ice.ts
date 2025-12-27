import type { ElementRenderer } from '../types';
import { seededRandom } from '../seededRandom';
import { add3DEdges, hexToRgb, lighten, darken, rgbToCss } from '../colorUtils';

/**
 * ICE ELEMENT
 *
 * Visual style: Cold, crystalline - Minecraft ice block inspired
 * Territory: Grid of ice blocks with crystal facets and frost
 * Cells: Frost cube with crystal facets
 */
export const iceRenderer: ElementRenderer = {
  name: 'Ice',

  renderTerritoryTile(ctx, size, colors) {
    const base = hexToRgb(colors.primary);
    const secondary = hexToRgb(colors.secondary);

    // Render as grid of Minecraft-style ice blocks
    const blockSize = 16;
    const gridCount = Math.floor(size / blockSize);

    for (let row = 0; row < gridCount; row++) {
      for (let col = 0; col < gridCount; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        const seed = row * gridCount + col + 600;
        const rng = seededRandom(seed);

        // Gradient base - frost effect
        const gradient = ctx.createLinearGradient(x, y, x + blockSize, y + blockSize);
        gradient.addColorStop(0, rgbToCss(lighten(base, 0.2)));
        gradient.addColorStop(0.5, rgbToCss(base));
        gradient.addColorStop(1, rgbToCss(secondary));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, blockSize, blockSize);

        // Crystal facets
        const facetCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < facetCount; i++) {
          const fx = x + rng() * blockSize;
          const fy = y + rng() * blockSize;
          const fs = blockSize * (0.2 + rng() * 0.15);

          ctx.fillStyle = rgbToCss(lighten(base, 0.25 + rng() * 0.15), 0.5);
          ctx.beginPath();
          ctx.moveTo(fx, fy - fs);
          ctx.lineTo(fx + fs * 0.6, fy);
          ctx.lineTo(fx, fy + fs * 0.7);
          ctx.lineTo(fx - fs * 0.6, fy);
          ctx.closePath();
          ctx.fill();
        }

        // Frost streaks
        ctx.strokeStyle = `rgba(255, 255, 255, 0.5)`;
        ctx.lineWidth = 1;
        const streakCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < streakCount; i++) {
          const sx = x + rng() * blockSize;
          const sy = y + rng() * blockSize;
          const len = blockSize * 0.3;
          const angle = rng() * Math.PI;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
          ctx.stroke();
        }

        // Glossy corner highlight
        ctx.fillStyle = `rgba(255, 255, 255, 0.35)`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + blockSize * 0.3, y);
        ctx.lineTo(x, y + blockSize * 0.3);
        ctx.closePath();
        ctx.fill();

        // 3D shading
        const lightColor = `rgba(255, 255, 255, 0.4)`;
        const darkColor = rgbToCss(darken(base, 0.3));
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
    const rng = seededRandom(47);

    // Base fill
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, size, size);

    // Crystal facet lines
    ctx.strokeStyle = colors.secondary;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;

    // Diagonal crystal lines
    const numLines = Math.max(2, Math.floor(size / 6));
    for (let i = 0; i < numLines; i++) {
      const offset = (size / numLines) * i;
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(size, size - offset);
      ctx.stroke();
    }

    // Frost sparkles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const numSparkles = Math.max(1, Math.floor(size / 10));
    for (let i = 0; i < numSparkles; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = size * 0.03;

      ctx.globalAlpha = 0.4 + rng() * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    add3DEdges(ctx, size, colors.primary);
  },

  animation: {
    territorySpeed: 0.5,
    territoryAmplitude: 1.5,
  },
};
