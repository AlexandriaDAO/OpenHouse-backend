import Matter from 'matter-js';
import { PLINKO_LAYOUT } from './plinkoAnimations';

export interface BallState {
  x: number;
  y: number;
  rotation: number;
}

export interface PhysicsEngineOptions {
  rows: number;
  width: number;
  height: number;
  onBallUpdate?: (id: number, state: BallState) => void;
  onBallLanded?: (id: number, slotIndex: number) => void;
}

/**
 * Plinko physics engine matching open source implementation exactly.
 * https://github.com/AnsonH/plinko-game
 */
export class PlinkoPhysicsEngine {
  private engine: Matter.Engine;
  private runner: Matter.Runner;
  private balls: Map<number, Matter.Body> = new Map();
  private pins: Matter.Body[] = [];
  private walls: Matter.Body[] = [];
  private sensor: Matter.Body | null = null;
  private options: PhysicsEngineOptions;
  private animationFrame: number | null = null;

  // Store last row pin X positions for bin calculation
  private pinsLastRowXCoords: number[] = [];

  // Collision categories (matching open source)
  private static PIN_CATEGORY = 0x0001;
  private static BALL_CATEGORY = 0x0002;

  // Ball friction by row count (from open source, tuned for expected payout)
  private static frictionAirByRowCount: Record<number, number> = {
    8: 0.0395,
    9: 0.041,
    10: 0.038,
    11: 0.0355,
    12: 0.0414,
    13: 0.0437,
    14: 0.0401,
    15: 0.0418,
    16: 0.0364,
  };

  constructor(options: PhysicsEngineOptions) {
    this.options = options;

    this.engine = Matter.Engine.create({
      timing: { timeScale: 1 },
    });

    this.runner = Matter.Runner.create();

    this.placePinsAndWalls();
    this.createSensor();
    this.setupCollisionHandling();
  }

  // Calculate pin distance X (matching open source)
  private get pinDistanceX(): number {
    const { rows, width } = this.options;
    const lastRowPinCount = 2 + rows; // 3 + (rows - 1)
    return (width - PLINKO_LAYOUT.PADDING_X * 2) / (lastRowPinCount - 1);
  }

  // Pin radius scales with row count (matching open source, scaled for our canvas)
  // Open source: (24 - rows) / 2 on 760px canvas
  // Our canvas is 400px, scale factor = 400/760 ≈ 0.53
  private get pinRadius(): number {
    const baseRadius = (24 - this.options.rows) / 2;
    return baseRadius * 0.53; // Scale down for our smaller canvas
  }

  /**
   * Place pins using EXACT same formula as open source PlinkoEngine.ts
   */
  private placePinsAndWalls() {
    const { rows, width, height } = this.options;
    const { PADDING_X, PADDING_TOP, PADDING_BOTTOM } = PLINKO_LAYOUT;
    const { PIN_CATEGORY, BALL_CATEGORY } = PlinkoPhysicsEngine;

    // Clear existing
    if (this.pins.length > 0) {
      Matter.Composite.remove(this.engine.world, this.pins);
      this.pins = [];
    }
    if (this.walls.length > 0) {
      Matter.Composite.remove(this.engine.world, this.walls);
      this.walls = [];
    }
    this.pinsLastRowXCoords = [];

    // Create pins (matching open source formula exactly)
    for (let row = 0; row < rows; row++) {
      // Y position: evenly distributed
      const rowY = PADDING_TOP + ((height - PADDING_TOP - PADDING_BOTTOM) / (rows - 1)) * row;

      // Horizontal padding for this row
      const rowPaddingX = PADDING_X + ((rows - 1 - row) * this.pinDistanceX) / 2;

      // Each row has 3 + row pins
      const pinsInRow = 3 + row;

      for (let col = 0; col < pinsInRow; col++) {
        const colX = rowPaddingX + ((width - rowPaddingX * 2) / (pinsInRow - 1)) * col;

        const pin = Matter.Bodies.circle(colX, rowY, this.pinRadius, {
          isStatic: true,
          collisionFilter: {
            category: PIN_CATEGORY,
            mask: BALL_CATEGORY,
          },
          label: `pin_${row}_${col}`,
        });
        this.pins.push(pin);

        // Store last row X positions for bin detection
        if (row === rows - 1) {
          this.pinsLastRowXCoords.push(colX);
        }
      }
    }
    Matter.Composite.add(this.engine.world, this.pins);

    // Create walls (matching open source formula exactly)
    const firstPinX = this.pins[0].position.x;
    const leftWallAngle = Math.atan2(
      firstPinX - this.pinsLastRowXCoords[0],
      height - PADDING_TOP - PADDING_BOTTOM
    );
    const leftWallX = firstPinX - (firstPinX - this.pinsLastRowXCoords[0]) / 2 - this.pinDistanceX * 0.25;

    const leftWall = Matter.Bodies.rectangle(
      leftWallX,
      height / 2,
      10,
      height,
      {
        isStatic: true,
        angle: leftWallAngle,
        render: { visible: false },
      }
    );

    const rightWall = Matter.Bodies.rectangle(
      width - leftWallX,
      height / 2,
      10,
      height,
      {
        isStatic: true,
        angle: -leftWallAngle,
        render: { visible: false },
      }
    );

    this.walls = [leftWall, rightWall];
    Matter.Composite.add(this.engine.world, this.walls);
  }

  private createSensor() {
    const { width, height } = this.options;

    // Sensor at bottom of canvas (matching open source)
    this.sensor = Matter.Bodies.rectangle(
      width / 2,
      height,
      width,
      10,
      {
        isSensor: true,
        isStatic: true,
        render: { visible: false },
      }
    );
    Matter.Composite.add(this.engine.world, this.sensor);
  }

  private setupCollisionHandling() {
    Matter.Events.on(this.engine, 'collisionStart', ({ pairs }) => {
      pairs.forEach(({ bodyA, bodyB }) => {
        if (bodyA === this.sensor) {
          this.handleBallEnterBin(bodyB);
        } else if (bodyB === this.sensor) {
          this.handleBallEnterBin(bodyA);
        }
      });
    });
  }

  private handleBallEnterBin(ball: Matter.Body) {
    // Find bin index (matching open source logic)
    const binIndex = this.pinsLastRowXCoords.findLastIndex((pinX) => pinX < ball.position.x);

    if (binIndex !== -1 && binIndex < this.pinsLastRowXCoords.length - 1) {
      const ballId = this.getBallIdFromBody(ball);
      if (ballId !== null) {
        this.options.onBallLanded?.(ballId, binIndex);
      }
    }

    // Remove ball from world
    Matter.Composite.remove(this.engine.world, ball);

    const ballId = this.getBallIdFromBody(ball);
    if (ballId !== null) {
      this.balls.delete(ballId);
    }
  }

  private getBallIdFromBody(body: Matter.Body): number | null {
    for (const [id, b] of this.balls) {
      if (b === body) return id;
    }
    return null;
  }

  public dropBall(id: number, _path: boolean[]): void {
    const { rows, width } = this.options;
    const { BALL_START_Y } = PLINKO_LAYOUT;

    // Ball offset range (matching open source: pinDistanceX * 0.8)
    const ballOffsetRangeX = this.pinDistanceX * 0.8;
    const ballRadius = this.pinRadius * 2;

    // Random position within range (matching open source getRandomBetween)
    const minX = width / 2 - ballOffsetRangeX;
    const maxX = width / 2 + ballOffsetRangeX;
    const startX = minX + Math.random() * (maxX - minX);

    const frictionAir = PlinkoPhysicsEngine.frictionAirByRowCount[rows] ?? 0.04;

    // Start balls just below the release tunnel
    const ball = Matter.Bodies.circle(startX, BALL_START_Y, ballRadius, {
      restitution: 0.8,  // Bounciness (matching open source)
      friction: 0.5,     // Friction (matching open source)
      frictionAir: frictionAir,
      collisionFilter: {
        category: PlinkoPhysicsEngine.BALL_CATEGORY,
        mask: PlinkoPhysicsEngine.PIN_CATEGORY, // Only collide with pins, NOT walls or other balls
      },
      label: `ball_${id}`,
    });

    Matter.Composite.add(this.engine.world, ball);
    this.balls.set(id, ball);
  }

  public removeBall(id: number): void {
    const ball = this.balls.get(id);
    if (ball) {
      Matter.Composite.remove(this.engine.world, ball);
      this.balls.delete(id);
    }
  }

  public getBallState(id: number): BallState | null {
    const ball = this.balls.get(id);
    if (!ball) return null;

    return {
      x: ball.position.x,
      y: ball.position.y,
      rotation: ball.angle * (180 / Math.PI),
    };
  }

  public start(): void {
    if (this.animationFrame !== null) return;

    // Start physics runner (matching open source)
    Matter.Runner.run(this.runner, this.engine);

    // Animation loop to report ball positions
    const tick = () => {
      for (const [id] of this.balls) {
        const state = this.getBallState(id);
        if (state) {
          this.options.onBallUpdate?.(id, state);
        }
      }
      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  public stop(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    Matter.Runner.stop(this.runner);
  }

  public destroy(): void {
    this.stop();
    Matter.Engine.clear(this.engine);
    this.balls.clear();
    this.pins = [];
    this.walls = [];
    this.pinsLastRowXCoords = [];
  }

  public hasBalls(): boolean {
    return this.balls.size > 0;
  }
}
