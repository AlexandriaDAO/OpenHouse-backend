import React, { useEffect, useState, useRef } from 'react';
import './DiceAnimation.css';

// Animation timing constants
const ANIMATION_CONFIG = {
  ROLL_DURATION: 2000,
  FRAME_INTERVAL: 33,
  RESULT_DELAY: 100,
  RESULT_DISPLAY_DURATION: 2000,
  MIN_DISPLAY_TIME: 500 // Minimum time to display result even if backend is very fast
} as const;

interface DiceAnimationProps {
  targetNumber: number | null;
  isRolling: boolean;
  onAnimationComplete?: () => void;
}

export const DiceAnimation: React.FC<DiceAnimationProps> = ({
  targetNumber,
  isRolling,
  onAnimationComplete
}) => {
  // State for current displayed number during animation
  const [displayNumber, setDisplayNumber] = useState(0);
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'rolling' | 'complete'>('idle');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start rolling animation when isRolling becomes true
  useEffect(() => {
    if (isRolling) {
      // Explicitly reset animation state for new roll
      setAnimationPhase('rolling');
      setDisplayNumber(0);

      // Continuously cycle through random numbers until backend returns result
      // No maxFrames - animation continues indefinitely until targetNumber arrives
      intervalRef.current = setInterval(() => {
        // Generate random number 0-100 for visual effect (matching dice range)
        setDisplayNumber(Math.floor(Math.random() * 101));
      }, ANIMATION_CONFIG.FRAME_INTERVAL);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [isRolling]);

  // When backend returns result, immediately show it (no delay)
  useEffect(() => {
    if (targetNumber !== null && animationPhase === 'rolling') {
      // Stop the random number animation immediately
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Show the actual result immediately (no setTimeout delay!)
      setDisplayNumber(targetNumber);
      setAnimationPhase('complete');

      // Call completion callback if provided
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    }
  }, [targetNumber, animationPhase, onAnimationComplete]);

  // Reset when not rolling
  useEffect(() => {
    if (!isRolling && animationPhase === 'complete') {
      const timeoutId = setTimeout(() => {
        setAnimationPhase('idle');
      }, ANIMATION_CONFIG.RESULT_DISPLAY_DURATION);

      // Cleanup timeout on unmount or deps change
      return () => clearTimeout(timeoutId);
    }
  }, [isRolling, animationPhase]);

  return (
    <div className="dice-container">
      {/* 3D Dice Visualization */}
      <div className={`dice-cube ${animationPhase === 'rolling' ? 'rolling-animation' : ''}`}>
        {/* Main dice display */}
        <div className="dice-face">
          <span className="dice-number">{displayNumber}</span>
        </div>

        {/* Visual effects during roll */}
        {animationPhase === 'rolling' && (
          <div className="rolling-effects"></div>
        )}
      </div>

      {/* Result indicator when complete */}
      {animationPhase === 'complete' && targetNumber !== null && (
        <div className="result-glow"></div>
      )}
    </div>
  );
};
