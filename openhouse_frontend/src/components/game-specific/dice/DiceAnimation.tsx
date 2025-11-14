import React, { useEffect, useState, useRef } from 'react';
import './DiceAnimation.css';

// Animation timing constants
const ANIMATION_CONFIG = {
  ROLL_DURATION: 2000,
  FRAME_INTERVAL: 33,
  RESULT_DELAY: 100,
  RESULT_DISPLAY_DURATION: 2000,
  MIN_DISPLAY_TIME: 500
} as const;

interface DiceAnimationProps {
  targetNumber: number | null;
  isRolling: boolean;
  onAnimationComplete?: () => void;
}

// Helper component for rendering dice dots
const DiceDots: React.FC<{ number: number }> = ({ number }) => {
  // For 1-6: render traditional dice dot patterns
  if (number >= 1 && number <= 6) {
    return (
      <div className={`dice-dots dots-${number}`}>
        {number === 1 && (
          <div className="dice-dot center"></div>
        )}
        {number === 2 && (
          <>
            <div className="dice-dot top-left"></div>
            <div className="dice-dot bottom-right"></div>
          </>
        )}
        {number === 3 && (
          <>
            <div className="dice-dot top-left"></div>
            <div className="dice-dot center"></div>
            <div className="dice-dot bottom-right"></div>
          </>
        )}
        {number === 4 && (
          <>
            <div className="dice-dot top-left"></div>
            <div className="dice-dot top-right"></div>
            <div className="dice-dot bottom-left"></div>
            <div className="dice-dot bottom-right"></div>
          </>
        )}
        {number === 5 && (
          <>
            <div className="dice-dot top-left"></div>
            <div className="dice-dot top-right"></div>
            <div className="dice-dot center"></div>
            <div className="dice-dot bottom-left"></div>
            <div className="dice-dot bottom-right"></div>
          </>
        )}
        {number === 6 && (
          <>
            <div className="dice-dot top-left"></div>
            <div className="dice-dot top-right"></div>
            <div className="dice-dot middle-left"></div>
            <div className="dice-dot middle-right"></div>
            <div className="dice-dot bottom-left"></div>
            <div className="dice-dot bottom-right"></div>
          </>
        )}
      </div>
    );
  }

  // For 0, 7-100: render number in monospace font
  return <span className="dice-number-display">{number}</span>;
};

export const DiceAnimation: React.FC<DiceAnimationProps> = ({
  targetNumber,
  isRolling,
  onAnimationComplete
}) => {
  const [displayNumber, setDisplayNumber] = useState(0);
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'rolling' | 'complete'>('idle');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start rolling animation
  useEffect(() => {
    if (isRolling) {
      setAnimationPhase('rolling');
      setDisplayNumber(0);

      intervalRef.current = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * 101));
      }, ANIMATION_CONFIG.FRAME_INTERVAL);

      // Add a safety timeout to prevent infinite rolling (10 seconds max)
      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setAnimationPhase('complete');
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      }, 10000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }
  }, [isRolling, onAnimationComplete]);

  // Show result when backend returns (fixed race condition)
  useEffect(() => {
    if (targetNumber !== null && isRolling) {
      // Clear any existing animation interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Clear timeout since we got a result
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Small delay to ensure at least some rolling animation is shown
      setTimeout(() => {
        setDisplayNumber(targetNumber);
        setAnimationPhase('complete');

        if (onAnimationComplete) {
          onAnimationComplete();
        }
      }, Math.min(500, ANIMATION_CONFIG.ROLL_DURATION));
    }
  }, [targetNumber, isRolling, onAnimationComplete]);

  // Reset when not rolling
  useEffect(() => {
    if (!isRolling && animationPhase === 'complete') {
      const timeoutId = setTimeout(() => {
        setAnimationPhase('idle');
      }, ANIMATION_CONFIG.RESULT_DISPLAY_DURATION);

      return () => clearTimeout(timeoutId);
    }
  }, [isRolling, animationPhase]);

  // Calculate opposite face numbers for traditional dice
  const getOppositeFace = (num: number): number => {
    if (num >= 1 && num <= 6) {
      return 7 - num;
    }
    return (num + 50) % 101; // For 0-100, just offset by 50
  };

  // Calculate adjacent face numbers
  const getAdjacentFaces = (num: number): [number, number, number, number] => {
    if (num >= 1 && num <= 6) {
      // Traditional dice face arrangement
      const adjacent: Record<number, [number, number, number, number]> = {
        1: [2, 3, 4, 5],
        2: [1, 3, 5, 6],
        3: [1, 2, 4, 6],
        4: [1, 3, 5, 6],
        5: [1, 2, 4, 6],
        6: [2, 3, 4, 5]
      };
      return adjacent[num];
    }
    // For larger numbers, just use variations
    return [
      (num + 25) % 101,
      (num + 50) % 101,
      (num + 75) % 101,
      (num + 33) % 101
    ];
  };

  const adjacentFaces = getAdjacentFaces(displayNumber);

  return (
    <div className="dice-container">
      {/* 3D dice cube with 6 faces */}
      <div className={`dice-cube ${animationPhase === 'rolling' ? 'rolling-animation' : ''}`}>
        {/* Front face (showing current number) */}
        <div className="dice-face dice-face-front">
          <DiceDots number={displayNumber} />
        </div>

        {/* Back face (opposite number) */}
        <div className="dice-face dice-face-back">
          <DiceDots number={getOppositeFace(displayNumber)} />
        </div>

        {/* Right face */}
        <div className="dice-face dice-face-right">
          <DiceDots number={adjacentFaces[0]} />
        </div>

        {/* Left face */}
        <div className="dice-face dice-face-left">
          <DiceDots number={adjacentFaces[1]} />
        </div>

        {/* Top face */}
        <div className="dice-face dice-face-top">
          <DiceDots number={adjacentFaces[2]} />
        </div>

        {/* Bottom face */}
        <div className="dice-face dice-face-bottom">
          <DiceDots number={adjacentFaces[3]} />
        </div>
      </div>

      {/* Result glow with DFINITY turquoise */}
      {animationPhase === 'complete' && targetNumber !== null && (
        <div className="result-glow-turquoise"></div>
      )}
    </div>
  );
};
