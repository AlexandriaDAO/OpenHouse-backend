import type { ElementRenderer } from '../types';
import { seededRandom } from '../seededRandom';
import { add3DEdges, hexToRgb, lighten, darken, rgbToCss } from '../colorUtils';

/**
 * PLASMA ELEMENT
 *
 * Visual style: Electric, chaotic - energy/lightning block inspired
 * Territory: Grid of plasma blocks with electric arcs
 * Cells: Energy core with electric streaks
 */
export const plasmaRenderer: ElementRenderer = {
  name: 'Plasma',

  renderTerritoryTile(ctx, size, colors) {
    const base = hexToRgb(colors.primary);
    const yellow = hexToRgb(colors.secondary);

    // Render as grid of Minecraft-style plasma blocks
    const blockSize = 16;
    const gridCount = Math.floor(size / blockSize);

    for (let row = 0; row < gridCount; row++) {
      for (let col = 0; col < gridCount; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        const seed = row * gridCount + col + 700;
        const rng = seededRandom(seed);

        // Purple nebula gradient
        const gradient = ctx.createRadialGradient(
          x + blockSize * 0.4, y + blockSize * 0.4, 0,
          x + blockSize / 2, y + blockSize / 2, blockSize * 0.7
        );
        gradient.addColorStop(0, rgbToCss(lighten(base, 0.2)));
        gradient.addColorStop(0.6, rgbToCss(base));
        gradient.addColorStop(1, rgbToCss(darken(base, 0.25)));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, blockSize, blockSize);

        // Energy cloud
        ctx.fillStyle = `rgba(218, 112, 214, 0.4)`;
        ctx.beginPath();
        ctx.arc(x + blockSize / 2, y + blockSize / 2, blockSize * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Electric arc across block
        const arcStartX = x + rng() * blockSize * 0.3;
        const arcStartY = y + rng() * blockSize;
        const arcEndX = x + blockSize * 0.7 + rng() * blockSize * 0.3;
        const arcEndY = y + rng() * blockSize;

        // Arc glow
        ctx.strokeStyle = rgbToCss(yellow, 0.4);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(arcStartX, arcStartY);
        let ax = arcStartX, ay = arcStartY;
        for (let j = 0; j < 3; j++) {
          ax += (arcEndX - arcStartX) / 3 + (rng() - 0.5) * 4;
          ay += (arcEndY - arcStartY) / 3 + (rng() - 0.5) * 6;
          ctx.lineTo(ax, ay);
        }
        ctx.stroke();

        // Arc core
        ctx.strokeStyle = rgbToCss(yellow, 0.9);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Energy node in center
        const nodeGradient = ctx.createRadialGradient(
          x + blockSize / 2, y + blockSize / 2, 0,
          x + blockSize / 2, y + blockSize / 2, blockSize * 0.2
        );
        nodeGradient.addColorStop(0, `rgba(255, 255, 150, 0.9)`);
        nodeGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = nodeGradient;
        ctx.beginPath();
        ctx.arc(x + blockSize / 2, y + blockSize / 2, blockSize * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // 3D shading with electric glow
        const lightColor = rgbToCss(yellow, 0.4);
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
    const rng = seededRandom(48);

    // Base fill
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, size, size);

    // Energy core (bright center)
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size * 0.5
    );
    gradient.addColorStop(0, colors.secondary);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, size, size);

    // Electric streaks from center
    ctx.strokeStyle = colors.secondary;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    const numStreaks = Math.max(3, Math.floor(size / 5));
    for (let i = 0; i < numStreaks; i++) {
      const angle = (Math.PI * 2 / numStreaks) * i + rng() * 0.5;
      const len = size * 0.4;

      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2);
      let x = size / 2;
      let y = size / 2;
      for (let j = 0; j < 3; j++) {
        x += Math.cos(angle) * (len / 3) + (rng() - 0.5) * 3;
        y += Math.sin(angle) * (len / 3) + (rng() - 0.5) * 3;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    add3DEdges(ctx, size, colors.primary);
  },

  animation: {
    territorySpeed: 2.0,
    territoryAmplitude: 3,
  },
};
