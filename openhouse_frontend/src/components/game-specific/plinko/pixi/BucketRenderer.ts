import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { LAYOUT, easeInOutQuad } from './LayoutConfig';

interface BucketBall {
  graphics: Graphics;
  x: number;
  y: number;
  vy: number; // velocity y
}

export class BucketRenderer {
  private container: Container;
  private bucketBody: Graphics;
  private leftDoor: Container;
  private rightDoor: Container;
  private labelText: Text;
  private balls: BucketBall[] = [];
  private ballContainer: Container;

  // Animation state
  private doorOpen = false;
  private doorProgress = 0; // 0 = closed, 1 = open
  private isDoorAnimating = false;

  // Bucket interior dimensions
  private readonly INTERIOR_WIDTH = LAYOUT.BUCKET_WIDTH - 20;
  private readonly INTERIOR_HEIGHT = LAYOUT.BUCKET_HEIGHT - 20;

  constructor() {
    this.container = new Container();
    this.bucketBody = new Graphics();
    this.leftDoor = new Container();
    this.rightDoor = new Container();
    this.ballContainer = new Container();
    this.labelText = new Text({
      text: 'DROP',
      style: new TextStyle({
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
        fontWeight: 'bold',
        fill: 0xffffff,
      }),
    });
  }

  async init(parent: Container, centerX: number): Promise<void> {
    this.container.removeChildren();
    this.container.position.set(centerX, 0);

    // Bucket body (trapezoid shape)
    this.bucketBody.clear();
    this.bucketBody.moveTo(-LAYOUT.BUCKET_WIDTH / 2, 10);
    this.bucketBody.lineTo(-LAYOUT.BUCKET_WIDTH / 2 + 15, LAYOUT.BUCKET_HEIGHT);
    this.bucketBody.lineTo(LAYOUT.BUCKET_WIDTH / 2 - 15, LAYOUT.BUCKET_HEIGHT);
    this.bucketBody.lineTo(LAYOUT.BUCKET_WIDTH / 2, 10);
    this.bucketBody.closePath();
    this.bucketBody.fill({ color: LAYOUT.BUCKET_COLOR });
    this.bucketBody.stroke({ color: LAYOUT.BUCKET_BORDER_COLOR, width: 2 });

    this.container.addChild(this.bucketBody);

    // Ball container (masked to bucket interior)
    this.ballContainer.position.set(0, 15);
    this.container.addChild(this.ballContainer);

    // Left door
    const leftDoorGraphic = new Graphics();
    leftDoorGraphic.rect(0, 0, LAYOUT.BUCKET_WIDTH / 2 - 10, 8);
    leftDoorGraphic.fill({ color: LAYOUT.TRAPDOOR_COLOR });
    leftDoorGraphic.stroke({ color: LAYOUT.BUCKET_BORDER_COLOR, width: 1 });
    this.leftDoor.addChild(leftDoorGraphic);
    this.leftDoor.pivot.set(0, 4); // Pivot on left edge
    this.leftDoor.position.set(-LAYOUT.BUCKET_WIDTH / 2 + 15, LAYOUT.BUCKET_HEIGHT);
    this.container.addChild(this.leftDoor);

    // Right door
    const rightDoorGraphic = new Graphics();
    rightDoorGraphic.rect(-(LAYOUT.BUCKET_WIDTH / 2 - 10), 0, LAYOUT.BUCKET_WIDTH / 2 - 10, 8);
    rightDoorGraphic.fill({ color: LAYOUT.TRAPDOOR_COLOR });
    rightDoorGraphic.stroke({ color: LAYOUT.BUCKET_BORDER_COLOR, width: 1 });
    this.rightDoor.addChild(rightDoorGraphic);
    this.rightDoor.pivot.set(0, 4); // Pivot on right edge
    this.rightDoor.position.set(LAYOUT.BUCKET_WIDTH / 2 - 15, LAYOUT.BUCKET_HEIGHT);
    this.container.addChild(this.rightDoor);

    // Label
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(0, LAYOUT.BUCKET_HEIGHT / 2);
    this.container.addChild(this.labelText);

    parent.addChild(this.container);
  }

  fillBucket(count: number): void {
    // Clear existing balls
    this.clearBalls();

    // Add balls with staggered timing
    const ballRadius = 8;

    for (let i = 0; i < Math.min(count, 30); i++) {
      setTimeout(() => {
        const ball = new Graphics();
        ball.circle(0, 0, ballRadius);
        ball.fill({ color: LAYOUT.BALL_COLOR });

        // Random starting position at top of bucket
        const x = (Math.random() - 0.5) * (this.INTERIOR_WIDTH - ballRadius * 2);
        const y = -ballRadius;

        ball.position.set(x, y);
        this.ballContainer.addChild(ball);

        this.balls.push({
          graphics: ball,
          x,
          y,
          vy: 0,
        });
      }, i * 40);
    }
  }

  openDoor(): void {
    this.doorOpen = true;
    this.isDoorAnimating = true;
  }

  closeDoor(): void {
    this.doorOpen = false;
    this.isDoorAnimating = true;
  }

  update(deltaMS: number): void {
    // Animate door
    if (this.isDoorAnimating) {
      const targetProgress = this.doorOpen ? 1 : 0;
      const speed = deltaMS / LAYOUT.DOOR_OPEN_DURATION_MS;

      if (this.doorOpen) {
        this.doorProgress = Math.min(1, this.doorProgress + speed);
      } else {
        this.doorProgress = Math.max(0, this.doorProgress - speed);
      }

      if (this.doorProgress === targetProgress) {
        this.isDoorAnimating = false;
      }

      // Apply rotation to doors (swing outward)
      const angle = easeInOutQuad(this.doorProgress) * (Math.PI / 2);
      this.leftDoor.rotation = -angle;
      this.rightDoor.rotation = angle;
    }

    // Animate bucket balls (simple gravity)
    const gravity = 0.3;
    const damping = 0.7;
    const floorY = this.INTERIOR_HEIGHT - 10;

    this.balls.forEach((ball) => {
      // Apply gravity
      ball.vy += gravity;
      ball.y += ball.vy;

      // Floor collision (unless door is open)
      if (!this.doorOpen && ball.y > floorY) {
        ball.y = floorY;
        ball.vy = -ball.vy * damping;
        if (Math.abs(ball.vy) < 0.5) ball.vy = 0;
      }

      // If door is open, balls fall through
      if (this.doorOpen && ball.y > floorY + 50) {
        ball.graphics.alpha = Math.max(0, ball.graphics.alpha - 0.1);
      }

      ball.graphics.position.set(ball.x, ball.y);
    });

    // Remove fully transparent balls
    this.balls = this.balls.filter((ball) => {
      if (ball.graphics.alpha <= 0) {
        ball.graphics.removeFromParent();
        ball.graphics.destroy();
        return false;
      }
      return true;
    });
  }

  setLabel(text: string): void {
    this.labelText.text = text;
  }

  reset(): void {
    this.clearBalls();
    this.doorOpen = false;
    this.doorProgress = 0;
    this.leftDoor.rotation = 0;
    this.rightDoor.rotation = 0;
    this.labelText.text = 'DROP';
  }

  private clearBalls(): void {
    this.balls.forEach((ball) => {
      ball.graphics.removeFromParent();
      ball.graphics.destroy();
    });
    this.balls = [];
  }

  destroy(): void {
    this.clearBalls();
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }
}
