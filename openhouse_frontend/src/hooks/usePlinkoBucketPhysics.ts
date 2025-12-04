import { useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';

interface BucketPhysicsConfig {
  width: number;
  height: number;
  ballRadius: number;
}

const DEFAULT_CONFIG: BucketPhysicsConfig = {
  width: 100,
  height: 55,
  ballRadius: 6,
};

export function usePlinkoBucketPhysics(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  config: BucketPhysicsConfig = DEFAULT_CONFIG
) {
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const ballsRef = useRef<Matter.Body[]>([]);

  // Initialize Matter.js engine for bucket
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = config.width;
    canvas.height = config.height;

    // Create engine with higher gravity for bouncy feel
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1.2 }
    });
    engineRef.current = engine;

    // Create renderer
    const render = Matter.Render.create({
      canvas: canvas,
      engine: engine,
      options: {
        width: config.width,
        height: config.height,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio || 1
      }
    });
    renderRef.current = render;

    // Create bucket walls (invisible)
    const wallThickness = 10;
    const walls = [
      // Left wall
      Matter.Bodies.rectangle(
        -wallThickness / 2,
        config.height / 2,
        wallThickness,
        config.height,
        { isStatic: true, render: { visible: false } }
      ),
      // Right wall
      Matter.Bodies.rectangle(
        config.width + wallThickness / 2,
        config.height / 2,
        wallThickness,
        config.height,
        { isStatic: true, render: { visible: false } }
      ),
      // Bottom wall (above the door)
      Matter.Bodies.rectangle(
        config.width / 2,
        config.height + wallThickness / 2,
        config.width,
        wallThickness,
        { isStatic: true, render: { visible: false } }
      ),
    ];

    Matter.Composite.add(engine.world, walls);

    // Create runner
    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      Matter.Composite.clear(engine.world, false);
      ballsRef.current = [];
    };
  }, [config.width, config.height]);

  // Add a ball to the bucket
  const addBall = useCallback(() => {
    if (!engineRef.current) return;

    // Random x position near center
    const x = config.width / 2 + (Math.random() - 0.5) * 30;

    const ball = Matter.Bodies.circle(
      x,
      -config.ballRadius * 2, // Start above canvas
      config.ballRadius,
      {
        restitution: 0.6, // Bouncy
        friction: 0.05,
        frictionAir: 0.01,
        density: 0.002,
        render: {
          fillStyle: '#d4a817',
          strokeStyle: '#b8860b',
          lineWidth: 1
        }
      }
    );

    // Small random initial velocity
    Matter.Body.setVelocity(ball, {
      x: (Math.random() - 0.5) * 2,
      y: 2
    });

    Matter.Composite.add(engineRef.current.world, ball);
    ballsRef.current.push(ball);
  }, [config.width, config.ballRadius]);

  // Add multiple balls with stagger
  const fillBucket = useCallback((count: number, onComplete?: () => void) => {
    let added = 0;
    const interval = setInterval(() => {
      if (added >= count) {
        clearInterval(interval);
        onComplete?.();
        return;
      }
      addBall();
      added++;
    }, 150); // 150ms between balls

    return () => clearInterval(interval);
  }, [addBall]);

  // Clear all balls from bucket
  const clearBalls = useCallback(() => {
    if (!engineRef.current) return;

    ballsRef.current.forEach(ball => {
      Matter.Composite.remove(engineRef.current!.world, ball);
    });
    ballsRef.current = [];
  }, []);

  // Release balls (remove bottom wall so they fall through)
  const releaseBalls = useCallback(() => {
    if (!engineRef.current) return;

    // Find and remove bottom wall
    const bodies = Matter.Composite.allBodies(engineRef.current.world);
    const bottomWall = bodies.find(body =>
      body.isStatic &&
      body.position.y > config.height
    );

    if (bottomWall) {
      Matter.Composite.remove(engineRef.current.world, bottomWall);
    }

    // Apply downward impulse to all balls
    ballsRef.current.forEach(ball => {
      Matter.Body.applyForce(ball, ball.position, { x: 0, y: 0.002 });
    });

    // Clear balls after they fall through
    setTimeout(() => {
      clearBalls();
    }, 500);
  }, [config.height, clearBalls]);

  return { addBall, fillBucket, clearBalls, releaseBalls };
}
