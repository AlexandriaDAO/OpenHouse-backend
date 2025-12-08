import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PLINKO_LAYOUT } from './plinkoAnimations';
import { PlinkoPhysicsEngine, BallState } from './PlinkoEngine';

interface PendingBall {
  id: number;
  path: boolean[];
}

interface PlinkoPhysicsBallsProps {
  rows: number;
  pendingBalls: PendingBall[];
  onAllBallsLanded: () => void;
  onBallLanded?: (slotIndex: number) => void;
  staggerMs?: number;
}

export const PlinkoPhysicsBalls: React.FC<PlinkoPhysicsBallsProps> = ({
  rows,
  pendingBalls,
  onAllBallsLanded,
  onBallLanded,
  staggerMs = PLINKO_LAYOUT.BALL_STAGGER_MS,
}) => {
  const engineRef = useRef<PlinkoPhysicsEngine | null>(null);
  const [ballStates, setBallStates] = useState<Map<number, BallState>>(new Map());
  const droppedBallsRef = useRef<Set<number>>(new Set());
  const landedBallsRef = useRef<Set<number>>(new Set());
  const totalBallsRef = useRef<number>(0);

  // Initialize physics engine
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

        // Notify parent of the slot where ball landed
        onBallLanded?.(slotIndex);

        // Check if all balls have landed
        if (landedBallsRef.current.size === totalBallsRef.current && totalBallsRef.current > 0) {
          setTimeout(() => {
            onAllBallsLanded();
          }, 100);
        }
      },
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [rows, onAllBallsLanded, onBallLanded]);

  // Drop balls with stagger
  useEffect(() => {
    if (!engineRef.current || pendingBalls.length === 0) return;

    // Reset tracking for new batch
    droppedBallsRef.current = new Set();
    landedBallsRef.current = new Set();
    totalBallsRef.current = pendingBalls.length;

    // Drop each ball with stagger delay
    pendingBalls.forEach((ball, index) => {
      setTimeout(() => {
        if (engineRef.current && !droppedBallsRef.current.has(ball.id)) {
          droppedBallsRef.current.add(ball.id);
          engineRef.current.dropBall(ball.id, ball.path);
        }
      }, index * staggerMs);
    });
  }, [pendingBalls, staggerMs]);

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
      </defs>

      {/* Render each ball */}
      {Array.from(ballStates.entries()).map(([id, state]) => (
        <PhysicsBall key={id} state={state} />
      ))}
    </g>
  );
};

// Individual ball renderer
// Ball radius = pinRadius * 2, scaled for our 400px canvas (vs 760px original)
// For 8 rows: (24-8)/2 * 2 * 0.53 ≈ 8.5
const BALL_RADIUS = 8.5;

const PhysicsBall: React.FC<{ state: BallState }> = ({ state }) => {
  const { x, y, rotation } = state;

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${rotation})`}
    >
      <g filter="url(#physicsBallShadow)">
        {/* Drop shadow */}
        <ellipse
          cx={2}
          cy={BALL_RADIUS + 2}
          rx={BALL_RADIUS * 0.7}
          ry={BALL_RADIUS * 0.25}
          fill="black"
          opacity={0.15}
        />

        {/* Main ball */}
        <circle
          r={BALL_RADIUS}
          fill="url(#physicsBallGradient)"
        />

        {/* Specular highlight */}
        <ellipse
          cx={-BALL_RADIUS * 0.3}
          cy={-BALL_RADIUS * 0.3}
          rx={BALL_RADIUS * 0.35}
          ry={BALL_RADIUS * 0.25}
          fill="white"
          opacity={0.6}
        />

        {/* Secondary highlight */}
        <circle
          cx={-BALL_RADIUS * 0.15}
          cy={-BALL_RADIUS * 0.45}
          r={BALL_RADIUS * 0.1}
          fill="white"
          opacity={0.8}
        />
      </g>
    </g>
  );
};

export default PlinkoPhysicsBalls;
