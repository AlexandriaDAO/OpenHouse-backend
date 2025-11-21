import React, { useEffect, useState, useRef } from 'react';
import './DiceAnimation.css';

// Animation timing constants
const ANIMATION_CONFIG = {
  FRAME_INTERVAL: 100, // Reduced update rate (100ms = 10fps) for performance
  MIN_DISPLAY_TIME: 500,
  RESULT_DISPLAY_DURATION: 2000
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
      // Clear any previous timeouts
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      // Start number shuffling
      intervalRef.current = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * 101));
      }, ANIMATION_CONFIG.FRAME_INTERVAL);

      // Safety timeout (10s)
      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setAnimationPhase('complete');
        onAnimationComplete?.();
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

  // Show result when backend returns
  useEffect(() => {
    if (targetNumber !== null && isRolling) {
      // Add a small delay to ensure the roll is perceived
      const minRollTime = setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        setDisplayNumber(targetNumber);
        setAnimationPhase('complete');
        onAnimationComplete?.();
      }, ANIMATION_CONFIG.MIN_DISPLAY_TIME);

      return () => clearTimeout(minRollTime);
    }
  }, [targetNumber, isRolling, onAnimationComplete]);

  // Reset to idle after display duration
  useEffect(() => {
    if (animationPhase === 'complete' && !isRolling) {
      const timer = setTimeout(() => {
        setAnimationPhase('idle');
      }, ANIMATION_CONFIG.RESULT_DISPLAY_DURATION);
      return () => clearTimeout(timer);
    }
  }, [animationPhase, isRolling]);

  // Calculate opposite/adjacent faces for visual consistency
  const getOppositeFace = (num: number): number => {
    if (num >= 1 && num <= 6) return 7 - num;
    return (num + 50) % 101;
  };

  const getAdjacentFaces = (num: number): [number, number, number, number] => {
    // Just generate consistent pseudorandom neighbors based on the number
    return [
      (num + 23) % 101,
      (num + 47) % 101,
      (num + 71) % 101,
      (num + 13) % 101
    ];
  };

  const adjacentFaces = getAdjacentFaces(displayNumber);

  return (
    <div className="dice-container">
      <div 
        className={`dice-scaler ${
          animationPhase === 'complete' ? 'landing-animation' : ''
        }`}
      >
        <div 
          className={`dice-cube ${
            animationPhase === 'rolling' ? 'rolling-animation' : ''
          }`}
        >
          {/* Front face (showing current number) */}
          <div className="dice-face dice-face-front">
            <DiceDots number={displayNumber} />
          </div>

          {/* Back face */}
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
      </div>

      {/* Result glow */}
      {animationPhase === 'complete' && targetNumber !== null && (
        <div className="result-glow-turquoise"></div>
      )}
    </div>
  );
};