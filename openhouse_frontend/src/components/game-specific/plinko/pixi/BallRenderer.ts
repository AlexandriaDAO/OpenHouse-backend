import { Container, Graphics } from 'pixi.js';
import { LAYOUT, calculateBallX, calculateBallY } from './LayoutConfig';

interface AnimatingBall {
  id: number;
  container: Container;
  path: boolean[];
  currentRow: number;
  progress: number; // 0-1 within current row
  landed: boolean;
  finalSlot: number;
}

export class BallRenderer {
  private container: Container;
  private balls: Map<number, AnimatingBall> = new Map();
  private rows: number;
  private centerX: number = 0;
  private onBallLanded?: (ballId: number, slot: number) => void;
  private landedCount = 0;

  constructor(rows: number, onBallLanded?: (ballId: number, slot: number) => void) {
    this.rows = rows;
    this.onBallLanded = onBallLanded;
    this.container = new Container();
  }

  async init(parent: Container, centerX: number): Promise<void> {
    this.centerX = centerX;
    this.container.removeChildren();
    parent.addChild(this.container);
  }

  dropBall(id: number, path: boolean[]): void {
    // Calculate final slot position (count of rights in path)
    const finalSlot = path.filter((v) => v).length;

    // Create ball container (Pixi v8 requires Container for hierarchy)
    const ballContainer = new Container();

    // Create ball graphics - draw everything in one Graphics object
    const ballGraphics = new Graphics();
    // Main ball
    ballGraphics.circle(0, 0, LAYOUT.BALL_RADIUS);
    ballGraphics.fill({ color: LAYOUT.BALL_COLOR });
    // Highlight for 3D effect
    ballGraphics.circle(-LAYOUT.BALL_RADIUS * 0.3, -LAYOUT.BALL_RADIUS * 0.3, LAYOUT.BALL_RADIUS * 0.3);
    ballGraphics.fill({ color: 0xffffff, alpha: 0.4 });

    ballContainer.addChild(ballGraphics);

    // Initial position (top of board)
    ballContainer.position.set(this.centerX, LAYOUT.DROP_ZONE_HEIGHT - LAYOUT.BALL_RADIUS * 2);

    this.container.addChild(ballContainer);

    const ball: AnimatingBall = {
      id,
      container: ballContainer,
      path,
      currentRow: 0,
      progress: 0,
      landed: false,
      finalSlot,
    };

    this.balls.set(id, ball);
  }

  update(deltaMS: number): void {
    this.balls.forEach((ball) => {
      if (ball.landed) return;

      // Progress through current row
      ball.progress += deltaMS / LAYOUT.MS_PER_ROW;

      if (ball.progress >= 1) {
        ball.currentRow++;
        ball.progress -= 1;

        // Check if ball has landed
        if (ball.currentRow >= this.rows) {
          ball.landed = true;
          ball.progress = 0;
          this.landedCount++;

          // Calculate final position
          const x = calculateBallX(ball.path, this.rows, 0, this.centerX);
          // Add offset to match SlotRenderer's positioning + half slot height for centering
          const y = LAYOUT.DROP_ZONE_HEIGHT + this.rows * LAYOUT.PEG_SPACING_Y + LAYOUT.SLOT_Y_OFFSET + LAYOUT.SLOT_HEIGHT / 2;
          ball.container.position.set(x, y);

          // Callback
          this.onBallLanded?.(ball.id, ball.finalSlot);
          return;
        }
      }

      // Calculate current position with easing
      const x = calculateBallX(ball.path, ball.currentRow, ball.progress, this.centerX);
      const y = calculateBallY(ball.currentRow, ball.progress);

      ball.container.position.set(x, y);

      // Add slight rotation for visual interest
      ball.container.rotation += deltaMS * 0.005;
    });
  }

  areAllLanded(): boolean {
    if (this.balls.size === 0) return false;
    return this.landedCount >= this.balls.size;
  }

  getBallCount(): number {
    return this.balls.size;
  }

  clear(): void {
    this.balls.forEach((ball) => {
      ball.container.removeFromParent();
      ball.container.destroy({ children: true });
    });
    this.balls.clear();
    this.landedCount = 0;
  }

  destroy(): void {
    this.clear();
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }
}
