import React, { useEffect, useState, useRef } from 'react';
import './PlinkoBoard.css';

interface PlinkoBoardProps {
  rows: number;
  path: boolean[] | null; // true = right, false = left
  isDropping: boolean;
  onAnimationComplete?: () => void;
  finalPosition?: number;
}

interface BallPosition {
  row: number;
  column: number;
}

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({
  rows,
  path,
  isDropping,
  onAnimationComplete,
  finalPosition,
}) => {
  const [ballPosition, setBallPosition] = useState<BallPosition | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'dropping' | 'complete'>('idle');
  const animationRef = useRef<number | null>(null);

  // Reset animation phase when new path arrives
  useEffect(() => {
    if (path && isDropping) {
      // Cancel any ongoing animation
      if (animationRef.current) {
        clearTimeout(animationRef.current);
        animationRef.current = null;
      }
      // Reset to idle so the animation can start fresh
      setAnimationPhase('idle');
      setBallPosition(null);
    }
  }, [path]); // Only depend on path changes

  // Animate ball drop
  useEffect(() => {
    if (path && isDropping && animationPhase === 'idle') {
      setAnimationPhase('dropping');
      let currentRow = 0;
      let currentColumn = 0; // Start at center (column 0)

      setBallPosition({ row: 0, column: 0 });

      const animateStep = () => {
        if (currentRow < path.length) {
          // Move to next row
          currentRow++;
          // Update column based on path (true = right, false = left)
          if (path[currentRow - 1]) {
            currentColumn++;
          }
          // If false (left), column stays the same

          setBallPosition({ row: currentRow, column: currentColumn });

          // Continue animation
          animationRef.current = window.setTimeout(animateStep, 150);
        } else {
          // Animation complete
          setAnimationPhase('complete');
          if (onAnimationComplete) {
            setTimeout(onAnimationComplete, 500);
          }
        }
      };

      // Start animation with initial delay
      animationRef.current = window.setTimeout(animateStep, 200);

      return () => {
        if (animationRef.current) {
          clearTimeout(animationRef.current);
        }
      };
    }
  }, [path, isDropping, animationPhase, onAnimationComplete]);

  // Reset when not dropping
  useEffect(() => {
    if (!isDropping && animationPhase !== 'idle') {
      setTimeout(() => {
        setBallPosition(null);
        setAnimationPhase('idle');
      }, 1000);
    }
  }, [isDropping, animationPhase]);

  // Generate pegs for the board
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
              left: `calc(50% + ${(col - row / 2) * 40}px)`,
              top: `${row * 50 + 20}px`,
            }}
          />
        );
      }
    }
    return pegs;
  };

  // Calculate ball position in pixels
  const getBallStyle = (): React.CSSProperties => {
    if (!ballPosition) return { display: 'none' };

    return {
      left: `calc(50% + ${(ballPosition.column - ballPosition.row / 2) * 40}px)`,
      top: `${ballPosition.row * 50}px`,
      transition: 'all 0.15s ease-in-out',
    };
  };

  // Calculate board height based on rows
  const boardHeight = rows * 50 + 100;

  return (
    <div className="plinko-board-container">
      <div
        className="plinko-board"
        style={{ height: `${boardHeight}px` }}
      >
        {/* Render all pegs */}
        {renderPegs()}

        {/* Ball */}
        {ballPosition && (
          <div
            className={`plinko-ball ${animationPhase === 'complete' ? 'plinko-ball-complete' : ''}`}
            style={getBallStyle()}
          />
        )}

        {/* Landing slots */}
        <div
          className="plinko-slots"
          style={{ top: `${rows * 50 + 50}px` }}
        >
          {Array.from({ length: rows + 1 }, (_, i) => (
            <div
              key={`slot-${i}`}
              className={`plinko-slot ${finalPosition === i && animationPhase === 'complete' ? 'plinko-slot-active' : ''}`}
              style={{
                left: `calc(50% + ${(i - rows / 2) * 40}px)`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
