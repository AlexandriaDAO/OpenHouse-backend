import type { ElementRenderer } from '../types';
import { seededRandom } from '../seededRandom';
import { add3DEdges, hexToRgb, lighten, darken, rgbToCss } from '../colorUtils';

/**
 * VOID ELEMENT
 *
 * Visual style: Dark, consuming - obsidian/end block inspired
 * Territory: Grid of void blocks with dark vortexes
 * Cells: Dark matter with subtle depth
 */
export const voidRenderer: ElementRenderer = {
  name: 'Void',

  renderTerritoryTile(ctx, size, colors) {
    const base = hexToRgb(colors.primary);
    const secondary = hexToRgb(colors.secondary);

    // Render as grid of Minecraft-style void blocks
    const blockSize = 16;
    const gridCount = Math.floor(size / blockSize);

    for (let row = 0; row < gridCount; row++) {
      for (let col = 0; col < gridCount; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        const seed = row * gridCount + col + 800;
        const rng = seededRandom(seed);

        // Dark base with inward gradient (consuming)
        const gradient = ctx.createRadialGradient(
          x + blockSize / 2, y + blockSize / 2, blockSize * 0.5,
          x + blockSize / 2, y + blockSize / 2, 0
        );
        gradient.addColorStop(0, rgbToCss(secondary));
        gradient.addColorStop(0.5, rgbToCss(base));
        gradient.addColorStop(1, rgbToCss(darken(base, 0.4)));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, blockSize, blockSize);

        // Swirling darkness patches
        const swirlCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < swirlCount; i++) {
          const sx = x + rng() * blockSize;
          const sy = y + rng() * blockSize;
          const sr = blockSize * (0.15 + rng() * 0.15);
          ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + rng() * 0.3})`;
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }

        // Dark vortex in center
        const vortexGradient = ctx.createRadialGradient(
          x + blockSize / 2, y + blockSize / 2, blockSize * 0.3,
          x + blockSize / 2, y + blockSize / 2, 0
        );
        vortexGradient.addColorStop(0, 'transparent');
        vortexGradient.addColorStop(0.5, rgbToCss(secondary, 0.3));
        vortexGradient.addColorStop(1, `rgba(0, 0, 0, 0.5)`);
        ctx.fillStyle = vortexGradient;
        ctx.beginPath();
        ctx.arc(x + blockSize / 2, y + blockSize / 2, blockSize * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Faint particle being consumed
        if (rng() > 0.5) {
          const px = x + rng() * blockSize;
          const py = y + rng() * blockSize;
          const dist = Math.sqrt(Math.pow(px - (x + blockSize/2), 2) + Math.pow(py - (y + blockSize/2), 2));
          const alpha = Math.min(0.5, dist / blockSize * 0.8);
          ctx.fillStyle = `rgba(100, 100, 150, ${alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, 1, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3D shading - inverted for void (darker on top/left)
        const lightColor = rgbToCss(secondary);
        const darkColor = `rgba(0, 0, 0, 0.6)`;
        const edgeWidth = 2;

        // Void has inverted shading - darker edges feel like they're pulling in
        ctx.fillStyle = darkColor;
        ctx.fillRect(x, y, blockSize, edgeWidth);
        ctx.fillRect(x, y, edgeWidth, blockSize);
        ctx.fillStyle = lightColor;
        ctx.fillRect(x, y + blockSize - edgeWidth, blockSize, edgeWidth);
        ctx.fillRect(x + blockSize - edgeWidth, y, edgeWidth, blockSize);
      }
    }
  },

  renderCellSprite(ctx, size, colors) {
    const rng = seededRandom(49);

    // Base fill
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, size, size);

    // Dark vortex center
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, size * 0.4,
      size / 2, size / 2, 0
    );
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, colors.secondary);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, 0, size, size);

    // Subtle depth particles
    ctx.fillStyle = colors.secondary;
    const numParticles = Math.max(2, Math.floor(size / 8));
    for (let i = 0; i < numParticles; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * size * 0.3;
      const x = size / 2 + Math.cos(angle) * dist;
      const y = size / 2 + Math.sin(angle) * dist;
      const r = size * 0.04;

      ctx.globalAlpha = 0.2 + rng() * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    add3DEdges(ctx, size, colors.primary);
  },

  animation: {
    territorySpeed: 0.6,
    territoryAmplitude: 2,
  },
};
