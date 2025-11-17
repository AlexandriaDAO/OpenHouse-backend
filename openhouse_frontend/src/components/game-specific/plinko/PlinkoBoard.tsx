import React, { useEffect, useState } from 'react';
import './PlinkoBoard.css';

interface PlinkoBoardProps {
  rows: number;
  path: boolean[] | null; // true = right, false = left (single ball)
  isDropping: boolean;
  onAnimationComplete?: () => void;
  finalPosition?: number;
  multiResult?: any; // Multi-ball results
}

interface BallPosition {
  row: number;
  column: number;
}

interface BallState {
  id: string;
  position: BallPosition;
  path: boolean[];
  currentRow: number;
  isAnimating: boolean;
  finalPosition: number;
}

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({
  rows,
  path,
  isDropping,
  onAnimationComplete,
  finalPosition,
  multiResult,
}) => {
  const [ballPosition, setBallPosition] = useState<BallPosition | null>(null);
  const [animationKey, setAnimationKey] = useState(0);

  // Multi-ball state
  const [balls, setBalls] = useState<BallState[]>([]);
  const [completedCount, setCompletedCount] = useState(0);

  // Simple effect: When new path arrives, increment key to force fresh animation
  useEffect(() => {
    if (path && isDropping) {
      setAnimationKey(prev => prev + 1);
    }
  }, [path, isDropping]);

  // Multi-ball animation effect
  useEffect(() => {
    if (!multiResult || !isDropping) return;

    // Initialize all balls
    const initialBalls: BallState[] = multiResult.balls.map((result: any, index: number) => ({
      id: `ball-${index}`,
      position: { row: 0, column: 0 },
      path: result.path,
      currentRow: 0,
      isAnimating: true,
      finalPosition: result.final_position,
    }));

    setBalls(initialBalls);
    setCompletedCount(0);

    // Start parallel animations for all balls
    const timeouts: number[] = [];

    initialBalls.forEach((ball, ballIndex) => {
      let currentRow = 0;
      let currentColumn = 0;

      const animateStep = () => {
        if (currentRow < ball.path.length) {
          currentRow++;
          if (ball.path[currentRow - 1]) {
            currentColumn++;
          }

          // Update this specific ball's position
          setBalls(prev => prev.map(b =>
            b.id === ball.id
              ? { ...b, position: { row: currentRow, column: currentColumn }, currentRow }
              : b
          ));

          // Continue animation
          const timeoutId = window.setTimeout(animateStep, 150);
          timeouts.push(timeoutId);
        } else {
          // Ball reached bottom
          setBalls(prev => prev.map(b =>
            b.id === ball.id
              ? { ...b, isAnimating: false }
              : b
          ));

          // Increment completed count
          setCompletedCount(prev => {
            const newCount = prev + 1;

            // Check if all balls completed
            if (newCount === multiResult.balls.length) {
              const completeTimeout = window.setTimeout(() => {
                if (onAnimationComplete) {
                  onAnimationComplete();
                }
              }, 500);
              timeouts.push(completeTimeout);
            }

            return newCount;
          });
        }
      };

      // Start this ball's animation with small initial delay for visual effect
      const initialTimeout = window.setTimeout(animateStep, 200 + ballIndex * 50);
      timeouts.push(initialTimeout);
    });

    // Cleanup
    return () => {
      timeouts.forEach(clearTimeout);
      setBalls([]);
      setCompletedCount(0);
    };
  }, [multiResult, isDropping, onAnimationComplete]);

  // Single ball animation effect
  useEffect(() => {
    // Skip if multi-ball mode
    if (multiResult) return;

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
  }, [animationKey, multiResult]);

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

        {/* Single Ball */}
        {ballPosition && !multiResult && (
          <div
            className="plinko-ball"
            style={getBallStyle(ballPosition)}
          />
        )}

        {/* Multi-Ball: Render all balls */}
        {balls.map(ball => (
          <div
            key={ball.id}
            className={`plinko-ball ${!ball.isAnimating ? 'landed' : ''}`}
            style={getBallStyle(ball.position)}
          />
        ))}

        {/* Show completion status for multi-ball */}
        {multiResult && completedCount > 0 && (
          <div
            className="completion-status"
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'rgba(0,0,0,0.7)',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#fff',
            }}
          >
            {completedCount} / {multiResult.balls.length} balls landed
          </div>
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
