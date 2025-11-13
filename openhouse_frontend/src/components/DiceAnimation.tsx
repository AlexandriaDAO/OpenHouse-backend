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
  const animationStartTimeRef = useRef<number | null>(null);

  // Start rolling animation when isRolling becomes true
  useEffect(() => {
    if (isRolling) {
      // Track animation start time for race condition fix
      animationStartTimeRef.current = Date.now();

      // Explicitly reset animation state for new roll
      setAnimationPhase('rolling');
      setDisplayNumber(0);

      // Rapidly cycle through random numbers
      let frameCount = 0;
      const maxFrames = Math.floor(ANIMATION_CONFIG.ROLL_DURATION / ANIMATION_CONFIG.FRAME_INTERVAL);

      const interval = setInterval(() => {
        // Generate random number 0-100 for visual effect (matching dice range)
        setDisplayNumber(Math.floor(Math.random() * 101));
        frameCount++;

        if (frameCount >= maxFrames) {
          clearInterval(interval);
        }
      }, ANIMATION_CONFIG.FRAME_INTERVAL);

      return () => {
        clearInterval(interval);
        animationStartTimeRef.current = null;
      };
    }
  }, [isRolling]);

  // When backend returns result, slow down and land on target
  useEffect(() => {
    if (targetNumber !== null && animationPhase === 'rolling') {
      // Calculate elapsed time since animation started
      const elapsed = animationStartTimeRef.current
        ? Date.now() - animationStartTimeRef.current
        : 0;

      // Calculate remaining animation time with minimum display time to prevent jarring instant results
      const remainingTime = Math.max(
        ANIMATION_CONFIG.MIN_DISPLAY_TIME,
        ANIMATION_CONFIG.ROLL_DURATION + ANIMATION_CONFIG.RESULT_DELAY - elapsed
      );

      // Land on target number after remaining animation time
      const timeoutId = setTimeout(() => {
        setDisplayNumber(targetNumber);
        setAnimationPhase('complete');
        // Call completion callback if provided
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      }, remainingTime);

      // Cleanup timeout on unmount or deps change
      return () => clearTimeout(timeoutId);
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
