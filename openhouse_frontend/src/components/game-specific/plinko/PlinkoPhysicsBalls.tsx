import React, { useEffect, useRef, useState } from 'react';
import { PLINKO_LAYOUT } from './plinkoAnimations';
import { PlinkoPhysicsEngine, BallState } from './PlinkoEngine';

interface PendingBall {
  id: number;
  path: boolean[];
}

interface PlinkoPhysicsBallsProps {
  rows: number;
  // Filling phase props
  isFilling?: boolean;
  fillBallCount?: number;
  onFillingComplete?: () => void;
  // Releasing/playing phase props
  isReleasing?: boolean;
  pendingBalls?: PendingBall[];
  onAllBallsLanded: () => void;
  onBallLanded?: (slotIndex: number) => void;
  staggerMs?: number;
}

export const PlinkoPhysicsBalls: React.FC<PlinkoPhysicsBallsProps> = ({
  rows,
  isFilling = false,
  fillBallCount = 0,
  onFillingComplete,
  isReleasing = false,
  pendingBalls = [],
  onAllBallsLanded,
  onBallLanded,
  staggerMs = PLINKO_LAYOUT.BALL_STAGGER_MS,
}) => {
  const engineRef = useRef<PlinkoPhysicsEngine | null>(null);
  const [ballStates, setBallStates] = useState<Map<number, BallState>>(new Map());
  const landedBallsRef = useRef<Set<number>>(new Set());
  const totalBallsRef = useRef<number>(0);
  const hasStartedFillingRef = useRef(false);
  const settleCheckIntervalRef = useRef<number | null>(null);
  const hasNotifiedSettledRef = useRef(false);

  // Use refs for callbacks to avoid engine recreation
  const onBallLandedRef = useRef(onBallLanded);
  const onAllBallsLandedRef = useRef(onAllBallsLanded);
  const onFillingCompleteRef = useRef(onFillingComplete);

  // Keep refs in sync with props
  useEffect(() => {
    onBallLandedRef.current = onBallLanded;
  }, [onBallLanded]);

  useEffect(() => {
    onAllBallsLandedRef.current = onAllBallsLanded;
  }, [onAllBallsLanded]);

  useEffect(() => {
    onFillingCompleteRef.current = onFillingComplete;
  }, [onFillingComplete]);

  // Initialize physics engine - ONLY depends on rows
  useEffect(() => {
    const engine = new PlinkoPhysicsEngine({
      rows,
      width: PLINKO_LAYOUT.BOARD_WIDTH,
      height: PLINKO_LAYOUT.BOARD_HEIGHT,
      onBallUpdate: (id, state) => {
        setBallStates(prev => {
          const next = new Map(prev);
          next.set(id, state);
          return next;
        });
      },
      onBallLanded: (id, slotIndex) => {
        landedBallsRef.current.add(id);
        setBallStates(prev => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });

        // Notify parent of the slot where ball landed (use ref)
        onBallLandedRef.current?.(slotIndex);

        // Check if all balls have landed
        if (landedBallsRef.current.size === totalBallsRef.current && totalBallsRef.current > 0) {
          setTimeout(() => {
            onAllBallsLandedRef.current();
          }, 100);
        }
      },
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.destroy();
      engineRef.current = null;
      if (settleCheckIntervalRef.current) {
        clearInterval(settleCheckIntervalRef.current);
        settleCheckIntervalRef.current = null;
      }
    };
  }, [rows]); // ONLY rows - callbacks via refs

  // Track previous filling state to detect when filling starts fresh
  const prevFillingRef = useRef(false);

  // Handle filling phase - drop balls into bucket
  useEffect(() => {
    // Detect when isFilling transitions from false to true (new game starting)
    const justStartedFilling = isFilling && !prevFillingRef.current;
    prevFillingRef.current = isFilling;

    // If just started filling, reset the flag to allow ball creation
    if (justStartedFilling) {
      hasStartedFillingRef.current = false;
      console.log('[PlinkoPhysicsBalls] Filling started fresh, resetting hasStartedFillingRef');

      // Clear any previous state from engine and React
      if (engineRef.current) {
        engineRef.current.clearAllBalls();
        setBallStates(new Map());
      }
    }

    if (isFilling && fillBallCount > 0 && engineRef.current && !hasStartedFillingRef.current) {
      hasStartedFillingRef.current = true;
      hasNotifiedSettledRef.current = false;
      totalBallsRef.current = fillBallCount;
      landedBallsRef.current = new Set();

      console.log(`[PlinkoPhysicsBalls] Creating ${fillBallCount} balls with stagger ${staggerMs}ms`);

      // IMPORTANT: Set expected ball count BEFORE creating balls
      // This ensures areBallsSettled() won't return true until all balls are created
      engineRef.current.setExpectedBallCount(fillBallCount);

      // Drop balls into bucket with stagger - IDs 0 to fillBallCount-1
      for (let i = 0; i < fillBallCount; i++) {
        engineRef.current.dropBallIntoBucket(i, i * staggerMs);
      }

      // Start checking if balls have settled
      settleCheckIntervalRef.current = window.setInterval(() => {
        if (engineRef.current && !hasNotifiedSettledRef.current) {
          if (engineRef.current.areBallsSettled()) {
            hasNotifiedSettledRef.current = true;
            console.log('[PlinkoPhysicsBalls] Balls settled, calling onFillingComplete');
            onFillingCompleteRef.current?.();
          }
        }
      }, 100);
    }
  }, [isFilling, fillBallCount, staggerMs]);

  // Handle release phase - open bucket and assign paths
  useEffect(() => {
    if (isReleasing && pendingBalls && pendingBalls.length > 0 && engineRef.current) {
      // Clear settle check interval
      if (settleCheckIntervalRef.current) {
        clearInterval(settleCheckIntervalRef.current);
        settleCheckIntervalRef.current = null;
      }

      // Assign paths to balls - use INDEX as the ID (0, 1, 2...)
      // because that's how we created them in dropBallIntoBucket
      pendingBalls.forEach((ball, index) => {
        engineRef.current?.assignPathToBall(index, ball.path);
      });

      // Open bucket gate - balls fall naturally through pegs
      engineRef.current.openBucket();
    }
  }, [isReleasing, pendingBalls]);

  // Reset when not filling and not releasing (game ended)
  useEffect(() => {
    if (!isFilling && !isReleasing && engineRef.current) {
      // Only reset if we previously started
      if (hasStartedFillingRef.current) {
        hasStartedFillingRef.current = false;
        hasNotifiedSettledRef.current = false;

        // Clear any leftover settle check
        if (settleCheckIntervalRef.current) {
          clearInterval(settleCheckIntervalRef.current);
          settleCheckIntervalRef.current = null;
        }

        // Reset bucket for next round
        engineRef.current.resetBucket();
      }
    }
  }, [isFilling, isReleasing]);

  // Calculate bucket dimensions for clipping during fill phase
  // Must match the physics engine bucket calculation
  const centerX = PLINKO_LAYOUT.BOARD_WIDTH / 2;
  const pinDistanceX = (PLINKO_LAYOUT.BOARD_WIDTH - PLINKO_LAYOUT.PADDING_X * 2) / (2 + rows);
  const rowPaddingX = PLINKO_LAYOUT.PADDING_X + ((rows - 1) * pinDistanceX) / 2;
  const firstRowSpan = (PLINKO_LAYOUT.BOARD_WIDTH - rowPaddingX * 2);
  const bucketWidth = Math.min(140, firstRowSpan - 20);

  const BUCKET = {
    TOP_Y: -50,   // Extended up to show balls as they spawn
    BOTTOM_Y: 72,  // Slightly extended to show full bucket
    WIDTH: bucketWidth,
  };

  // Calculate ball radius to match physics engine exactly
  // Formula: (24 - rows) / 2 * 0.53
  const physicsRadius = ((24 - rows) / 2) * 0.53;
  // Use slightly larger visual radius for better look, but close to physics
  const visualRadius = physicsRadius;

  return (
    <g>
      {/* SVG defs for ball rendering */}
      <defs>
        {/* Ball gradient - metallic gold */}
        <radialGradient id="physicsBallGradient" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fff7cc" />
          <stop offset="30%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#daa520" />
          <stop offset="100%" stopColor="#b8860b" />
        </radialGradient>

        {/* Ball shadow filter */}
        <filter id="physicsBallShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>

        {/* Clip path for bucket area during filling */}
        <clipPath id="bucketClip">
          <rect
            x={centerX - BUCKET.WIDTH / 2}
            y={BUCKET.TOP_Y}
            width={BUCKET.WIDTH}
            height={BUCKET.BOTTOM_Y - BUCKET.TOP_Y}
          />
        </clipPath>
      </defs>

      {/* Render balls - clip to bucket during filling, full view when releasing */}
      {isFilling && !isReleasing ? (
        <g clipPath="url(#bucketClip)">
          {Array.from(ballStates.entries()).map(([id, state]) => (
            <PhysicsBall key={id} state={state} radius={visualRadius} />
          ))}
        </g>
      ) : (
        Array.from(ballStates.entries()).map(([id, state]) => (
          <PhysicsBall key={id} state={state} radius={visualRadius} />
        ))
      )}
    </g>
  );
};

// Individual ball renderer - unified with tunnel balls
const PhysicsBall: React.FC<{ state: BallState; radius: number }> = ({ state, radius }) => {
  const { x, y, rotation } = state;

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${rotation})`}
    >
      <g filter="url(#physicsBallShadow)">
        {/* Drop shadow */}
        <ellipse
          cx={2}
          cy={radius + 2}
          rx={radius * 0.7}
          ry={radius * 0.25}
          fill="black"
          opacity={0.15}
        />

        {/* Main ball */}
        <circle
          r={radius}
          fill="url(#physicsBallGradient)"
        />

        {/* Specular highlight */}
        <ellipse
          cx={-radius * 0.3}
          cy={-radius * 0.3}
          rx={radius * 0.35}
          ry={radius * 0.25}
          fill="white"
          opacity={0.6}
        />

        {/* Secondary highlight */}
        <circle
          cx={-radius * 0.15}
          cy={-radius * 0.45}
          r={radius * 0.1}
          fill="white"
          opacity={0.8}
        />
      </g>
    </g>
  );
};

export default PlinkoPhysicsBalls;
