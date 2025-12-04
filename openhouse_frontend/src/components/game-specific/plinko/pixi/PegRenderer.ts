import { Container, Graphics } from 'pixi.js';
import { LAYOUT } from './LayoutConfig';

export class PegRenderer {
  private container: Container;
  private rows: number;

  constructor(rows: number) {
    this.rows = rows;
    this.container = new Container();
  }

  async init(parent: Container, centerX: number): Promise<void> {
    this.container.removeChildren();

    // Create all pegs as a single Graphics object for performance
    const pegsGraphics = new Graphics();

    for (let row = 0; row <= this.rows; row++) {
      for (let col = 0; col <= row; col++) {
        const x = centerX + (col - row / 2) * LAYOUT.PEG_SPACING_X;
        const y = LAYOUT.DROP_ZONE_HEIGHT + row * LAYOUT.PEG_SPACING_Y;

        // Draw peg with subtle gradient effect
        pegsGraphics.circle(x, y, LAYOUT.PEG_RADIUS);
      }
    }

    pegsGraphics.fill({ color: LAYOUT.PEG_COLOR });

    // Add subtle shadow/glow for depth
    const shadowGraphics = new Graphics();
    for (let row = 0; row <= this.rows; row++) {
      for (let col = 0; col <= row; col++) {
        const x = centerX + (col - row / 2) * LAYOUT.PEG_SPACING_X;
        const y = LAYOUT.DROP_ZONE_HEIGHT + row * LAYOUT.PEG_SPACING_Y;
        shadowGraphics.circle(x + 1, y + 1, LAYOUT.PEG_RADIUS);
      }
    }
    shadowGraphics.fill({ color: 0x000000, alpha: 0.3 });

    // Add shadow first, then pegs on top
    this.container.addChild(shadowGraphics);
    this.container.addChild(pegsGraphics);

    parent.addChild(this.container);
  }

  destroy(): void {
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }
}
