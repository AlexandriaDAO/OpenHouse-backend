import { useState, useRef, useCallback, useEffect } from 'react';

interface AnimationConfig {
  rows: number;
  pegSpacingX: number;
  pegSpacingY: number;
  dropZoneHeight: number;
  boardWidth: number;
  msPerRow: number; // milliseconds per row transition
}

interface Ball {
  id: number;
  path: boolean[];
  currentRow: number;
  progress: number; // 0-1 within current row
  x: number;
  y: number;
  landed: boolean;
  finalSlot: number;
}

interface BallPath {
  id: number;
  path: boolean[];
}

// Ease-in-out for natural movement
const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// Calculate x position based on path progress
function calculateX(
  path: boolean[],
  row: number,
  progress: number,
  centerX: number,
  pegSpacingX: number
): number {
  // Count rights up to current row
  const rightsToCurrentRow = path.slice(0, row).filter(v => v).length;
  const currentX = centerX + (rightsToCurrentRow - row / 2) * pegSpacingX;

  if (row >= path.length) {
    return currentX;
  }

  // Count rights up to next row
  const rightsToNextRow = path.slice(0, row + 1).filter(v => v).length;
  const nextX = centerX + (rightsToNextRow - (row + 1) / 2) * pegSpacingX;

  // Interpolate with easing
  const easedProgress = easeInOutQuad(progress);
  return currentX + (nextX - currentX) * easedProgress;
}

// Calculate y position based on row and progress
function calculateY(
  row: number,
  progress: number,
  dropZoneHeight: number,
  pegSpacingY: number
): number {
  const currentY = dropZoneHeight + row * pegSpacingY;
  const nextY = dropZoneHeight + (row + 1) * pegSpacingY;
  const easedProgress = easeInOutQuad(progress);
  return currentY + (nextY - currentY) * easedProgress;
}

// Calculate final slot from path
function calculateFinalSlot(path: boolean[]): number {
  return path.filter(v => v).length;
}

export function usePlinkoAnimation(
  config: AnimationConfig,
  onBallLanded: (ballId: number, slot: number) => void
) {
  const [balls, setBalls] = useState<Ball[]>([]);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const onBallLandedRef = useRef(onBallLanded);
  const configRef = useRef(config);

  onBallLandedRef.current = onBallLanded;
  configRef.current = config;

  const centerX = config.boardWidth / 2;

  // Animation loop
  useEffect(() => {
    const animate = (time: number) => {
      const cfg = configRef.current;
      const deltaTime = lastTimeRef.current ? time - lastTimeRef.current : 16;
      lastTimeRef.current = time;

      setBalls(prevBalls => {
        let hasActiveBalls = false;
        const updatedBalls = prevBalls.map(ball => {
          if (ball.landed) return ball;

          hasActiveBalls = true;

          // Increment progress based on time
          const progressIncrement = deltaTime / cfg.msPerRow;
          let newProgress = ball.progress + progressIncrement;
          let newRow = ball.currentRow;

          // Move to next row when progress completes
          if (newProgress >= 1) {
            newRow = ball.currentRow + 1;
            newProgress = newProgress - 1;
          }

          // Check if ball has landed
          const landed = newRow >= cfg.rows;

          // Calculate new position
          const actualRow = Math.min(newRow, cfg.rows);
          const actualProgress = landed ? 0 : newProgress;

          const x = calculateX(
            ball.path,
            actualRow,
            actualProgress,
            centerX,
            cfg.pegSpacingX
          );
          const y = calculateY(
            actualRow,
            actualProgress,
            cfg.dropZoneHeight,
            cfg.pegSpacingY
          );

          // Notify on landing
          if (landed && !ball.landed) {
            // Use setTimeout to avoid setState during render
            setTimeout(() => {
              onBallLandedRef.current(ball.id, ball.finalSlot);
            }, 0);
          }

          return {
            ...ball,
            currentRow: newRow,
            progress: newProgress,
            x,
            y,
            landed
          };
        });

        return updatedBalls;
      });

      // Continue animation if there are active balls
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [centerX]);

  // Drop a ball
  const dropBall = useCallback((ballData: BallPath) => {
    const cfg = configRef.current;
    const finalSlot = calculateFinalSlot(ballData.path);

    const newBall: Ball = {
      id: ballData.id,
      path: ballData.path,
      currentRow: 0,
      progress: 0,
      x: centerX,
      y: cfg.dropZoneHeight,
      landed: false,
      finalSlot
    };

    setBalls(prev => [...prev, newBall]);
  }, [centerX]);

  // Clear all balls
  const clearBalls = useCallback(() => {
    setBalls([]);
    lastTimeRef.current = 0;
  }, []);

  return { balls, dropBall, clearBalls };
}
