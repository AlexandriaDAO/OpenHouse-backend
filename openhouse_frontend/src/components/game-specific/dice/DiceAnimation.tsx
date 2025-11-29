import React, { useEffect, useState, useRef } from 'react';
import './DiceAnimation.css';

// Animation timing constants
const ANIMATION_CONFIG = {
  FAST_INTERVAL: 50,            // Fast rolling interval
  SLOWDOWN_DELAYS: [100, 150, 250, 400, 600], // Progressive slowdown steps
  RESULT_DISPLAY_DURATION: 2000
} as const;

interface DiceAnimationProps {
  targetNumber: number | null;
  isRolling: boolean;
  onAnimationComplete?: () => void;
  onClick?: () => void;
}

export const DiceAnimation: React.FC<DiceAnimationProps> = ({
  targetNumber,
  isRolling,
  onAnimationComplete,
  onClick
}) => {
  const [displayNumber, setDisplayNumber] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowdownTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear all timers helper
  const clearAllTimers = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    slowdownTimeoutsRef.current.forEach(t => clearTimeout(t));
    slowdownTimeoutsRef.current = [];
  };

  // Main rolling effect
  useEffect(() => {
    // Clear everything first
    clearAllTimers();

    if (isRolling && targetNumber === null) {
      // Start fast rolling
      setIsComplete(false);
      intervalRef.current = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * 101));
      }, ANIMATION_CONFIG.FAST_INTERVAL);
    } else if (isRolling && targetNumber !== null) {
      // We have a result - do slowdown sequence
      setIsComplete(false);

      let totalDelay = 0;
      ANIMATION_CONFIG.SLOWDOWN_DELAYS.forEach((delay) => {
        totalDelay += delay;
        const timeout = setTimeout(() => {
          setDisplayNumber(Math.floor(Math.random() * 101));
        }, totalDelay);
        slowdownTimeoutsRef.current.push(timeout);
      });

      // Final result
      totalDelay += ANIMATION_CONFIG.SLOWDOWN_DELAYS[ANIMATION_CONFIG.SLOWDOWN_DELAYS.length - 1];
      const finalTimeout = setTimeout(() => {
        setDisplayNumber(targetNumber);
        setIsComplete(true);
        onAnimationComplete?.();
      }, totalDelay);
      slowdownTimeoutsRef.current.push(finalTimeout);
    } else if (!isRolling) {
      // Not rolling - reset to idle
      setIsComplete(false);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      clearAllTimers();
    };
  }, [isRolling, targetNumber, onAnimationComplete]);

  // Reset complete state after display duration
  useEffect(() => {
    if (isComplete && !isRolling) {
      const timer = setTimeout(() => {
        setIsComplete(false);
      }, ANIMATION_CONFIG.RESULT_DISPLAY_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isComplete, isRolling]);

  const isAnimating = isRolling && !isComplete;

  return (
    <div 
      className={`dice-container ${onClick ? 'cursor-pointer' : ''}`} 
      onClick={!isRolling && onClick ? onClick : undefined}
    >
      <div className={`dice-box ${isComplete ? 'result-landed' : ''} ${isAnimating ? 'rolling' : ''}`}>
        <div className="number-display">
          {displayNumber}
        </div>
      </div>

      {/* Result glow */}
      {isComplete && targetNumber !== null && (
        <div className="result-glow-turquoise"></div>
      )}
    </div>
  );
};
