import React, { useEffect, useState } from 'react';
import './DiceAnimation.css';

// Animation timing constants
const ANIMATION_CONFIG = {
  ROLL_DURATION: 2000,
  FRAME_INTERVAL: 33,
  RESULT_DELAY: 100,
  RESULT_DISPLAY_DURATION: 2000
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

  // Start rolling animation when isRolling becomes true
  useEffect(() => {
    if (isRolling) {
      // Start rolling animation
      setAnimationPhase('rolling');

      // Rapidly cycle through random numbers
      let frameCount = 0;
      const maxFrames = Math.floor(ANIMATION_CONFIG.ROLL_DURATION / ANIMATION_CONFIG.FRAME_INTERVAL);

      const interval = setInterval(() => {
        // Generate random number 0-100 for visual effect
        setDisplayNumber(Math.floor(Math.random() * 101));
        frameCount++;

        if (frameCount >= maxFrames) {
          clearInterval(interval);
        }
      }, ANIMATION_CONFIG.FRAME_INTERVAL);

      return () => clearInterval(interval);
    }
  }, [isRolling]);

  // When backend returns result, slow down and land on target
  useEffect(() => {
    if (targetNumber !== null && animationPhase === 'rolling') {
      // After backend returns result, slow down and land on target
      setTimeout(() => {
        setDisplayNumber(targetNumber);
        setAnimationPhase('complete');
        // Call completion callback if provided
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      }, ANIMATION_CONFIG.ROLL_DURATION + ANIMATION_CONFIG.RESULT_DELAY);
    }
  }, [targetNumber, animationPhase]); // Removed onAnimationComplete from deps - using it in closure is fine

  // Reset when not rolling
  useEffect(() => {
    if (!isRolling && animationPhase === 'complete') {
      setTimeout(() => {
        setAnimationPhase('idle');
      }, ANIMATION_CONFIG.RESULT_DISPLAY_DURATION);
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
