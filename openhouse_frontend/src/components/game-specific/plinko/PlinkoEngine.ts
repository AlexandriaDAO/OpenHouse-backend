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

  // Bucket geometry for unified physics
  private bucketWalls: Matter.Body[] = [];
  private bucketGate: Matter.Body | null = null;
  private isBucketOpen = false;

  // Bucket dimensions (matching TunnelPhysicsEngine for consistency)
  private static BUCKET = {
    TOP_Y: -50, // Extended up to accommodate tall stacks of balls
    BOTTOM_Y: 70,
    WIDTH: 140,
    GATE_HEIGHT: 4,
  };

  // Track expected number of balls for filling phase
  private expectedBallCount: number = 0;

  // Track pending ball creation timeouts to cancel them if needed
  private pendingBallTimeouts: number[] = [];

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
    this.createBucket();
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

  /**
   * Create bucket geometry (walls + gate) for ball filling phase.
   * Balls drop into this bucket and are released when gate opens.
   * Bucket width is calculated to fit within the first row of pins.
   */
  private createBucket() {
    const { BUCKET, PIN_CATEGORY } = PlinkoPhysicsEngine;
    const { rows, width } = this.options;
    const { PADDING_X, PADDING_TOP } = PLINKO_LAYOUT;
    const centerX = width / 2;
    const boxHeight = BUCKET.BOTTOM_Y - BUCKET.TOP_Y;

    // Calculate first row pin positions to size bucket appropriately
    // First row has 3 pins, we want bucket to fit between them
    const rowPaddingX = PADDING_X + ((rows - 1) * this.pinDistanceX) / 2;
    const firstRowFirstPinX = rowPaddingX;
    const firstRowLastPinX = width - rowPaddingX;

    // Make bucket slightly narrower than first row span (with padding for ball radius)
    const bucketWidth = Math.min(BUCKET.WIDTH, (firstRowLastPinX - firstRowFirstPinX) - 20);
    const halfWidth = bucketWidth / 2;

    // Left wall (vertical)
    const leftWall = Matter.Bodies.rectangle(
      centerX - halfWidth - 4,
      BUCKET.TOP_Y + boxHeight / 2,
      8,
      boxHeight + 40, // Extra height to catch balls from above
      {
        isStatic: true,
        collisionFilter: {
          category: PIN_CATEGORY,
          mask: PlinkoPhysicsEngine.BALL_CATEGORY,
        },
        label: 'bucket_left_wall',
      }
    );

    // Right wall (vertical)
    const rightWall = Matter.Bodies.rectangle(
      centerX + halfWidth + 4,
      BUCKET.TOP_Y + boxHeight / 2,
      8,
      boxHeight + 40,
      {
        isStatic: true,
        collisionFilter: {
          category: PIN_CATEGORY,
          mask: PlinkoPhysicsEngine.BALL_CATEGORY,
        },
        label: 'bucket_right_wall',
      }
    );

    // Bottom gate (closed initially)
    const gate = Matter.Bodies.rectangle(
      centerX,
      BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT / 2,
      bucketWidth + 20,
      BUCKET.GATE_HEIGHT + 4,
      {
        isStatic: true,
        collisionFilter: {
          category: PIN_CATEGORY,
          mask: PlinkoPhysicsEngine.BALL_CATEGORY,
        },
        label: 'bucket_gate',
      }
    );

    // Note: Funnel walls removed - they were causing balls to get stuck
    // The angled board walls already guide balls toward the peg area

    this.bucketWalls = [leftWall, rightWall];
    this.bucketGate = gate;
    Matter.Composite.add(this.engine.world, [...this.bucketWalls, gate]);
  }

  /**
   * Calculate the actual bucket width based on first row pin positions.
   */
  private getBucketWidth(): number {
    const { rows, width } = this.options;
    const { PADDING_X } = PLINKO_LAYOUT;
    const { BUCKET } = PlinkoPhysicsEngine;

    const rowPaddingX = PADDING_X + ((rows - 1) * this.pinDistanceX) / 2;
    const firstRowFirstPinX = rowPaddingX;
    const firstRowLastPinX = width - rowPaddingX;

    return Math.min(BUCKET.WIDTH, (firstRowLastPinX - firstRowFirstPinX) - 20);
  }

  /**
   * Drop a ball into the bucket from above.
   * Ball will bounce around in bucket until gate opens.
   */
  public dropBallIntoBucket(id: number, delay: number = 0): void {
    const centerX = this.options.width / 2;
    const bucketWidth = this.getBucketWidth();

    // Internal function to create the ball
    const createBall = () => {
      const boxHalfWidth = bucketWidth / 2 - this.pinRadius * 2 - 4;
      const startX = centerX + (Math.random() * 2 - 1) * boxHalfWidth;
      // Start balls at top of visible bucket area (y=0 to y=20)
      // They'll fall down and pile up on the gate
      const startY = 0 + Math.random() * 20;

      const ball = Matter.Bodies.circle(startX, startY, this.pinRadius * 2, {
        restitution: 0.4, // Less bouncy in bucket
        friction: 0.3,
        frictionAir: 0.02,
        density: 0.001,
        collisionFilter: {
          category: PlinkoPhysicsEngine.BALL_CATEGORY,
          // Collide with pins AND other balls (so they stack properly in bucket)
          mask: PlinkoPhysicsEngine.PIN_CATEGORY | PlinkoPhysicsEngine.BALL_CATEGORY,
        },
        label: `ball_${id}`,
      });

      // Give slight random initial velocity - more horizontal spread
      Matter.Body.setVelocity(ball, {
        x: (Math.random() - 0.5) * 4,  // More horizontal variance
        y: 1 + Math.random() * 2,
      });

      Matter.Composite.add(this.engine.world, ball);
      this.balls.set(id, ball);
    };

    // Create first ball synchronously for instant visual feedback
    // Subsequent balls use setTimeout for staggered entry
    if (delay === 0) {
      createBall();
      // Immediately report ball state to React for instant visual render
      const ball = this.balls.get(id);
      if (ball) {
        this.options.onBallUpdate?.(id, {
          x: ball.position.x,
          y: ball.position.y,
          rotation: ball.angle * (180 / Math.PI),
        });
      }
    } else {
      const timeoutId = window.setTimeout(createBall, delay);
      this.pendingBallTimeouts.push(timeoutId);
    }
  }

  /**
   * Open the bucket gate to release all balls onto the peg board.
   */
  public openBucket(): void {
    if (this.bucketGate && !this.isBucketOpen) {
      Matter.Composite.remove(this.engine.world, this.bucketGate);
      this.bucketGate = null;
      this.isBucketOpen = true;

      // Reset stuck detection timers for all balls so they don't get deleted immediately
      const now = Date.now();
      for (const [id, ball] of this.balls) {
        this.ballLastPositions.set(id, {
          x: ball.position.x,
          y: ball.position.y,
          time: now
        });
      }
    }
  }

  /**
   * Clear all balls from the world and reset tracking.
   * Cancels any pending ball creations.
   */
  public clearAllBalls(): void {
    // Cancel pending timeouts
    this.pendingBallTimeouts.forEach(id => clearTimeout(id));
    this.pendingBallTimeouts = [];

    // Remove all balls from world
    for (const ball of this.balls.values()) {
      Matter.Composite.remove(this.engine.world, ball);
    }

    this.balls.clear();
    this.ballTargets.clear();
    this.ballLastPositions.clear();
  }

  /**
   * Reset bucket for next round (recreate gate and walls).
   */
  public resetBucket(): void {
    // Ensure no leftover balls
    this.clearAllBalls();

    // Remove old walls if exist
    if (this.bucketWalls.length > 0) {
      Matter.Composite.remove(this.engine.world, this.bucketWalls);
    }
    if (this.bucketGate) {
      Matter.Composite.remove(this.engine.world, this.bucketGate);
    }
    this.bucketWalls = [];
    this.bucketGate = null;
    this.isBucketOpen = false;
    this.expectedBallCount = 0; // Reset for next round

    // Recreate bucket for next round
    this.createBucket();
  }

  /**
   * Assign a predetermined path to a ball for steering.
   * Called when backend returns paths, before bucket opens.
   */
  public assignPathToBall(id: number, path: boolean[]): void {
    const targetSlot = path.filter(v => v).length;
    this.ballTargets.set(id, targetSlot);
  }

  /**
   * Set the expected number of balls for the filling phase.
   * Must be called before dropBallIntoBucket to ensure areBallsSettled works correctly.
   */
  public setExpectedBallCount(count: number): void {
    this.expectedBallCount = count;
  }

  /**
   * Check if all balls in bucket have settled (low velocity).
   * Returns false until ALL expected balls have been created AND settled.
   */
  public areBallsSettled(): boolean {
    // Don't settle until all expected balls have been created
    if (this.balls.size < this.expectedBallCount) {
      return false;
    }

    const velocityThreshold = 0.3;
    for (const ball of this.balls.values()) {
      const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
      if (speed > velocityThreshold) {
        return false;
      }
    }
    return this.balls.size > 0;
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
    // Don't check for stuck balls while they are in the bucket (filling phase)
    if (!this.isBucketOpen && this.bucketGate) {
      return;
    }

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
    this.bucketWalls = [];
    this.bucketGate = null;
    this.isBucketOpen = false;
    this.pinsLastRowXCoords = [];
  }

  public hasBalls(): boolean {
    return this.balls.size > 0;
  }
}
