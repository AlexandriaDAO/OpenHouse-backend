import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PLINKO_LAYOUT } from './plinkoAnimations';
import { TunnelPhysicsEngine, TunnelBallState } from './TunnelPhysicsEngine';

interface TunnelFillingBallsProps {
  ballCount: number;
  isFilling: boolean;
  isReleasing?: boolean;
  onFillingComplete?: () => void;
  onRelease?: (states: TunnelBallState[]) => void;
  staggerMs?: number;
}

/**
 * Physics-based animation of balls dropping into the release tunnel.
 * Provides visual feedback while waiting for backend response.
 */
export const TunnelFillingBalls: React.FC<TunnelFillingBallsProps> = ({
  ballCount,
  isFilling,
  isReleasing,
  onFillingComplete,
  onRelease,
  staggerMs = 60,
}) => {
  const engineRef = useRef<TunnelPhysicsEngine | null>(null);
  const [ballStates, setBallStates] = useState<Map<number, TunnelBallState>>(new Map());
  const hasStartedRef = useRef(false);

  const centerX = PLINKO_LAYOUT.BOARD_WIDTH / 2;

  // Initialize/cleanup physics engine
  useEffect(() => {
    const engine = new TunnelPhysicsEngine({
      centerX,
      onBallUpdate: (states) => {
        setBallStates(new Map(states));
      },
      onAllSettled: () => {
        onFillingComplete?.();
      },
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.destroy();
      engineRef.current = null;
      hasStartedRef.current = false;
    };
  }, [centerX, onFillingComplete]);

  // Handle release
  useEffect(() => {
    if (isReleasing && engineRef.current) {
      // Get ball states with velocity before they fall
      const states = Array.from(engineRef.current.getBallStates().values());
      onRelease?.(states);
      // Remove gate so balls fall through
      engineRef.current.removeGate();
    }
  }, [isReleasing, onRelease]);

  // Start dropping balls when filling begins
  useEffect(() => {
    if (isFilling && engineRef.current && !hasStartedRef.current) {
      hasStartedRef.current = true;
      engineRef.current.dropBalls(ballCount, staggerMs);
    }
  }, [isFilling, ballCount, staggerMs]);

  // Reset when not filling AND not releasing
  useEffect(() => {
    if (!isFilling && !isReleasing) {
      hasStartedRef.current = false;
      setBallStates(new Map());
      // Recreate engine for next fill
      if (engineRef.current) {
        engineRef.current.destroy();
        const engine = new TunnelPhysicsEngine({
          centerX,
          onBallUpdate: (states) => {
            setBallStates(new Map(states));
          },
          onAllSettled: () => {
            onFillingComplete?.();
          },
        });
        engineRef.current = engine;
        engine.start();
      }
    }
  }, [isFilling, isReleasing, centerX, onFillingComplete]);

  if ((!isFilling && !isReleasing) || ballStates.size === 0) return null;

  // Tunnel dimensions (must match TunnelPhysicsEngine and ReleaseTunnel)
  const BUCKET_WIDTH = 140;
  const BUCKET_TOP_Y = 5;
  const BUCKET_BOTTOM_Y = 70;

  return (
    <g>
      {/* Defs for ball rendering */}
      <defs>
        {/* Ball gradient - metallic gold (matches board balls) */}
        <radialGradient id="tunnelBallGradient" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fff7cc" />
          <stop offset="30%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#daa520" />
          <stop offset="100%" stopColor="#b8860b" />
        </radialGradient>

        {/* Ball shadow filter (matches board balls) */}
        <filter id="tunnelBallShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>

        {/* Clip to box shape */}
        <clipPath id="tunnelFillClip">
          <rect
            x={centerX - BUCKET_WIDTH/2}
            y={BUCKET_TOP_Y}
            width={BUCKET_WIDTH}
            height={BUCKET_BOTTOM_Y - BUCKET_TOP_Y}
          />
        </clipPath>
      </defs>

      <g clipPath="url(#tunnelFillClip)">
        <motion.g
          animate={{ opacity: isReleasing ? 0 : 1 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {Array.from(ballStates.entries()).map(([id, state]) => (
            <TunnelBall key={id} state={state} />
          ))}
        </motion.g>
      </g>
    </g>
  );
};

// Individual ball renderer - matches PlinkoPhysicsBalls exactly
const BALL_RADIUS = 8;  // Unified with board balls (was 5)

const TunnelBall: React.FC<{ state: TunnelBallState }> = ({ state }) => {
  const { x, y, rotation } = state;

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      <g filter="url(#tunnelBallShadow)">
        {/* Drop shadow - matches board balls */}
        <ellipse
          cx={2}
          cy={BALL_RADIUS + 2}
          rx={BALL_RADIUS * 0.7}
          ry={BALL_RADIUS * 0.25}
          fill="black"
          opacity={0.15}
        />

        {/* Main ball */}
        <circle r={BALL_RADIUS} fill="url(#tunnelBallGradient)" />

        {/* Specular highlight - matches board balls */}
        <ellipse
          cx={-BALL_RADIUS * 0.3}
          cy={-BALL_RADIUS * 0.3}
          rx={BALL_RADIUS * 0.35}
          ry={BALL_RADIUS * 0.25}
          fill="white"
          opacity={0.6}
        />

        {/* Secondary highlight - matches board balls */}
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

export default TunnelFillingBalls;
