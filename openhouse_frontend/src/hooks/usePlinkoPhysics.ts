import Matter from 'matter-js';
import { useEffect, useRef } from 'react';

interface PhysicsConfig {
  rows: number;
  pegSpacingX: number;
  pegSpacingY: number;
  ballRadius: number;
  pegRadius: number;
}

interface BallPath {
  id: number;
  path: boolean[]; // Backend-provided path
}

// Custom interface for Matter.js Body with our plugin data
interface CustomBody extends Matter.Body {
  plugin: {
    ballId?: number;
    targetPath?: boolean[];
    currentStep?: number;
  };
}

export function usePlinkoPhysics(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  config: PhysicsConfig,
  onBallLanded: (ballId: number, position: number) => void
) {
  // Create Matter.js engine
  const engineRef = useRef<Matter.Engine>();
  const renderRef = useRef<Matter.Render>();
  const pegsRef = useRef<Matter.Body[]>([]);
  const ballsRef = useRef<Map<number, Matter.Body>>(new Map());

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvasWidth = canvasRef.current.parentElement?.clientWidth || 800;
    // Calculate height based on rows + top/bottom padding
    // Matches PlinkoBoard.tsx calculation: DROP_ZONE_HEIGHT (60) + rows * 50 + 120
    const canvasHeight = 60 + config.rows * 50 + 120;
    
    // Initialize Matter.js engine
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1.2 } // Slightly higher gravity for snappier feel
    });

    // Create renderer
    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width: canvasWidth,
        height: canvasHeight,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio || 1
      }
    });

    const centerX = canvasWidth / 2;
    
    // Helper to calculate peg positions
    // Matches PlinkoBoard logic: left: `calc(50% + ${(col - row / 2) * PEG_SPACING_X}px)`
    const calculatePegX = (row: number, col: number) => {
       return centerX + (col - row / 2) * config.pegSpacingX;
    };

    const calculatePegY = (row: number) => {
        // Matches PlinkoBoard: top: `${DROP_ZONE_HEIGHT + row * PEG_SPACING_Y}px`
        const DROP_ZONE_HEIGHT = 60;
        return DROP_ZONE_HEIGHT + row * config.pegSpacingY;
    };

    // Create pegs as static circles
    const pegs: Matter.Body[] = [];
    for (let row = 0; row <= config.rows; row++) {
      const pegsInRow = row + 1;
      for (let col = 0; col < pegsInRow; col++) {
        const x = calculatePegX(row, col);
        const y = calculatePegY(row);

        const peg = Matter.Bodies.circle(x, y, config.pegRadius, {
          isStatic: true,
          restitution: 0.5, // Bounciness of pegs
          friction: 0.0,
          render: {
            fillStyle: 'rgba(255, 255, 255, 0.2)', // Subtle white pegs
            strokeStyle: 'rgba(255, 255, 255, 0.4)',
            lineWidth: 1
          }
        });

        pegs.push(peg);
      }
    }

    Matter.World.add(engine.world, pegs);
    pegsRef.current = pegs;

    // Create invisible walls/boundaries to keep balls in play if they go wild
    const wallOptions = { isStatic: true, render: { visible: false } };
    const leftWall = Matter.Bodies.rectangle(centerX - (config.rows * config.pegSpacingX) - 50, canvasHeight/2, 50, canvasHeight, wallOptions);
    const rightWall = Matter.Bodies.rectangle(centerX + (config.rows * config.pegSpacingX) + 50, canvasHeight/2, 50, canvasHeight, wallOptions);
    Matter.World.add(engine.world, [leftWall, rightWall]);

    // Start physics engine
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    engineRef.current = engine;
    renderRef.current = render;

    // Collision Events for Path Guiding
    Matter.Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
            const bodyA = pair.bodyA as CustomBody;
            const bodyB = pair.bodyB as CustomBody;

            // Identify ball and peg
            let ball: CustomBody | null = null;
            let peg: Matter.Body | null = null;

            if (bodyA.plugin?.ballId !== undefined) ball = bodyA;
            else if (!bodyA.isStatic) ball = bodyA; // Fallback if plugin data lost

            if (bodyB.isStatic && !bodyB.plugin?.ballId) peg = bodyB;
            else if (bodyA.isStatic && !bodyA.plugin?.ballId) peg = bodyA;
            
            if (ball && peg) {
               // Just collided with a peg
               // We could add sound effects here later
            }
        });
    });

    // After Update Event for Path Guiding and Cleanup
    Matter.Events.on(engine, 'beforeUpdate', (event) => {
        ballsRef.current.forEach((ballBody) => {
            const ball = ballBody as CustomBody;
            
            // Apply guiding force
            if (ball.plugin?.targetPath && ball.plugin.currentStep !== undefined) {
                const path = ball.plugin.targetPath;
                const step = ball.plugin.currentStep;
                
                if (step < path.length) {
                    // Determine which row we are likely traversing
                    // This is tricky. We want to apply force when passing a peg row.
                    // Or we can just nudge it continuously based on Y position?
                    // Better: Nudge it when it's near a peg row top.
                    
                    const DROP_ZONE_HEIGHT = 60;
                    const currentRow = Math.floor((ball.position.y - DROP_ZONE_HEIGHT + config.pegSpacingY/2) / config.pegSpacingY);
                    
                    // If we are in a new row compared to step, apply force
                    // But step corresponds to row index 0, 1, 2...
                    // Path has length = rows.
                    
                    // Let's simplify: Just nudge it towards the desired column center for the *next* row
                    // Current implementation in plan used collision events, but that's unreliable if we miss a collision
                    // Let's try a continuous nudging approach based on depth.
                    
                    const intendedRowIndex = Math.floor((ball.position.y - (DROP_ZONE_HEIGHT - config.pegSpacingY/2)) / config.pegSpacingY);
                    
                    if (intendedRowIndex >= 0 && intendedRowIndex < path.length) {
                        // We are falling through row `intendedRowIndex`
                        // We should decide whether to go Left (false) or Right (true)
                        const goRight = path[intendedRowIndex];
                        
                        // Only apply force if we haven't "committed" too much yet
                        // Or apply small continuous force
                        const forceX = goRight ? 0.0003 : -0.0003;
                        
                        // Don't apply if we are already moving fast in that direction?
                        Matter.Body.applyForce(ball, ball.position, { x: forceX, y: 0 });
                    }
                }
            }
            
            // Cleanup
             if (ball.position.y > canvasHeight + 50) {
                // Remove ball
                Matter.World.remove(engine.world, ball);
                ballsRef.current.delete(ball.plugin.ballId!);
            }
        });
    });
    
    // Detect landing
    Matter.Events.on(engine, 'afterUpdate', () => {
         ballsRef.current.forEach((ballBody) => {
            const ball = ballBody as CustomBody;
            // Bottom threshold: below the last row of pegs
            const bottomThreshold = 60 + config.rows * 50 + 20; 
            
            if (ball.position.y > bottomThreshold && !ball.isSleeping) {
                // Determine which slot it fell into
                // Slot x centers: centerX + (i - rows/2) * 40
                // i goes from 0 to rows
                
                // We need to ensure we only trigger once.
                // We can mark it sleeping or remove it soon.
                // But we need to pass the result.
                
                // Check if we already reported this ball? 
                // The plan uses `onBallLanded`.
                // We should track if we reported it.
                 if (!(ball as any).hasLanded) {
                    // Calculate nearest slot index
                    const xRel = ball.position.x - centerX;
                    // xRel = (i - rows/2) * 40
                    // i = xRel / 40 + rows/2
                    const slotIndex = Math.round(xRel / config.pegSpacingX + config.rows / 2);
                    
                    // Clamp slotIndex
                    const clampedIndex = Math.max(0, Math.min(config.rows, slotIndex));
                    
                    onBallLanded(ball.plugin.ballId!, clampedIndex);
                    (ball as any).hasLanded = true;
                    
                    // Fade out or remove after delay
                     setTimeout(() => {
                        Matter.World.remove(engine.world, ball);
                        ballsRef.current.delete(ball.plugin.ballId!);
                     }, 1000);
                 }
            }
         });
    });

    // Cleanup
    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      if (render.canvas) {
          // render.canvas.remove(); // React handles canvas element
      }
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, [config.rows, config.pegSpacingX, config.pegSpacingY]); // Re-init if grid changes

  // Function to drop ball with predetermined path
  const dropBall = (ballData: BallPath) => {
    if (!engineRef.current) return;

    const DROP_ZONE_HEIGHT = 60;
    const centerX = (canvasRef.current?.parentElement?.clientWidth || 800) / 2;
    // Random slight offset to prevent stacking perfectly
    const randomX = (Math.random() - 0.5) * 2; 

    const ball = Matter.Bodies.circle(
      centerX + randomX, 
      DROP_ZONE_HEIGHT - 40, // Start above first peg
      config.ballRadius,
      {
        restitution: 0.6,
        friction: 0.005,
        frictionAir: 0.02, // Air resistance helps control speed
        density: 0.002,
        render: {
          fillStyle: '#FF0055', // Hot pink/Red for ball
          strokeStyle: '#FFFFFF',
          lineWidth: 1
        },
        plugin: {
          ballId: ballData.id,
          targetPath: ballData.path,
          currentStep: 0
        }
      } as any
    );

    Matter.World.add(engineRef.current.world, ball);
    ballsRef.current.set(ballData.id, ball);
  };

  return {
    dropBall,
    clearBalls: () => {
      if (!engineRef.current) return;
      ballsRef.current.forEach((ball) => {
        Matter.World.remove(engineRef.current!.world, ball);
      });
      ballsRef.current.clear();
    }
  };
}
