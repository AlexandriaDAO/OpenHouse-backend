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

  // Store target slot for each ball (derived from backend path)
  private ballTargets: Map<number, number> = new Map();

  // Stuck ball detection - track last positions and timestamps
  private ballLastPositions: Map<number, { x: number; y: number; time: number }> = new Map();
  private static STUCK_THRESHOLD_MS = 2000; // Ball considered stuck after 2 seconds without progress
  private static STUCK_DISTANCE_THRESHOLD = 5; // Minimum movement in pixels to be considered "progressing"

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

    // Steering system: gently guide balls toward their target slots + stuck ball detection
    Matter.Events.on(this.engine, 'beforeUpdate', () => {
      this.applySteeringForces();
      this.checkForStuckBalls();
    });
  }

  /**
   * Calculate the target X position for a given slot index.
   * Slots are centered between consecutive last-row pins.
   */
  private getSlotCenterX(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= this.pinsLastRowXCoords.length - 1) {
      return this.options.width / 2;
    }
    return (this.pinsLastRowXCoords[slotIndex] + this.pinsLastRowXCoords[slotIndex + 1]) / 2;
  }

  /**
   * Apply gentle steering forces to guide balls toward their target slots.
   * The force increases as the ball descends to ensure correct landing.
   */
  private applySteeringForces() {
    const { height } = this.options;
    const { PADDING_TOP, PADDING_BOTTOM } = PLINKO_LAYOUT;

    // Play area bounds
    const topY = PADDING_TOP;
    const bottomY = height - PADDING_BOTTOM;
    const playHeight = bottomY - topY;

    for (const [id, ball] of this.balls) {
      const targetSlot = this.ballTargets.get(id);
      if (targetSlot === undefined) continue;

      const targetX = this.getSlotCenterX(targetSlot);
      const ballX = ball.position.x;
      const ballY = ball.position.y;

      // Calculate descent progress (0 at top, 1 at bottom)
      const progress = Math.max(0, Math.min(1, (ballY - topY) / playHeight));

      // Only start steering after ball has descended 30% (let physics dominate early)
      if (progress < 0.3) continue;

      // Distance from target
      const deltaX = targetX - ballX;

      // Skip if already very close to target
      if (Math.abs(deltaX) < 2) continue;

      // Steering force parameters:
      // - Base force is subtle (0.00001)
      // - Force increases quadratically with descent progress
      // - Force is proportional to distance from target (capped)
      const progressFactor = Math.pow((progress - 0.3) / 0.7, 2); // 0 at 30%, 1 at 100%
      const baseForceMagnitude = 0.00002;
      const maxForce = 0.0002;

      // Calculate force magnitude (stronger when further from target, stronger near bottom)
      let forceMagnitude = baseForceMagnitude * progressFactor * Math.min(Math.abs(deltaX), 50);
      forceMagnitude = Math.min(forceMagnitude, maxForce);

      // Apply horizontal force in direction of target
      const forceX = Math.sign(deltaX) * forceMagnitude;

      Matter.Body.applyForce(ball, ball.position, { x: forceX, y: 0 });

      // Bounds checking: prevent ball from going outside the pin grid
      // Get the bounds from the last row pins (widest point)
      const minX = this.pinsLastRowXCoords[0] - this.pinDistanceX * 0.3;
      const maxX = this.pinsLastRowXCoords[this.pinsLastRowXCoords.length - 1] + this.pinDistanceX * 0.3;

      // If ball is outside bounds, apply corrective force
      if (ballX < minX) {
        Matter.Body.applyForce(ball, ball.position, { x: 0.0005, y: 0 });
      } else if (ballX > maxX) {
        Matter.Body.applyForce(ball, ball.position, { x: -0.0005, y: 0 });
      }
    }
  }

  /**
   * Check for stuck balls and force them to land if they haven't moved.
   * A ball is considered stuck if it hasn't moved significantly for STUCK_THRESHOLD_MS.
   */
  private checkForStuckBalls() {
    const now = Date.now();
    const { height } = this.options;
    const { PADDING_BOTTOM } = PLINKO_LAYOUT;
    const bottomY = height - PADDING_BOTTOM;

    for (const [id, ball] of this.balls) {
      const ballX = ball.position.x;
      const ballY = ball.position.y;

      const lastPos = this.ballLastPositions.get(id);

      if (lastPos) {
        const dx = Math.abs(ballX - lastPos.x);
        const dy = Math.abs(ballY - lastPos.y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if ball is stuck (hasn't moved enough) OR is out of bounds
        const isStuck = distance < PlinkoPhysicsEngine.STUCK_DISTANCE_THRESHOLD &&
                        (now - lastPos.time) > PlinkoPhysicsEngine.STUCK_THRESHOLD_MS;

        const isOutOfBounds = ballX < 0 || ballX > this.options.width ||
                              ballY > height + 50; // Allow some overshoot

        // Also check if ball is near the bottom but trapped (common stuck scenario)
        const isNearBottom = ballY > bottomY - 20;
        const isNearBottomAndSlow = isNearBottom &&
                                    Math.abs(ball.velocity.y) < 0.5 &&
                                    (now - lastPos.time) > 1500;

        if (isStuck || isOutOfBounds || isNearBottomAndSlow) {
          console.log(`[Plinko] Ball ${id} detected as stuck. Forcing landing. Reason: ${isStuck ? 'no movement' : isOutOfBounds ? 'out of bounds' : 'near bottom and slow'}`);
          this.forceLandBall(id, ball);
          continue;
        }

        // Ball is still moving, update position if it moved significantly
        if (distance >= PlinkoPhysicsEngine.STUCK_DISTANCE_THRESHOLD) {
          this.ballLastPositions.set(id, { x: ballX, y: ballY, time: now });
        }
      } else {
        // First time tracking this ball
        this.ballLastPositions.set(id, { x: ballX, y: ballY, time: now });
      }
    }
  }

  /**
   * Force a stuck ball to land in its target slot.
   */
  private forceLandBall(id: number, ball: Matter.Body) {
    const targetSlot = this.ballTargets.get(id);
    const binIndex = targetSlot !== undefined ? targetSlot :
                     this.pinsLastRowXCoords.findLastIndex((pinX) => pinX < ball.position.x);

    const validBinIndex = binIndex !== -1 && binIndex < this.pinsLastRowXCoords.length - 1
                          ? binIndex : Math.floor(this.pinsLastRowXCoords.length / 2);

    // Notify landing
    this.options.onBallLanded?.(id, validBinIndex);

    // Clean up ball
    Matter.Composite.remove(this.engine.world, ball);
    this.balls.delete(id);
    this.ballTargets.delete(id);
    this.ballLastPositions.delete(id);
  }

  private handleBallEnterBin(ball: Matter.Body) {
    const ballId = this.getBallIdFromBody(ball);

    // Use the backend-determined target slot instead of physics-detected bin
    // This ensures the visual landing matches the actual payout
    const targetSlot = ballId !== null ? this.ballTargets.get(ballId) : undefined;

    // Fall back to physics detection only if no target was set
    const binIndex = targetSlot !== undefined
      ? targetSlot
      : this.pinsLastRowXCoords.findLastIndex((pinX) => pinX < ball.position.x);

    if (binIndex !== -1 && binIndex < this.pinsLastRowXCoords.length - 1) {
      if (ballId !== null) {
        this.options.onBallLanded?.(ballId, binIndex);
      }
    }

    // Remove ball from world
    Matter.Composite.remove(this.engine.world, ball);

    // Clean up tracking
    if (ballId !== null) {
      this.balls.delete(ballId);
      this.ballTargets.delete(ballId);
      this.ballLastPositions.delete(ballId);
    }
  }

  private getBallIdFromBody(body: Matter.Body): number | null {
    for (const [id, b] of this.balls) {
      if (b === body) return id;
    }
    return null;
  }

  public dropBall(
    id: number,
    path: boolean[],
    initialState?: { x: number; y: number; vx: number; vy: number }
  ): void {
    const { rows, width } = this.options;
    const { BALL_START_Y } = PLINKO_LAYOUT;

    // Calculate target slot from backend path (count of "right" moves = final position)
    const targetSlot = path.filter(v => v).length;
    this.ballTargets.set(id, targetSlot);

    const ballRadius = this.pinRadius * 2;
    const frictionAir = PlinkoPhysicsEngine.frictionAirByRowCount[rows] ?? 0.04;

    // Determine start position
    let startX: number;
    let startY: number;
    let initialVelocity = { x: 0, y: 0 };

    if (initialState) {
      // Use provided position and velocity from tunnel
      startX = initialState.x;
      startY = initialState.y;
      initialVelocity = { x: initialState.vx, y: initialState.vy };
    } else {
      // Default behavior: random X at BALL_START_Y
      const ballOffsetRangeX = this.pinDistanceX * 0.8;
      const minX = width / 2 - ballOffsetRangeX;
      const maxX = width / 2 + ballOffsetRangeX;
      startX = minX + Math.random() * (maxX - minX);
      startY = BALL_START_Y;
    }

    const ball = Matter.Bodies.circle(startX, startY, ballRadius, {
      restitution: 0.8,  // Bounciness (matching open source)
      friction: 0.5,     // Friction (matching open source)
      frictionAir: frictionAir,
      collisionFilter: {
        category: PlinkoPhysicsEngine.BALL_CATEGORY,
        mask: PlinkoPhysicsEngine.PIN_CATEGORY, // Only collide with pins, NOT walls or other balls
      },
      label: `ball_${id}`,
    });

    // Apply initial velocity if provided
    if (initialState) {
      Matter.Body.setVelocity(ball, initialVelocity);
    }

    Matter.Composite.add(this.engine.world, ball);
    this.balls.set(id, ball);
  }

  public removeBall(id: number): void {
    const ball = this.balls.get(id);
    if (ball) {
      Matter.Composite.remove(this.engine.world, ball);
      this.balls.delete(id);
      this.ballTargets.delete(id);
      this.ballLastPositions.delete(id);
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
    this.ballTargets.clear();
    this.ballLastPositions.clear();
    this.pins = [];
    this.walls = [];
    this.pinsLastRowXCoords = [];
  }

  public hasBalls(): boolean {
    return this.balls.size > 0;
  }
}
