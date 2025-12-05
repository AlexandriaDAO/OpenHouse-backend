import { Application, Container, Ticker } from 'pixi.js';
import { LAYOUT, getCenterX } from './pixi/LayoutConfig';
import { PegRenderer } from './pixi/PegRenderer';
import { SlotRenderer } from './pixi/SlotRenderer';
import { BallRenderer } from './pixi/BallRenderer';
import { BucketRenderer } from './pixi/BucketRenderer';

export type GamePhase = 'idle' | 'filling' | 'releasing' | 'animating' | 'complete';

export interface GameResult {
  finalPositions: number[];
  completed: boolean;
}

export interface PlinkoControllerConfig {
  rows: number;
  multipliers: number[];
  onDropClick?: () => void;
}

export class PlinkoController {
  private app: Application;
  private config: PlinkoControllerConfig;
  private centerX: number;
  private isInitialized = false;

  // Containers
  private mainContainer: Container;

  // Renderers
  private pegRenderer: PegRenderer;
  private slotRenderer: SlotRenderer;
  private ballRenderer: BallRenderer;
  private bucketRenderer: BucketRenderer;

  // Animation state (ALL state lives here, not in React)
  private phase: GamePhase = 'idle';
  private fillProgress = 0;
  private targetBallCount = 0;
  private fillTimer = 0;
  private pendingPaths: boolean[][] = [];
  private droppedBallCount = 0;
  private dropTimer = 0;

  // Completion callback (set per-game)
  private onGameComplete?: (result: GameResult) => void;

  // Timeout tracking for cleanup
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  // Track if completion was already fired
  private completionFired = false;

  constructor(app: Application, config: PlinkoControllerConfig) {
    this.app = app;
    this.config = config;
    this.centerX = getCenterX();
    this.mainContainer = new Container();

    // Initialize renderers
    this.pegRenderer = new PegRenderer(config.rows);
    this.slotRenderer = new SlotRenderer(config.rows, config.multipliers);
    this.ballRenderer = new BallRenderer(config.rows, this.handleBallLanded.bind(this));
    this.bucketRenderer = new BucketRenderer();
  }

  async init(): Promise<void> {
    // Add main container to stage
    this.app.stage.addChild(this.mainContainer);

    // Initialize all renderers
    await this.pegRenderer.init(this.mainContainer, this.centerX);
    await this.slotRenderer.init(this.mainContainer, this.centerX, this.config.rows);
    await this.ballRenderer.init(this.mainContainer, this.centerX);
    await this.bucketRenderer.init(this.mainContainer, this.centerX);

    // Set up bucket click handler
    if (this.config.onDropClick) {
      this.bucketRenderer.setOnClick(() => {
        if (this.phase === 'idle') {
          this.config.onDropClick?.();
        }
      });
    }

    // Enable bucket interaction
    this.bucketRenderer.setInteractive(true);

    // Start ticker
    this.app.ticker.add(this.update, this);

    this.isInitialized = true;
  }

  // ============================================
  // PUBLIC API - React calls these methods
  // ============================================

  /**
   * Start a new game. React calls this ONCE with paths from backend.
   * Controller handles entire animation sequence autonomously.
   */
  startGame(paths: boolean[][], ballCount: number, onComplete: (result: GameResult) => void): void {
    if (this.phase !== 'idle') {
      console.warn('Cannot start game while another is in progress');
      return;
    }

    // Store completion callback
    this.onGameComplete = onComplete;

    // Store game config
    this.pendingPaths = paths;
    this.targetBallCount = ballCount;

    // Reset animation state
    this.fillProgress = 0;
    this.fillTimer = 0;
    this.droppedBallCount = 0;
    this.dropTimer = 0;
    this.completionFired = false;

    // Clear any pending timeouts from previous games
    this.clearPendingTimeouts();

    // Clear previous balls and highlights
    this.ballRenderer.clear();
    this.slotRenderer.clearHighlights();

    // Transition to filling phase
    this.phase = 'filling';
    this.bucketRenderer.setInteractive(false);

    // Start bucket fill animation
    this.bucketRenderer.fillBucket(ballCount);
  }

  /**
   * Update multipliers (called when backend returns different values)
   */
  updateMultipliers(multipliers: number[]): void {
    this.config.multipliers = multipliers;
    this.slotRenderer.updateMultipliers(multipliers);
  }

  /**
   * Set interactive state of drop bucket
   */
  setDropEnabled(enabled: boolean): void {
    if (this.phase === 'idle') {
      this.bucketRenderer.setInteractive(enabled);
    }
  }

  /**
   * Get current game phase
   */
  getPhase(): GamePhase {
    return this.phase;
  }

  // ============================================
  // TICKER UPDATE - All animation logic here
  // ============================================

  private update(ticker: Ticker): void {
    const delta = ticker.deltaMS;

    // Update renderers (they have their own animations)
    this.ballRenderer.update(delta);
    this.bucketRenderer.update(delta);

    // Phase-specific updates
    switch (this.phase) {
      case 'filling':
        this.updateFilling(delta);
        break;
      case 'releasing':
        this.updateReleasing();
        break;
      case 'animating':
        this.updateAnimating(delta);
        break;
      case 'complete':
        this.updateComplete();
        break;
    }
  }

  private updateFilling(delta: number): void {
    // Fill bucket with balls over ~1.2 seconds
    const intervalTime = Math.max(40, 1200 / this.targetBallCount);
    this.fillTimer += delta;

    if (this.fillTimer >= intervalTime) {
      this.fillTimer -= intervalTime;
      this.fillProgress++;

      // Check if fill complete
      if (this.fillProgress >= this.targetBallCount) {
        // Transition to releasing
        this.phase = 'releasing';
        this.bucketRenderer.openDoor();
      }
    }
  }

  private updateReleasing(): void {
    // Wait for door to open
    // BucketRenderer.update() handles door animation
    // Check if door is fully open
    if (this.bucketRenderer.isDoorFullyOpen()) {
      // Transition to animating - start dropping balls
      this.phase = 'animating';
      this.droppedBallCount = 0;
      this.dropTimer = 0;
    }
  }

  private updateAnimating(delta: number): void {
    // Drop balls with stagger
    if (this.droppedBallCount < this.pendingPaths.length) {
      this.dropTimer += delta;

      if (this.dropTimer >= LAYOUT.BALL_STAGGER_MS || this.droppedBallCount === 0) {
        this.dropTimer = 0;
        const path = this.pendingPaths[this.droppedBallCount];
        this.ballRenderer.dropBall(this.droppedBallCount, path);
        this.droppedBallCount++;
      }
    }

    // Check if all balls have landed
    if (this.ballRenderer.areAllLanded() && this.ballRenderer.getBallCount() > 0) {
      // Highlight landing slots
      const positions = this.pendingPaths.map(path => path.filter(v => v).length);
      this.slotRenderer.highlightSlots(positions);

      // Transition to complete
      this.phase = 'complete';
    }
  }

  private updateComplete(): void {
    // Fire completion callback once
    if (!this.completionFired && this.onGameComplete) {
      this.completionFired = true;
      const positions = this.pendingPaths.map(path => path.filter(v => v).length);
      this.onGameComplete({
        finalPositions: positions,
        completed: true
      });
      this.onGameComplete = undefined;
    }

    // Schedule reset to idle
    if (this.completionFired && this.pendingTimeouts.length === 0) {
      const timeoutId = setTimeout(() => {
        this.reset();
      }, 500);
      this.pendingTimeouts.push(timeoutId);
    }
  }

  private handleBallLanded(_ballId: number, _slot: number): void {
    // Individual ball landed - can add effects here if needed
  }

  private reset(): void {
    this.phase = 'idle';
    this.ballRenderer.clear();
    this.bucketRenderer.reset();
    this.slotRenderer.clearHighlights();
    this.bucketRenderer.setInteractive(true);
    this.pendingPaths = [];
    this.fillProgress = 0;
    this.targetBallCount = 0;
    this.pendingTimeouts = [];
  }

  private clearPendingTimeouts(): void {
    this.pendingTimeouts.forEach(id => clearTimeout(id));
    this.pendingTimeouts = [];
  }

  // ============================================
  // CLEANUP
  // ============================================

  destroy(): void {
    this.clearPendingTimeouts();
    this.app.ticker.remove(this.update, this);
    this.pegRenderer.destroy();
    this.slotRenderer.destroy();
    this.ballRenderer.destroy();
    this.bucketRenderer.destroy();
    this.mainContainer.removeFromParent();
    this.mainContainer.destroy({ children: true });
  }
}
