import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePlinkoPhysics } from '../../../hooks/usePlinkoPhysics';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [landedBalls, setLandedBalls] = useState<Set<number>>(new Set());
  const [bucketTilt, setBucketTilt] = useState(0);

  // Physics configuration
  const physicsConfig = {
    rows,
    pegSpacingX: 40,
    pegSpacingY: 50,
    ballRadius: 8,
    pegRadius: 4
  };

  // Handle ball landing
  const handleBallLanded = useCallback((ballId: number, position: number) => {
    setLandedBalls(prev => {
        const newSet = new Set(prev);
        newSet.add(ballId);
        return newSet;
    });
  }, []);

  // Initialize Matter.js physics
  const { dropBall, clearBalls } = usePlinkoPhysics(
    canvasRef,
    physicsConfig,
    handleBallLanded
  );

  // Drop balls when paths arrive
  useEffect(() => {
    if (!paths || paths.length === 0 || !isDropping) {
      if (!isDropping) {
        clearBalls();
        setLandedBalls(new Set());
        setBucketTilt(0);
      }
      return;
    }

    // Tilt bucket
    setBucketTilt(45);
    setTimeout(() => setBucketTilt(0), 400);

    // Drop each ball with stagger
    paths.forEach((path, index) => {
      setTimeout(() => {
        dropBall({ id: index, path });
      }, index * 200); // 200ms stagger between balls
    });
  }, [paths, isDropping, dropBall, clearBalls]);

  // Check if all balls landed
  useEffect(() => {
    if (paths && landedBalls.size >= paths.length && isDropping) {
      // Add a small delay to ensure visuals catch up
      const timer = setTimeout(() => {
        onAnimationComplete?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [landedBalls, paths, isDropping, onAnimationComplete]);

  const handleBucketClick = () => {
    if (disabled || isDropping) return;
    onDrop();
  };

  // Calculate board height for container
  const boardHeight = 60 + rows * 50 + 120;

  return (
    <div className="plinko-board-container">
      <div className="plinko-board" style={{ height: `${boardHeight}px` }}>

        {/* Tipping Bucket (React UI) */}
        <div
          className={`plinko-bucket ${disabled || isDropping ? 'bucket-disabled' : ''}`}
          style={{ transform: `rotate(${bucketTilt}deg)` }}
          onClick={handleBucketClick}
        >
          <div className="bucket-body">
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

        {/* Matter.js Canvas (Physics Rendering) */}
        <canvas
          ref={canvasRef}
          className="plinko-physics-canvas"
        />

        {/* Landing slots (React UI) */}
        <div
          className="plinko-slots"
          style={{ top: `${60 + rows * 50 + 30}px` }}
        >
          {Array.from({ length: rows + 1 }, (_, i) => (
            <div
              key={`slot-${i}`}
              className={`plinko-slot ${
                !isDropping && finalPositions?.includes(i) ? 'plinko-slot-active' : ''
              }`}
              style={{
                left: `calc(50% + ${(i - rows / 2) * 40}px)`,
              }}
            >
              {!isDropping && finalPositions && (() => {
                const count = finalPositions.filter(p => p === i).length;
                return count > 1 ? <span className="slot-count">{count}</span> : null;
              })()}
            </div>
          ))}
        </div>

        {/* Multiplier labels (React UI) */}
        {multipliers && multipliers.length > 0 && (
          <div
            className="plinko-multiplier-labels"
            style={{ top: `${60 + rows * 50 + 70}px` }}
          >
            {multipliers.map((mult, index) => {
              const isHighlighted = !isDropping && finalPositions?.includes(index);
              const isWin = mult >= 1.0;

              return (
                <div
                  key={`mult-${index}`}
                  className={`plinko-multiplier-label ${isWin ? 'win-multiplier' : 'lose-multiplier'} ${isHighlighted ? 'highlighted' : ''}`}
                  style={{
                    left: `calc(50% + ${(index - rows / 2) * 40}px)`,
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