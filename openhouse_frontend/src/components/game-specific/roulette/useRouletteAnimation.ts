import { useEffect, useRef, useState, useCallback } from 'react';
import { ANIMATION, getNumberAngle } from './rouletteConstants';

export interface AnimationState {
  ballAngle: number;
  wheelAngle: number;
  ballRadius: number;  // 100 = outer track, lower = more inward
  showResult: boolean;
}

interface UseRouletteAnimationProps {
  winningNumber: number | null;
  isSpinning: boolean;
  isLanding: boolean;
  onComplete?: () => void;
}

export function useRouletteAnimation({
  winningNumber,
  isSpinning,
  isLanding,
  onComplete,
}: UseRouletteAnimationProps): AnimationState {
  // Refs for animation values (avoid stale closures)
  const ballAngleRef = useRef(0);
  const wheelAngleRef = useRef(0);
  const landingStartRef = useRef<number | null>(null);
  const startBallAngleRef = useRef(0);
  const targetBallAngleRef = useRef(0);
  const frozenWheelRef = useRef(0);
  const completedRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  // State for rendering
  const [state, setState] = useState<AnimationState>({
    ballAngle: 0,
    wheelAngle: 0,
    ballRadius: 100,
    showResult: false,
  });

  // Calculate target position for ball to land on winning number
  const calculateTarget = useCallback((num: number, currentBall: number, finalWheel: number) => {
    const slotAngle = getNumberAngle(num);
    const screenTarget = (slotAngle + finalWheel) % 360;
    const currentNormalized = currentBall % 360;

    let diff = screenTarget - currentNormalized;
    if (diff < 0) diff += 360;

    return currentBall + (ANIMATION.EXTRA_SPINS * 360) + diff;
  }, []);

  // Main animation loop
  useEffect(() => {
    let lastTime = performance.now();
    completedRef.current = false;

    const animate = (timestamp: number) => {
      const dt = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      if (isSpinning) {
        // Fast spin phase
        ballAngleRef.current += ANIMATION.BALL_SPEED * dt;
        wheelAngleRef.current += ANIMATION.WHEEL_SPEED * dt;

        setState({
          ballAngle: ballAngleRef.current % 360,
          wheelAngle: wheelAngleRef.current % 360,
          ballRadius: 100,
          showResult: false,
        });

        frameRef.current = requestAnimationFrame(animate);

      } else if (isLanding && winningNumber !== null) {
        // Initialize landing phase
        if (landingStartRef.current === null) {
          landingStartRef.current = timestamp;
          startBallAngleRef.current = ballAngleRef.current;
          frozenWheelRef.current = wheelAngleRef.current;

          const finalWheel = frozenWheelRef.current + ANIMATION.WHEEL_DRIFT;
          targetBallAngleRef.current = calculateTarget(
            winningNumber,
            startBallAngleRef.current,
            finalWheel
          );
        }

        const elapsed = timestamp - landingStartRef.current;
        const progress = Math.min(elapsed / ANIMATION.LANDING_DURATION, 1);

        // Cubic ease-out for natural deceleration
        const eased = 1 - Math.pow(1 - progress, 3);

        // Interpolate ball position
        const newBall = startBallAngleRef.current +
          (targetBallAngleRef.current - startBallAngleRef.current) * eased;
        ballAngleRef.current = newBall;

        // Wheel drifts slowly to stop
        const newWheel = frozenWheelRef.current + (ANIMATION.WHEEL_DRIFT * eased);
        wheelAngleRef.current = newWheel;

        // Ball moves inward as it settles
        const radius = 100 - (eased * 15);

        setState({
          ballAngle: newBall,
          wheelAngle: newWheel,
          ballRadius: radius,
          showResult: progress >= 1,
        });

        if (progress >= 1) {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete?.();
          }
          return;
        }

        frameRef.current = requestAnimationFrame(animate);
      }
    };

    if (isSpinning || isLanding) {
      frameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isSpinning, isLanding, winningNumber, calculateTarget, onComplete]);

  // Reset when going idle
  useEffect(() => {
    if (!isSpinning && !isLanding && winningNumber === null) {
      landingStartRef.current = null;
      completedRef.current = false;
      setState(prev => ({ ...prev, showResult: false, ballRadius: 100 }));
    }
  }, [isSpinning, isLanding, winningNumber]);

  return state;
}
