import React, { useEffect, useState } from 'react';
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
  const [animationKey, setAnimationKey] = useState(0);

  // Simple effect: When new path arrives, increment key to force fresh animation
  useEffect(() => {
    if (path && isDropping) {
      setAnimationKey(prev => prev + 1);
    }
  }, [path, isDropping]); // Proper dependencies

  // Refactored animation effect - single source of truth
  useEffect(() => {
    // Don't start if no path or not dropping
    if (!path || !isDropping) {
      return;
    }

    // Start animation immediately
    let currentRow = 0;
    let currentColumn = 0;
    const timeouts: number[] = [];

    setBallPosition({ row: 0, column: 0 });

    const animateStep = () => {
      if (currentRow < path.length) {
        currentRow++;
        if (path[currentRow - 1]) {
          currentColumn++;
        }

        setBallPosition({ row: currentRow, column: currentColumn });
        const timeoutId = window.setTimeout(animateStep, 150);
        timeouts.push(timeoutId);
      } else {
        // Animation complete - call callback after short delay
        const completeTimeout = window.setTimeout(() => {
          if (onAnimationComplete) {
            onAnimationComplete();
          }
        }, 500);
        timeouts.push(completeTimeout);
      }
    };

    // Start animation
    const initialTimeout = window.setTimeout(animateStep, 200);
    timeouts.push(initialTimeout);

    // Cleanup: ALWAYS cancel all timeouts
    return () => {
      timeouts.forEach(clearTimeout);
      setBallPosition(null);
    };
  }, [animationKey]); // Only depend on animationKey - guaranteed to change for each drop

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
            className="plinko-ball"
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
              className={`plinko-slot ${finalPosition === i && !isDropping ? 'plinko-slot-active' : ''}`}
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
