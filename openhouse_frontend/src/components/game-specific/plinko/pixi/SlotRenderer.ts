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

  // Draw bucket-style slot shape
  private drawBucketSlot(
    g: Graphics,
    isWin: boolean,
    highlighted: boolean = false
  ): void {
    g.clear();

    const w = LAYOUT.SLOT_WIDTH;
    const h = LAYOUT.SLOT_HEIGHT;
    const halfW = w / 2;
    const taper = 3; // How much narrower at bottom
    const cornerRadius = 6;

    // Colors
    const bgColor = highlighted
      ? (isWin ? 0x22c55e : LAYOUT.HIGHLIGHT_COLOR)
      : (isWin ? 0x0d2818 : 0x1a1a28);
    const borderColor = highlighted
      ? LAYOUT.HIGHLIGHT_COLOR
      : (isWin ? LAYOUT.WIN_COLOR : LAYOUT.LOSE_COLOR);
    const rimColor = isWin ? 0x2d5a3d : 0x3a3a5e;
    const bgAlpha = highlighted ? 0.5 : 1;

    // Draw inner shadow/depth (darker interior)
    g.roundRect(-halfW + 2, 4, w - 4, h - 6, cornerRadius - 2);
    g.fill({ color: 0x000000, alpha: 0.3 });

    // Draw main bucket body (trapezoid-ish with rounded bottom)
    g.moveTo(-halfW, 0);                          // Top-left
    g.lineTo(-halfW + taper, h - cornerRadius);   // Left side tapers in
    g.arcTo(-halfW + taper, h, -halfW + taper + cornerRadius, h, cornerRadius); // Bottom-left corner
    g.lineTo(halfW - taper - cornerRadius, h);    // Bottom edge
    g.arcTo(halfW - taper, h, halfW - taper, h - cornerRadius, cornerRadius);   // Bottom-right corner
    g.lineTo(halfW, 0);                           // Right side tapers out
    // No top line - open entrance
    g.fill({ color: bgColor, alpha: bgAlpha });

    // Draw left and right rim highlights (no top border)
    g.moveTo(-halfW, 0);
    g.lineTo(-halfW + taper, h - cornerRadius);
    g.arcTo(-halfW + taper, h, -halfW + taper + cornerRadius, h, cornerRadius);
    g.lineTo(halfW - taper - cornerRadius, h);
    g.arcTo(halfW - taper, h, halfW - taper, h - cornerRadius, cornerRadius);
    g.lineTo(halfW, 0);
    g.stroke({ color: borderColor, width: highlighted ? 3 : 2 });

    // Draw rim highlights at top edges
    g.moveTo(-halfW - 1, -1);
    g.lineTo(-halfW - 1, 6);
    g.stroke({ color: rimColor, width: 3 });

    g.moveTo(halfW + 1, -1);
    g.lineTo(halfW + 1, 6);
    g.stroke({ color: rimColor, width: 3 });
  }

  async init(parent: Container, centerX: number, rows: number): Promise<void> {
    this.rows = rows;
    this.container.removeChildren();
    this.slotGraphics = [];
    this.multiplierTexts = [];

    const slotY = LAYOUT.DROP_ZONE_HEIGHT + this.rows * LAYOUT.PEG_SPACING_Y + LAYOUT.SLOT_Y_OFFSET;
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

      // Slot bucket graphic
      const slotGraphic = new Graphics();
      slotGraphic.position.set(x, slotY);
      this.drawBucketSlot(slotGraphic, isWin, false);
      this.slotGraphics.push(slotGraphic);
      this.container.addChild(slotGraphic);

      // Multiplier text (positioned below the bucket)
      const text = new Text({
        text: `${multiplier.toFixed(2)}x`,
        style: {
          ...textStyle,
          fontSize: 10,
          fill: isWin ? LAYOUT.WIN_COLOR : LAYOUT.LOSE_COLOR,
        },
      });
      text.anchor.set(0.5, 0);
      text.position.set(x, slotY + LAYOUT.SLOT_HEIGHT + 4);
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

        this.drawBucketSlot(slot, isWin, true);
      }
    });
  }

  clearHighlights(): void {
    this.highlightedSlots.forEach((pos) => {
      if (pos >= 0 && pos < this.slotGraphics.length) {
        const slot = this.slotGraphics[pos];
        const multiplier = this.multipliers[pos] ?? 0.2;
        const isWin = multiplier >= 1.0;

        this.drawBucketSlot(slot, isWin, false);
      }
    });
    this.highlightedSlots.clear();
  }

  updateMultipliers(multipliers: number[]): void {
    this.multipliers = multipliers;
    // Update text and redraw slot graphics
    multipliers.forEach((mult, i) => {
      if (i < this.multiplierTexts.length) {
        const isWin = mult >= 1.0;
        this.multiplierTexts[i].text = `${mult.toFixed(2)}x`;
        this.multiplierTexts[i].style.fill = isWin ? LAYOUT.WIN_COLOR : LAYOUT.LOSE_COLOR;
      }
      // Also redraw the slot graphic with correct colors
      if (i < this.slotGraphics.length) {
        const isWin = mult >= 1.0;
        const isHighlighted = this.highlightedSlots.has(i);
        this.drawBucketSlot(this.slotGraphics[i], isWin, isHighlighted);
      }
    });
  }

  destroy(): void {
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }
}
