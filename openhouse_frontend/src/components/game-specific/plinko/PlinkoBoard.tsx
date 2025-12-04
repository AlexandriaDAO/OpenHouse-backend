import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePlinkoBucketPhysics } from '../../../hooks/usePlinkoBucketPhysics';
import { usePlinkoAnimation } from '../../../hooks/usePlinkoAnimation';
import './PlinkoBoard.css';

type GamePhase = 'idle' | 'filling' | 'releasing' | 'animating' | 'complete';

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
  gamePhase: GamePhase;
  fillProgress: number;
  doorOpen: boolean;
  isWaitingForBackend: boolean;
}

// Layout constants
const BOARD_WIDTH = 1000;
const DROP_ZONE_HEIGHT = 100;
const PEG_SPACING_X = 60;
const PEG_SPACING_Y = 70;
const BALL_RADIUS = 14;
const PEG_RADIUS = 7;
const MS_PER_ROW = 120; // Animation speed

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
  gamePhase,
  fillProgress,
  doorOpen,
  isWaitingForBackend,
}) => {
  const bucketCanvasRef = useRef<HTMLCanvasElement>(null);
  const [landedBalls, setLandedBalls] = useState<Set<number>>(new Set());

  // Bucket physics for filling animation (larger bucket - 220x100 interior)
  const { fillBucket, clearBalls: clearBucketBalls, releaseBalls, resetBucket } = usePlinkoBucketPhysics(
    bucketCanvasRef,
    { width: 220, height: 100, ballRadius: 10 }
  );

  // Path animation for game drop
  const animationConfig = {
    rows,
    pegSpacingX: PEG_SPACING_X,
    pegSpacingY: PEG_SPACING_Y,
    dropZoneHeight: DROP_ZONE_HEIGHT,
    boardWidth: BOARD_WIDTH,
    msPerRow: MS_PER_ROW,
  };

  const handleBallLanded = useCallback((ballId: number, _slot: number) => {
    setLandedBalls(prev => {
      const newSet = new Set(prev);
      newSet.add(ballId);
      return newSet;
    });
  }, []);

  const { balls, dropBall, clearBalls: clearAnimationBalls } = usePlinkoAnimation(
    animationConfig,
    handleBallLanded
  );

  // Fill bucket when entering filling phase
  useEffect(() => {
    if (gamePhase === 'filling') {
      fillBucket(ballCount);
    }
  }, [gamePhase, ballCount, fillBucket]);

  // Release bucket balls when door opens
  useEffect(() => {
    if (gamePhase === 'releasing') {
      releaseBalls();
    }
  }, [gamePhase, releaseBalls]);

  // Drop game balls when entering animating phase
  useEffect(() => {
    if (gamePhase !== 'animating' || !paths || paths.length === 0) {
      if (gamePhase === 'idle') {
        // Reset bucket physics (restore floor for next game)
        resetBucket();
        clearAnimationBalls();
        setLandedBalls(new Set());
      }
      return;
    }

    // Drop each ball with stagger
    paths.forEach((path, index) => {
      setTimeout(() => {
        dropBall({ id: index, path });
      }, index * 200);
    });
  }, [gamePhase, paths, dropBall, resetBucket, clearAnimationBalls]);

  // Check if all balls landed
  useEffect(() => {
    if (paths && landedBalls.size >= paths.length && gamePhase === 'animating') {
      const timer = setTimeout(() => {
        onAnimationComplete?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [landedBalls, paths, gamePhase, onAnimationComplete]);

  const handleDropClick = () => {
    if (disabled || gamePhase !== 'idle') return;
    onDrop();
  };

  // Board height calculation
  const boardHeight = DROP_ZONE_HEIGHT + rows * PEG_SPACING_Y + 150;

  // Button text
  const getButtonText = () => {
    switch (gamePhase) {
      case 'filling':
        return 'LOADING...';
      case 'releasing':
      case 'animating':
        return 'DROPPING...';
      default:
        return ballCount > 1 ? `DROP ${ballCount}` : 'DROP';
    }
  };

  // Generate peg positions (offsets from center)
  const pegs: Array<{ row: number; col: number; offsetX: number; y: number }> = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= row; col++) {
      const offsetX = (col - row / 2) * PEG_SPACING_X;
      const y = DROP_ZONE_HEIGHT + row * PEG_SPACING_Y;
      pegs.push({ row, col, offsetX, y });
    }
  }

  return (
    <div className="plinko-board-container">
      <div className="plinko-board" style={{ height: `${boardHeight}px` }}>

        {/* Clickable Bucket with trapdoor */}
        <div
          className={`plinko-bucket ${gamePhase === 'idle' && !disabled ? 'clickable' : ''} ${gamePhase !== 'idle' ? 'active' : ''}`}
          onClick={handleDropClick}
          role="button"
          tabIndex={disabled || gamePhase !== 'idle' ? -1 : 0}
          onKeyDown={(e) => e.key === 'Enter' && handleDropClick()}
        >
          {/* Bucket body */}
          <div className="bucket-body">
            {/* Inner shadow overlay */}
            <div className="bucket-inner-shadow" />

            {/* Physics canvas for bucket balls */}
            <canvas
              ref={bucketCanvasRef}
              className="bucket-physics-canvas"
            />

            {/* Fallback static balls when not animating */}
            {gamePhase === 'idle' && fillProgress > 0 && (
              <div className="bucket-balls-reservoir">
                {Array.from({ length: Math.min(fillProgress, 80) }).map((_, i) => (
                  <div
                    key={i}
                    className={`bucket-ball-item ${isWaitingForBackend ? 'waiting' : ''}`}
                    style={isWaitingForBackend ? { animationDelay: `${(i % 10) * 40}ms` } : undefined}
                  />
                ))}
              </div>
            )}

            {/* Bucket label */}
            <div className="bucket-label">
              {gamePhase === 'filling' ? 'LOADING...' :
               gamePhase === 'releasing' || gamePhase === 'animating' ? 'DROPPING...' :
               ballCount > 1 ? `DROP ${ballCount}` : 'DROP'}
            </div>
          </div>

          {/* Trapdoor at bottom */}
          <div className={`bucket-trapdoor ${doorOpen ? 'open' : ''}`}>
            <div className="trapdoor-left">
              <div className="trapdoor-hinge trapdoor-hinge-left" />
            </div>
            <div className="trapdoor-right">
              <div className="trapdoor-hinge trapdoor-hinge-right" />
            </div>
          </div>

          {/* Visual funnel guide below bucket */}
          <div className="bucket-funnel" />
        </div>

        {/* Pegs - rendered as CSS divs */}
        <div className="plinko-pegs">
          {pegs.map(peg => (
            <div
              key={`peg-${peg.row}-${peg.col}`}
              className="plinko-peg"
              style={{
                left: `calc(50% + ${peg.offsetX}px)`,
                top: `${peg.y}px`,
                width: `${PEG_RADIUS * 2}px`,
                height: `${PEG_RADIUS * 2}px`,
              }}
            />
          ))}
        </div>

        {/* Animated balls - only show during animation */}
        {(gamePhase === 'animating' || gamePhase === 'releasing') && (
          <div className="plinko-balls">
            {balls.map(ball => (
              <div
                key={`ball-${ball.id}`}
                className={`plinko-ball ${ball.landed ? 'landed' : ''}`}
                style={{
                  left: `calc(50% + ${ball.x - BOARD_WIDTH / 2}px)`,
                  top: `${ball.y}px`,
                  width: `${BALL_RADIUS * 2}px`,
                  height: `${BALL_RADIUS * 2}px`,
                }}
              />
            ))}
          </div>
        )}

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
            style={{ top: `${DROP_ZONE_HEIGHT + rows * PEG_SPACING_Y + 85}px` }}
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
