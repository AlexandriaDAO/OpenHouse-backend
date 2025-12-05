import { Application, Container } from 'pixi.js';
import { LAYOUT, calculateScale, getBoardDimensions } from './LayoutConfig';
import { PegRenderer } from './PegRenderer';
import { SlotRenderer } from './SlotRenderer';
import { BallRenderer } from './BallRenderer';
import { BucketRenderer } from './BucketRenderer';

export type GamePhase = 'idle' | 'filling' | 'releasing' | 'animating' | 'complete';

export interface PlinkoAppConfig {
  rows: number;
  multipliers: number[];
  onBallLanded?: (ballId: number, slot: number) => void;
  onAllBallsLanded?: () => void;
  onDrop?: () => void;
}

export class PlinkoPixiApp {
  private app: Application;
  private config: PlinkoAppConfig;
  private scale: number = 1;
  private centerX: number = 0;

  // Containers (z-order)
  private mainContainer: Container;
  private pegRenderer: PegRenderer;
  private slotRenderer: SlotRenderer;
  private ballRenderer: BallRenderer;
  private bucketRenderer: BucketRenderer;

  private isInitialized = false;
  private containerWidth = 0;
  private containerHeight = 0;

  constructor(config: PlinkoAppConfig) {
    this.config = config;
    this.app = new Application();
    this.mainContainer = new Container();

    this.pegRenderer = new PegRenderer(config.rows);
    this.slotRenderer = new SlotRenderer(config.rows, config.multipliers);
    this.ballRenderer = new BallRenderer(config.rows, config.onBallLanded);
    this.bucketRenderer = new BucketRenderer();
  }

  async init(container: HTMLElement): Promise<void> {
    const rect = container.getBoundingClientRect();
    // Ensure minimum dimensions for valid WebGL context
    this.containerWidth = Math.max(rect.width, 100);
    this.containerHeight = Math.max(rect.height, 100);

    try {
      await this.app.init({
        width: this.containerWidth,
        height: this.containerHeight,
        backgroundColor: 0x0a0a14,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: 'webgl', // Prefer WebGL over WebGPU for better compatibility
      });
    } catch (err) {
      console.error('Pixi.js initialization failed:', err);
      // Try again with canvas fallback
      await this.app.init({
        width: this.containerWidth,
        height: this.containerHeight,
        backgroundColor: 0x0a0a14,
        antialias: false,
        resolution: 1,
        preference: 'webgl',
      });
    }

    container.appendChild(this.app.canvas);
    this.app.stage.addChild(this.mainContainer);

    // Calculate initial scale and center
    this.updateLayout();

    // Initialize renderers
    await this.pegRenderer.init(this.mainContainer, this.centerX);
    await this.slotRenderer.init(this.mainContainer, this.centerX, this.config.rows);
    await this.ballRenderer.init(this.mainContainer, this.centerX);
    await this.bucketRenderer.init(this.mainContainer, this.centerX);
    if (this.config.onDrop) {
      this.bucketRenderer.setOnClick(this.config.onDrop);
    }

    // Apply initial scale
    this.applyScale();

    // Start render loop
    this.app.ticker.add(this.update.bind(this));

    this.isInitialized = true;
  }

  private updateLayout(): void {
    const { rows } = this.config;
    const dims = getBoardDimensions(rows);
    this.scale = calculateScale(this.containerWidth, this.containerHeight, rows);
    this.centerX = dims.width / 2;
  }

  private applyScale(): void {
    this.mainContainer.scale.set(this.scale);
    // Center the scaled content
    const dims = getBoardDimensions(this.config.rows);
    const scaledWidth = dims.width * this.scale;
    const scaledHeight = dims.height * this.scale;
    this.mainContainer.position.set(
      (this.containerWidth - scaledWidth) / 2,
      (this.containerHeight - scaledHeight) / 2
    );
  }

  resize(width: number, height: number): void {
    if (!this.isInitialized) return;

    this.containerWidth = width;
    this.containerHeight = height;
    this.app.renderer.resize(width, height);
    this.updateLayout();
    this.applyScale();
  }

  private update(ticker: { deltaMS: number }): void {
    const delta = ticker.deltaMS;
    this.ballRenderer.update(delta);
    this.bucketRenderer.update(delta);

    // Check if all balls landed
    if (this.ballRenderer.areAllLanded() && this.ballRenderer.getBallCount() > 0) {
      this.config.onAllBallsLanded?.();
    }
  }

  // Game phase controls
  setGamePhase(phase: GamePhase): void {
    switch (phase) {
      case 'idle':
        this.ballRenderer.clear();
        this.bucketRenderer.reset();
        this.slotRenderer.clearHighlights();
        this.bucketRenderer.setInteractive(true);
        break;
      case 'filling':
        // Bucket will handle filling via fillBucket()
        this.bucketRenderer.setInteractive(false);
        break;
      case 'releasing':
        this.bucketRenderer.openDoor();
        this.bucketRenderer.setInteractive(false);
        break;
      case 'animating':
        // Balls are dropped via dropBalls()
        this.bucketRenderer.setInteractive(false);
        break;
      case 'complete':
        this.bucketRenderer.closeDoor();
        this.bucketRenderer.setInteractive(false);
        break;
    }
  }

  // Fill bucket with balls (visual only)
  fillBucket(count: number): void {
    this.bucketRenderer.fillBucket(count);
  }

  // Drop balls through the board
  dropBalls(paths: boolean[][]): void {
    paths.forEach((path, index) => {
      setTimeout(() => {
        this.ballRenderer.dropBall(index, path);
      }, index * LAYOUT.BALL_STAGGER_MS);
    });
  }

  // Highlight landing slots
  highlightSlots(positions: number[]): void {
    this.slotRenderer.highlightSlots(positions);
  }

  // Update multipliers (if they change)
  updateMultipliers(multipliers: number[]): void {
    this.slotRenderer.updateMultipliers(multipliers);
  }

  // Cleanup
  destroy(): void {
    this.app.ticker.stop();
    this.pegRenderer.destroy();
    this.slotRenderer.destroy();
    this.ballRenderer.destroy();
    this.bucketRenderer.destroy();
    this.app.destroy(true, { children: true, texture: true });
  }
}
