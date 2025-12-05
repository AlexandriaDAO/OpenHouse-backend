import { Application, Container } from 'pixi.js';
import { LAYOUT, getCenterX } from './LayoutConfig';
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
  private centerX: number;

  // Containers (z-order)
  private mainContainer: Container;
  private pegRenderer: PegRenderer;
  private slotRenderer: SlotRenderer;
  private ballRenderer: BallRenderer;
  private bucketRenderer: BucketRenderer;

  private isInitialized = false;

  constructor(config: PlinkoAppConfig) {
    this.config = config;
    this.app = new Application();
    this.mainContainer = new Container();
    this.centerX = getCenterX();

    this.pegRenderer = new PegRenderer(config.rows);
    this.slotRenderer = new SlotRenderer(config.rows, config.multipliers);
    this.ballRenderer = new BallRenderer(config.rows, config.onBallLanded);
    this.bucketRenderer = new BucketRenderer();
  }

  async init(container: HTMLElement): Promise<void> {
    try {
      // Fixed internal canvas size - no dynamic scaling
      await this.app.init({
        width: LAYOUT.CANVAS_WIDTH,
        height: LAYOUT.CANVAS_HEIGHT,
        backgroundColor: 0x0a0a14,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: 'webgl',
        powerPreference: 'default',
      });
    } catch (err) {
      console.error('Pixi.js WebGL initialization failed, trying with lower settings:', err);
      try {
        await this.app.init({
          width: LAYOUT.CANVAS_WIDTH,
          height: LAYOUT.CANVAS_HEIGHT,
          backgroundColor: 0x0a0a14,
          antialias: false,
          resolution: 1,
          autoDensity: false,
          preference: 'webgl',
        });
      } catch (err2) {
        console.error('Pixi.js fallback also failed:', err2);
        throw err2;
      }
    }

    // Handle WebGL context loss
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      console.warn('WebGL context lost, preventing default');
      e.preventDefault();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored');
    });

    // CSS fills container - no need for programmatic resizing
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    container.appendChild(canvas);
    this.app.stage.addChild(this.mainContainer);

    // Initialize renderers with fixed centerX
    await this.pegRenderer.init(this.mainContainer, this.centerX);
    await this.slotRenderer.init(this.mainContainer, this.centerX, this.config.rows);
    await this.ballRenderer.init(this.mainContainer, this.centerX);
    await this.bucketRenderer.init(this.mainContainer, this.centerX);
    if (this.config.onDrop) {
      this.bucketRenderer.setOnClick(this.config.onDrop);
    }

    // Start render loop
    this.app.ticker.add(this.update.bind(this));

    this.isInitialized = true;
  }

  // No resize method needed - CSS handles display scaling

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
