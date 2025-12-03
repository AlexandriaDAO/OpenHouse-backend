import React, { useEffect, useState } from 'react';
import './PlinkoBoard.css';

interface PlinkoBoardProps {
  rows: number;
  paths: boolean[][] | null; // Array of paths for multi-ball
  isDropping: boolean;
  onAnimationComplete?: () => void;
  finalPositions?: number[]; // Array of final positions to highlight
}

interface BallPosition {
  id: number;
  row: number;
  column: number;
  finished: boolean;
}

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({
  rows,
  paths,
  isDropping,
  onAnimationComplete,
  finalPositions,
}) => {
  const [activeBalls, setActiveBalls] = useState<BallPosition[]>([]);
  const [animationKey, setAnimationKey] = useState(0);

  // Reset/Start animation when paths change
  useEffect(() => {
    if (paths && paths.length > 0 && isDropping) {
      setAnimationKey(prev => prev + 1);
    } else if (!isDropping) {
      setActiveBalls([]);
    }
  }, [paths, isDropping]);

  // Multi-ball animation effect
  useEffect(() => {
    if (!paths || paths.length === 0 || !isDropping) {
      return;
    }

    const totalBalls = paths.length;
    let completedBalls = 0;
    const timeouts: number[] = [];

    // Initialize balls
    const initialBalls = paths.map((_, index) => ({
      id: index,
      row: 0,
      column: 0,
      finished: false,
    }));
    setActiveBalls(initialBalls);

    // Animate each ball
    paths.forEach((path, index) => {
      let currentRow = 0;
      let currentColumn = 0;

      // Add slight random delay to start for natural feel (0-200ms)
      const startDelay = Math.random() * 200;

      const animateStep = () => {
        if (currentRow < path.length) {
          currentRow++;
          if (path[currentRow - 1]) {
            currentColumn++;
          }

          // Update this specific ball's position
          setActiveBalls(prev => prev.map(ball => 
            ball.id === index 
              ? { ...ball, row: currentRow, column: currentColumn } 
              : ball
          ));

          // Schedule next step
          const stepDelay = 150 + (Math.random() * 20); // Slight speed variation
          const timeoutId = window.setTimeout(animateStep, stepDelay);
          timeouts.push(timeoutId);
        } else {
          // Mark this ball as finished
          setActiveBalls(prev => prev.map(ball => 
            ball.id === index 
              ? { ...ball, finished: true } 
              : ball
          ));

          completedBalls++;
          
          // Check if all balls are done
          if (completedBalls === totalBalls) {
            const completeTimeout = window.setTimeout(() => {
              if (onAnimationComplete) {
                onAnimationComplete();
              }
            }, 500);
            timeouts.push(completeTimeout);
          }
        }
      };

      // Start this ball's animation
      const startTimeout = window.setTimeout(animateStep, 100 + startDelay);
      timeouts.push(startTimeout);
    });

    // Cleanup
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [animationKey, paths, isDropping, onAnimationComplete]);

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
  const getBallStyle = (position: BallPosition): React.CSSProperties => {
    return {
      left: `calc(50% + ${(position.column - position.row / 2) * 40}px)`,
      top: `${position.row * 50}px`,
      transition: 'all 0.15s ease-in-out',
      // Add slight transparency for multi-ball to see overlaps
      opacity: 0.9,
      zIndex: 10 + position.id, // Ensure some stacking order
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

        {/* Render all active balls */}
        {activeBalls.map(ball => (
          <div
            key={`ball-${ball.id}`}
            className="plinko-ball"
            style={getBallStyle(ball)}
          />
        ))}

        {/* Landing slots */}
        <div
          className="plinko-slots"
          style={{ top: `${rows * 50 + 50}px` }}
        >
          {Array.from({ length: rows + 1 }, (_, i) => (
            <div
              key={`slot-${i}`}
              className={`plinko-slot ${
                !isDropping && finalPositions?.includes(i) 
                  ? 'plinko-slot-active' 
                  : ''
              }`}
              style={{
                left: `calc(50% + ${(i - rows / 2) * 40}px)`,
              }}
            >
               {/* Show count if multiple balls landed here */}
               {!isDropping && finalPositions && (
                 (() => {
                   const count = finalPositions.filter(p => p === i).length;
                   return count > 0 ? (
                     <span className="text-[10px] font-bold text-pure-black bg-dfinity-turquoise rounded-full w-5 h-5 flex items-center justify-center absolute -top-3 left-1/2 transform -translate-x-1/2">
                       {count}
                     </span>
                   ) : null;
                 })()
               )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};