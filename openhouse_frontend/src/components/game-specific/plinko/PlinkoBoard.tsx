import React, { useEffect, useState, useRef, useCallback } from 'react';
import './PlinkoBoard.css';

interface PlinkoBoardProps {
  rows: number;
  paths: boolean[][] | null;
  isDropping: boolean;
  onAnimationComplete?: () => void;
  finalPositions?: number[];
  multipliers?: number[];
  ballCount: number;
  onDrop: () => void;
  disabled: boolean;
}

interface BallState {
  id: number;
  col: number;       // Grid column (for horizontal position)
  row: number;       // Current row in grid
  yOffset: number;   // Pixel offset within current row (for smooth falling)
  velocityY: number;
  currentStep: number;
  finished: boolean;
  path: boolean[];
}

// Physics constants
const GRAVITY = 0.6;
const BOUNCE_DAMPING = 0.5;
const PEG_SPACING_X = 40;
const PEG_SPACING_Y = 50;
const DROP_ZONE_HEIGHT = 60;

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({
  rows,
  paths,
  isDropping,
  onAnimationComplete,
  finalPositions,
  multipliers,
  ballCount,
  onDrop,
  disabled,
}) => {
  const [balls, setBalls] = useState<BallState[]>([]);
  const [bucketTilt, setBucketTilt] = useState(0);
  const animationRef = useRef<number | null>(null);

  // Initialize balls when paths change
  useEffect(() => {
    if (!paths || paths.length === 0 || !isDropping) {
      if (!isDropping) {
        setBalls([]);
        setBucketTilt(0);
      }
      return;
    }

    // Tilt the bucket
    setBucketTilt(45);

    // Create initial ball states with staggered positions
    const initialBalls: BallState[] = paths.map((path, index) => ({
      id: index,
      col: 0,
      row: -1,  // Start above the board
      yOffset: -DROP_ZONE_HEIGHT - (index * 12), // Stagger start heights
      velocityY: 0,
      currentStep: 0,
      finished: false,
      path,
    }));

    // Reset bucket after balls drop
    setTimeout(() => setBucketTilt(0), 400);

    setBalls(initialBalls);
  }, [paths, isDropping]);

  // Physics animation loop
  useEffect(() => {
    if (!isDropping || balls.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = Math.min((currentTime - lastTime) / 16.67, 2);
      lastTime = currentTime;

      setBalls(prevBalls => {
        let allFinished = true;
        const updatedBalls = prevBalls.map(ball => {
          if (ball.finished) return ball;

          allFinished = false;
          let { col, row, yOffset, velocityY, currentStep, path } = ball;

          // Apply gravity
          velocityY += GRAVITY * deltaTime;
          yOffset += velocityY * deltaTime;

          // Calculate target Y for current row
          const targetY = 0; // Target is always the peg position (yOffset = 0)

          // Check if ball reached current peg level
          if (yOffset >= targetY && row >= 0) {
            // Bounce
            velocityY = -velocityY * BOUNCE_DAMPING;
            yOffset = targetY;

            // If velocity small enough, advance to next peg
            if (Math.abs(velocityY) < 1.5) {
              if (currentStep < path.length) {
                // Move to next row
                row++;
                currentStep++;

                // Update column based on path
                if (path[currentStep - 1]) {
                  col++;
                }

                yOffset = -PEG_SPACING_Y * 0.8; // Start above next peg
                velocityY = 2;
              } else {
                // Ball finished
                return { ...ball, col, row, yOffset: 0, finished: true };
              }
            }
          } else if (row < 0 && yOffset >= -PEG_SPACING_Y * 0.3) {
            // Ball entering the board
            row = 0;
            yOffset = -PEG_SPACING_Y * 0.8;
            velocityY = 2;
          }

          return { ...ball, col, row, yOffset, velocityY, currentStep };
        });

        if (allFinished) {
          setTimeout(() => {
            if (onAnimationComplete) {
              onAnimationComplete();
            }
          }, 300);
          return updatedBalls;
        }

        return updatedBalls;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isDropping, balls.length, onAnimationComplete]);

  // Generate pegs
  const renderPegs = () => {
    const pegs = [];
    for (let row = 0; row <= rows; row++) {
      const pegsInRow = row + 1;
      for (let col = 0; col < pegsInRow; col++) {
        pegs.push(
          <div
            key={`peg-${row}-${col}`}
            className="plinko-peg"
            style={{
              left: `calc(50% + ${(col - row / 2) * PEG_SPACING_X}px)`,
              top: `${DROP_ZONE_HEIGHT + row * PEG_SPACING_Y}px`,
            }}
          />
        );
      }
    }
    return pegs;
  };

  // Get ball style using same positioning as pegs
  const getBallStyle = (ball: BallState): React.CSSProperties => {
    const xOffset = (ball.col - ball.row / 2) * PEG_SPACING_X;
    const yPos = ball.row < 0
      ? ball.yOffset
      : DROP_ZONE_HEIGHT + ball.row * PEG_SPACING_Y + ball.yOffset;

    return {
      left: `calc(50% + ${xOffset}px)`,
      top: `${yPos}px`,
      opacity: 0.95,
      zIndex: 10 + ball.id,
    };
  };

  const handleBucketClick = () => {
    if (disabled || isDropping) return;
    onDrop();
  };

  const boardHeight = DROP_ZONE_HEIGHT + rows * PEG_SPACING_Y + 120;

  return (
    <div className="plinko-board-container">
      <div className="plinko-board" style={{ height: `${boardHeight}px` }}>

        {/* Tipping Bucket */}
        <div
          className={`plinko-bucket ${disabled || isDropping ? 'bucket-disabled' : ''}`}
          style={{ transform: `rotate(${bucketTilt}deg)` }}
          onClick={handleBucketClick}
        >
          <div className="bucket-body">
            {/* Balls in bucket */}
            <div className="bucket-balls">
              {Array.from({ length: Math.min(ballCount, 10) }).map((_, i) => (
                <div
                  key={i}
                  className="bucket-ball"
                  style={{
                    left: `${10 + (i % 5) * 12}px`,
                    bottom: `${4 + Math.floor(i / 5) * 10}px`,
                  }}
                />
              ))}
            </div>
            {ballCount > 10 && (
              <span className="bucket-count">+{ballCount - 10}</span>
            )}
          </div>
          <div className="bucket-label">
            {isDropping ? '...' : ballCount > 1 ? `×${ballCount}` : 'TAP'}
          </div>
        </div>

        {/* Pegs */}
        {renderPegs()}

        {/* Animated balls */}
        {balls.map(ball => (
          <div
            key={`ball-${ball.id}`}
            className={`plinko-ball ${ball.finished ? 'plinko-ball-complete' : ''}`}
            style={getBallStyle(ball)}
          />
        ))}

        {/* Landing slots */}
        <div
          className="plinko-slots"
          style={{ top: `${DROP_ZONE_HEIGHT + rows * PEG_SPACING_Y + 30}px` }}
        >
          {Array.from({ length: rows + 1 }, (_, i) => (
            <div
              key={`slot-${i}`}
              className={`plinko-slot ${
                !isDropping && finalPositions?.includes(i) ? 'plinko-slot-active' : ''
              }`}
              style={{
                left: `calc(50% + ${(i - rows / 2) * PEG_SPACING_X}px)`,
              }}
            >
              {!isDropping && finalPositions && (() => {
                const count = finalPositions.filter(p => p === i).length;
                return count > 1 ? <span className="slot-count">{count}</span> : null;
              })()}
            </div>
          ))}
        </div>

        {/* Multiplier labels */}
        {multipliers && multipliers.length > 0 && (
          <div
            className="plinko-multiplier-labels"
            style={{ top: `${DROP_ZONE_HEIGHT + rows * PEG_SPACING_Y + 70}px` }}
          >
            {multipliers.map((mult, index) => {
              const isHighlighted = !isDropping && finalPositions?.includes(index);
              const isWin = mult >= 1.0;

              return (
                <div
                  key={`mult-${index}`}
                  className={`plinko-multiplier-label ${isWin ? 'win-multiplier' : 'lose-multiplier'} ${isHighlighted ? 'highlighted' : ''}`}
                  style={{
                    left: `calc(50% + ${(index - rows / 2) * PEG_SPACING_X}px)`,
                  }}
                >
                  {mult.toFixed(2)}x
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
