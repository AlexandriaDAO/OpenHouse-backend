import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { LAYOUT } from './LayoutConfig';

export class SlotRenderer {
  private container: Container;
  private rows: number;
  private multipliers: number[];
  private slotGraphics: Graphics[] = [];
  private multiplierTexts: Text[] = [];
  private highlightedSlots: Set<number> = new Set();

  constructor(rows: number, multipliers: number[]) {
    this.rows = rows;
    this.multipliers = multipliers;
    this.container = new Container();
  }

  async init(parent: Container, centerX: number, rows: number): Promise<void> {
    this.rows = rows;
    this.container.removeChildren();
    this.slotGraphics = [];
    this.multiplierTexts = [];

    const slotY = LAYOUT.DROP_ZONE_HEIGHT + this.rows * LAYOUT.PEG_SPACING_Y + 20;
    const numSlots = this.rows + 1;

    // Create text style
    const textStyle = new TextStyle({
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11,
      fontWeight: 'bold',
      fill: 0xffffff,
    });

    for (let i = 0; i < numSlots; i++) {
      const x = centerX + (i - this.rows / 2) * LAYOUT.PEG_SPACING_X;
      const multiplier = this.multipliers[i] ?? 0.2;
      const isWin = multiplier >= 1.0;

      // Slot background
      const slotGraphic = new Graphics();
      slotGraphic.roundRect(
        x - LAYOUT.SLOT_WIDTH / 2,
        slotY,
        LAYOUT.SLOT_WIDTH,
        LAYOUT.SLOT_HEIGHT,
        4
      );
      slotGraphic.fill({ color: isWin ? 0x1a3d2e : 0x2a2a3e });
      slotGraphic.stroke({ color: isWin ? LAYOUT.WIN_COLOR : LAYOUT.LOSE_COLOR, width: 2 });
      this.slotGraphics.push(slotGraphic);
      this.container.addChild(slotGraphic);

      // Multiplier text
      const text = new Text({
        text: `${multiplier.toFixed(2)}x`,
        style: {
          ...textStyle,
          fill: isWin ? LAYOUT.WIN_COLOR : LAYOUT.LOSE_COLOR,
        },
      });
      text.anchor.set(0.5);
      text.position.set(x, slotY + LAYOUT.SLOT_HEIGHT / 2);
      this.multiplierTexts.push(text);
      this.container.addChild(text);
    }

    parent.addChild(this.container);
  }

  highlightSlots(positions: number[]): void {
    // Clear previous highlights
    this.clearHighlights();

    // Count occurrences for each position
    const counts = new Map<number, number>();
    positions.forEach((pos) => {
      counts.set(pos, (counts.get(pos) || 0) + 1);
    });

    // Apply highlights
    counts.forEach((_count, pos) => {
      if (pos >= 0 && pos < this.slotGraphics.length) {
        this.highlightedSlots.add(pos);
        const slot = this.slotGraphics[pos];
        const multiplier = this.multipliers[pos] ?? 0.2;
        const isWin = multiplier >= 1.0;

        slot.clear();
        slot.roundRect(
          -LAYOUT.SLOT_WIDTH / 2,
          0,
          LAYOUT.SLOT_WIDTH,
          LAYOUT.SLOT_HEIGHT,
          4
        );
        slot.fill({ color: isWin ? 0x22c55e : LAYOUT.HIGHLIGHT_COLOR, alpha: 0.4 });
        slot.stroke({ color: LAYOUT.HIGHLIGHT_COLOR, width: 3 });
      }
    });
  }

  clearHighlights(): void {
    this.highlightedSlots.forEach((pos) => {
      if (pos >= 0 && pos < this.slotGraphics.length) {
        const slot = this.slotGraphics[pos];
        const multiplier = this.multipliers[pos] ?? 0.2;
        const isWin = multiplier >= 1.0;

        slot.clear();
        slot.roundRect(
          -LAYOUT.SLOT_WIDTH / 2,
          0,
          LAYOUT.SLOT_WIDTH,
          LAYOUT.SLOT_HEIGHT,
          4
        );
        slot.fill({ color: isWin ? 0x1a3d2e : 0x2a2a3e });
        slot.stroke({ color: isWin ? LAYOUT.WIN_COLOR : LAYOUT.LOSE_COLOR, width: 2 });
      }
    });
    this.highlightedSlots.clear();
  }

  updateMultipliers(multipliers: number[]): void {
    this.multipliers = multipliers;
    // Update text
    multipliers.forEach((mult, i) => {
      if (i < this.multiplierTexts.length) {
        const isWin = mult >= 1.0;
        this.multiplierTexts[i].text = `${mult.toFixed(2)}x`;
        this.multiplierTexts[i].style.fill = isWin ? LAYOUT.WIN_COLOR : LAYOUT.LOSE_COLOR;
      }
    });
  }

  destroy(): void {
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }
}
