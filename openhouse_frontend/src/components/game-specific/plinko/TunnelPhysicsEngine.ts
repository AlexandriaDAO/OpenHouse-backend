import Matter from 'matter-js';

export interface TunnelBallState {
  x: number;
  y: number;
  rotation: number;
}

export interface TunnelPhysicsOptions {
  centerX: number;
  onBallUpdate?: (states: Map<number, TunnelBallState>) => void;
  onAllSettled?: () => void;
}

/**
 * Physics engine for balls dropping into the release tunnel.
 * Creates a pyramid-shaped container where balls fall and settle.
 */
export class TunnelPhysicsEngine {
  private engine: Matter.Engine;
  private runner: Matter.Runner;
  private balls: Map<number, Matter.Body> = new Map();
  private walls: Matter.Body[] = [];
  private options: TunnelPhysicsOptions;
  private animationFrame: number | null = null;
  private settleCheckInterval: number | null = null;
  private hasNotifiedSettled = false;

  // Tunnel dimensions (matching ReleaseTunnel.tsx)
  // Widened for 8px radius balls (was designed for 5px)
  private static BUCKET = {
    TOP_Y: 15,
    BOTTOM_Y: 70,
    TOP_WIDTH: 40,      // Was 24, widened for 8px balls
    BOTTOM_WIDTH: 100,  // Was 80, widened proportionally
    GATE_HEIGHT: 4,
  };

  private static BALL_RADIUS = 8;  // Matches board balls for unified appearance

  constructor(options: TunnelPhysicsOptions) {
    this.options = options;

    this.engine = Matter.Engine.create({
      timing: { timeScale: 1.2 }, // Slightly faster for snappier feel
    });

    // Reduce gravity slightly for a floatier feel in the small tunnel
    this.engine.gravity.y = 0.8;

    this.runner = Matter.Runner.create();
    this.createTunnelWalls();
  }

  private createTunnelWalls() {
    const { BUCKET, BALL_RADIUS } = TunnelPhysicsEngine;
    const { centerX } = this.options;

    // Left wall of pyramid (angled)
    const leftWallLength = Math.sqrt(
      Math.pow(BUCKET.BOTTOM_WIDTH/2 - BUCKET.TOP_WIDTH/2, 2) +
      Math.pow(BUCKET.BOTTOM_Y - BUCKET.TOP_Y, 2)
    );
    const leftWallAngle = Math.atan2(
      BUCKET.BOTTOM_WIDTH/2 - BUCKET.TOP_WIDTH/2,
      BUCKET.BOTTOM_Y - BUCKET.TOP_Y
    );
    const leftWallCenterX = centerX - (BUCKET.TOP_WIDTH/2 + BUCKET.BOTTOM_WIDTH/2) / 4;
    const leftWallCenterY = (BUCKET.TOP_Y + BUCKET.BOTTOM_Y) / 2;

    const leftWall = Matter.Bodies.rectangle(
      leftWallCenterX - 15,
      leftWallCenterY,
      8,
      leftWallLength + 20,
      {
        isStatic: true,
        angle: -leftWallAngle,
        render: { visible: false },
      }
    );

    // Right wall of pyramid (angled, mirrored)
    const rightWallCenterX = centerX + (BUCKET.TOP_WIDTH/2 + BUCKET.BOTTOM_WIDTH/2) / 4;

    const rightWall = Matter.Bodies.rectangle(
      rightWallCenterX + 15,
      leftWallCenterY,
      8,
      leftWallLength + 20,
      {
        isStatic: true,
        angle: leftWallAngle,
        render: { visible: false },
      }
    );

    // Bottom gate (closed)
    const bottomWall = Matter.Bodies.rectangle(
      centerX,
      BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT / 2,
      BUCKET.BOTTOM_WIDTH + 10,
      BUCKET.GATE_HEIGHT + 4,
      {
        isStatic: true,
        render: { visible: false },
      }
    );

    // Narrow tube walls at top
    const tubeLeftWall = Matter.Bodies.rectangle(
      centerX - BUCKET.TOP_WIDTH/2 - 2,
      BUCKET.TOP_Y / 2,
      6,
      BUCKET.TOP_Y + 20,
      {
        isStatic: true,
        render: { visible: false },
      }
    );

    const tubeRightWall = Matter.Bodies.rectangle(
      centerX + BUCKET.TOP_WIDTH/2 + 2,
      BUCKET.TOP_Y / 2,
      6,
      BUCKET.TOP_Y + 20,
      {
        isStatic: true,
        render: { visible: false },
      }
    );

    this.walls = [leftWall, rightWall, bottomWall, tubeLeftWall, tubeRightWall];
    Matter.Composite.add(this.engine.world, this.walls);
  }

  /**
   * Drop a ball into the tunnel from above
   */
  public dropBall(id: number, delay: number = 0): void {
    const { BALL_RADIUS, BUCKET } = TunnelPhysicsEngine;
    const { centerX } = this.options;

    setTimeout(() => {
      // Random starting X within the tube width
      const tubeHalfWidth = BUCKET.TOP_WIDTH / 2 - BALL_RADIUS - 2;
      const startX = centerX + (Math.random() * 2 - 1) * tubeHalfWidth;
      const startY = -20 - Math.random() * 30; // Start above the visible area

      const ball = Matter.Bodies.circle(startX, startY, BALL_RADIUS, {
        restitution: 0.4,  // Less bouncy than board balls
        friction: 0.3,
        frictionAir: 0.02,
        density: 0.001,
        label: `tunnel_ball_${id}`,
      });

      // Give slight random initial velocity
      Matter.Body.setVelocity(ball, {
        x: (Math.random() - 0.5) * 2,
        y: 2 + Math.random() * 2,
      });

      Matter.Composite.add(this.engine.world, ball);
      this.balls.set(id, ball);
    }, delay);
  }

  /**
   * Drop multiple balls with staggered timing
   */
  public dropBalls(count: number, staggerMs: number = 60): void {
    for (let i = 0; i < count; i++) {
      this.dropBall(i, i * staggerMs);
    }
  }

  /**
   * Get current states of all balls
   */
  public getBallStates(): Map<number, TunnelBallState> {
    const states = new Map<number, TunnelBallState>();
    for (const [id, ball] of this.balls) {
      states.set(id, {
        x: ball.position.x,
        y: ball.position.y,
        rotation: ball.angle * (180 / Math.PI),
      });
    }
    return states;
  }

  /**
   * Check if all balls have settled (low velocity)
   */
  private checkSettled(): boolean {
    if (this.balls.size === 0) return false;

    const velocityThreshold = 0.3;
    for (const ball of this.balls.values()) {
      const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
      if (speed > velocityThreshold) {
        return false;
      }
    }
    return true;
  }

  public start(): void {
    if (this.animationFrame !== null) return;

    Matter.Runner.run(this.runner, this.engine);

    // Animation loop
    const tick = () => {
      const states = this.getBallStates();
      this.options.onBallUpdate?.(states);
      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);

    // Settle detection
    this.settleCheckInterval = window.setInterval(() => {
      if (!this.hasNotifiedSettled && this.balls.size > 0 && this.checkSettled()) {
        this.hasNotifiedSettled = true;
        this.options.onAllSettled?.();
      }
    }, 100);
  }

  public stop(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.settleCheckInterval !== null) {
      clearInterval(this.settleCheckInterval);
      this.settleCheckInterval = null;
    }
    Matter.Runner.stop(this.runner);
  }

  public destroy(): void {
    this.stop();
    Matter.Engine.clear(this.engine);
    this.balls.clear();
    this.walls = [];
  }

  public hasBalls(): boolean {
    return this.balls.size > 0;
  }

  public getBallCount(): number {
    return this.balls.size;
  }
}
