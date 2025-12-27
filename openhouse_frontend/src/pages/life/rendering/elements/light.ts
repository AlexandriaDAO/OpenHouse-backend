import type { ElementRenderer } from '../types';
import { seededRandom } from '../seededRandom';
import { add3DEdges, hexToRgb, lighten, darken, rgbToCss } from '../colorUtils';

/**
 * LIGHT ELEMENT
 *
 * Visual style: Radiant, glowing - Minecraft glowstone inspired
 * Territory: Grid of glowing blocks with rays and sparkles
 * Cells: Pure crystal with sparkles
 */
export const lightRenderer: ElementRenderer = {
  name: 'Light',

  renderTerritoryTile(ctx, size, colors) {
    const base = hexToRgb(colors.primary);

    // Render as grid of Minecraft-style glowing blocks
    const blockSize = 16;
    const gridCount = Math.floor(size / blockSize);

    for (let row = 0; row < gridCount; row++) {
      for (let col = 0; col < gridCount; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        const seed = row * gridCount + col + 500;
        const rng = seededRandom(seed);

        // Radial gradient - glowing from center
        const gradient = ctx.createRadialGradient(
          x + blockSize / 2, y + blockSize / 2, 0,
          x + blockSize / 2, y + blockSize / 2, blockSize * 0.7
        );
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(0.4, rgbToCss(lighten(base, 0.3)));
        gradient.addColorStop(1, rgbToCss(base));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, blockSize, blockSize);

        // Light rays from center
        ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
        ctx.lineWidth = 1;
        const rayCount = 4;
        for (let i = 0; i < rayCount; i++) {
          const angle = (i / rayCount) * Math.PI * 2 + rng() * 0.3;
          ctx.beginPath();
          ctx.moveTo(x + blockSize / 2, y + blockSize / 2);
          ctx.lineTo(
            x + blockSize / 2 + Math.cos(angle) * blockSize * 0.45,
            y + blockSize / 2 + Math.sin(angle) * blockSize * 0.45
          );
          ctx.stroke();
        }

        // Sparkle points
        const sparkleCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < sparkleCount; i++) {
          const sx = x + rng() * blockSize;
          const sy = y + rng() * blockSize;
          const ss = 1 + rng() * 1.5;
          ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
          ctx.beginPath();
          ctx.arc(sx, sy, ss, 0, Math.PI * 2);
          ctx.fill();
        }

        // Soft 3D shading (light element is ethereal)
        const lightColor = `rgba(255, 255, 255, 0.5)`;
        const darkColor = rgbToCss(darken(base, 0.2));
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
    const rng = seededRandom(46);

    // Radial gradient fill (glowing from center)
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size * 0.7
    );
    gradient.addColorStop(0, colors.secondary);
    gradient.addColorStop(1, colors.primary);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Sparkle points
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    const numSparkles = Math.max(1, Math.floor(size / 8));
    for (let i = 0; i < numSparkles; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = size * 0.04;

      ctx.globalAlpha = 0.5 + rng() * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    add3DEdges(ctx, size, colors.primary);
  },

  animation: {
    territorySpeed: 1.0,
    territoryAmplitude: 2,
  },
};
