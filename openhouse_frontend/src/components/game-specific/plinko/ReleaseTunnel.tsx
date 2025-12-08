import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLINKO_LAYOUT } from './plinkoAnimations';

interface ReleaseTunnelProps {
  ballCount: number;
  isOpen: boolean;
  isVisible: boolean;
  showBalls?: boolean; // If false, only show tunnel structure (balls rendered by physics)
}

/**
 * Release tunnel - pyramid shape (wide at bottom like the pins below).
 * Narrow tube extends up off-screen to hold overflow balls.
 */
export const ReleaseTunnel: React.FC<ReleaseTunnelProps> = ({
  ballCount,
  isOpen,
  isVisible,
  showBalls = true,
}) => {
  const { BOARD_WIDTH } = PLINKO_LAYOUT;
  const centerX = BOARD_WIDTH / 2;

  // Pyramid bucket dimensions - widened for 8px radius balls
  const BUCKET = {
    TOP_Y: 15,           // Where pyramid starts (narrow)
    BOTTOM_Y: 70,        // Where pyramid ends (wide) - gate location
    TOP_WIDTH: 40,       // Widened from 24 for 8px balls
    BOTTOM_WIDTH: 100,   // Widened from 80 for 8px balls
    GATE_HEIGHT: 4,
    TUBE_TOP: -100,      // Tube extends off-screen
  };

  const ballRadius = 8;  // Matches board balls for unified appearance
  const bucketHeight = BUCKET.BOTTOM_Y - BUCKET.TOP_Y;

  // Calculate ball positions - pyramid is wide at bottom, narrow at top
  // Overflow goes up the narrow tube off-screen
  const { pyramidBalls, tubeBalls } = useMemo(() => {
    const pyramid: { x: number; y: number; delay: number }[] = [];
    const tube: { x: number; y: number; delay: number }[] = [];
    const ballDiameter = ballRadius * 2;
    const spacing = ballDiameter + 1.5;

    // Stack balls from bottom (wide) to top (narrow) inside pyramid
    let currentY = BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT - ballRadius - 2;
    let ballIndex = 0;

    while (ballIndex < ballCount && currentY > BUCKET.TOP_Y + ballRadius) {
      // Calculate width at this Y position (linear: wide at bottom, narrow at top)
      const progress = (currentY - BUCKET.TOP_Y) / bucketHeight;
      const widthAtY = BUCKET.TOP_WIDTH + (BUCKET.BOTTOM_WIDTH - BUCKET.TOP_WIDTH) * progress;
      const ballsInRow = Math.max(1, Math.floor((widthAtY - 8) / spacing));

      const actualBallsInRow = Math.min(ballsInRow, ballCount - ballIndex);
      const rowWidth = actualBallsInRow * spacing - 1.5;
      const startX = -rowWidth / 2 + ballRadius;

      for (let col = 0; col < actualBallsInRow && ballIndex < ballCount; col++) {
        pyramid.push({
          x: startX + col * spacing,
          y: currentY,
          delay: ballIndex * 0.015,
        });
        ballIndex++;
      }

      currentY -= spacing * 0.9;
    }

    // Overflow balls go up the narrow tube (off-screen)
    const tubeWidth = BUCKET.TOP_WIDTH - 4;
    const ballsPerTubeRow = Math.max(1, Math.floor(tubeWidth / spacing));
    let tubeY = BUCKET.TOP_Y - ballRadius - 2;

    while (ballIndex < ballCount) {
      const tubeIndex = ballIndex - pyramid.length;
      const col = tubeIndex % ballsPerTubeRow;

      if (col === 0 && tubeIndex > 0) {
        tubeY -= spacing * 0.9;
      }

      const rowBalls = Math.min(ballsPerTubeRow, ballCount - pyramid.length - Math.floor(tubeIndex / ballsPerTubeRow) * ballsPerTubeRow);
      const rowWidth = rowBalls * spacing - 1.5;
      const startX = -rowWidth / 2 + ballRadius;

      tube.push({
        x: startX + col * spacing,
        y: tubeY,
        delay: ballIndex * 0.015,
      });
      ballIndex++;
    }

    return { pyramidBalls: pyramid, tubeBalls: tube };
  }, [ballCount, BUCKET, bucketHeight, ballRadius]);

  if (!isVisible) return null;

  return (
    <g transform={`translate(${centerX}, 0)`}>
      {/* SVG definitions */}
      <defs>
        <radialGradient id="tunnelBallGradient" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fff7cc" />
          <stop offset="30%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#daa520" />
          <stop offset="100%" stopColor="#b8860b" />
        </radialGradient>

        <linearGradient id="pyramidGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a202c" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#2d3748" stopOpacity="0.3" />
        </linearGradient>

        {/* Drop shadow filter to match board balls */}
        <filter id="tunnelBallShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>

        {/* Clip path for pyramid + tube shape */}
        <clipPath id="bucketClip">
          <path d={`
            M ${-BUCKET.TOP_WIDTH/2} ${BUCKET.TUBE_TOP}
            L ${BUCKET.TOP_WIDTH/2} ${BUCKET.TUBE_TOP}
            L ${BUCKET.TOP_WIDTH/2} ${BUCKET.TOP_Y}
            L ${BUCKET.BOTTOM_WIDTH/2} ${BUCKET.BOTTOM_Y}
            L ${-BUCKET.BOTTOM_WIDTH/2} ${BUCKET.BOTTOM_Y}
            L ${-BUCKET.TOP_WIDTH/2} ${BUCKET.TOP_Y}
            Z
          `} />
        </clipPath>
      </defs>

      {/* Narrow tube extending up (only visible part) - subtle */}
      <rect
        x={-BUCKET.TOP_WIDTH/2}
        y={0}
        width={BUCKET.TOP_WIDTH}
        height={BUCKET.TOP_Y}
        fill="url(#pyramidGradient)"
        opacity={0.3}
      />

      {/* Pyramid bucket body - subtle/transparent */}
      <path
        d={`
          M ${-BUCKET.TOP_WIDTH/2} ${BUCKET.TOP_Y}
          L ${BUCKET.TOP_WIDTH/2} ${BUCKET.TOP_Y}
          L ${BUCKET.BOTTOM_WIDTH/2} ${BUCKET.BOTTOM_Y}
          L ${-BUCKET.BOTTOM_WIDTH/2} ${BUCKET.BOTTOM_Y}
          Z
        `}
        fill="url(#pyramidGradient)"
        stroke="rgba(74, 85, 104, 0.2)"
        strokeWidth={1}
        opacity={0.3}
      />

      {/* Inner shadow for depth - more subtle */}
      <path
        d={`
          M ${-BUCKET.TOP_WIDTH/2 + 3} ${BUCKET.TOP_Y + 2}
          L ${BUCKET.TOP_WIDTH/2 - 3} ${BUCKET.TOP_Y + 2}
          L ${BUCKET.BOTTOM_WIDTH/2 - 4} ${BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT - 1}
          L ${-BUCKET.BOTTOM_WIDTH/2 + 4} ${BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT - 1}
          Z
        `}
        fill="#0a0a14"
        opacity={0.15}
      />

      {/* Tube balls (overflow, clipped) - only shown when showBalls is true */}
      {showBalls && (
        <g clipPath="url(#bucketClip)">
          <AnimatePresence>
            {tubeBalls.map((pos, i) => (
              <TunnelBall
                key={`tube-${i}`}
                x={pos.x}
                y={pos.y}
                radius={ballRadius}
                delay={pos.delay}
                isReleasing={isOpen}
                releaseDelay={(pyramidBalls.length + i) * 0.025}
              />
            ))}
          </AnimatePresence>
        </g>
      )}

      {/* Pyramid balls (clipped) - only shown when showBalls is true */}
      {showBalls && (
        <g clipPath="url(#bucketClip)">
          <AnimatePresence>
            {pyramidBalls.map((pos, i) => (
              <TunnelBall
                key={`pyramid-${i}`}
                x={pos.x}
                y={pos.y}
                radius={ballRadius}
                delay={pos.delay}
                isReleasing={isOpen}
                releaseDelay={i * 0.025}
              />
            ))}
          </AnimatePresence>
        </g>
      )}

      {/* Release gate at bottom (splits open) */}
      <motion.g
        animate={{ y: isOpen ? 12 : 0, opacity: isOpen ? 0 : 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        <rect
          x={-BUCKET.BOTTOM_WIDTH/2}
          y={BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT}
          width={BUCKET.BOTTOM_WIDTH}
          height={BUCKET.GATE_HEIGHT}
          fill="#4a5568"
          rx={1}
        />
      </motion.g>

      {/* Bottom edge decoration */}
      <rect
        x={-BUCKET.BOTTOM_WIDTH/2 - 2}
        y={BUCKET.BOTTOM_Y - 1}
        width={BUCKET.BOTTOM_WIDTH + 4}
        height={2}
        fill="#4a5568"
        rx={1}
      />
    </g>
  );
};

// Individual ball component
interface TunnelBallProps {
  x: number;
  y: number;
  radius: number;
  delay: number;
  isReleasing: boolean;
  releaseDelay: number;
}

const TunnelBall: React.FC<TunnelBallProps> = ({
  x,
  y,
  radius,
  delay,
  isReleasing,
  releaseDelay,
}) => {
  return (
    <motion.g
      initial={{ x, y, opacity: 0, scale: 0 }}
      animate={
        isReleasing
          ? {
              y: y + 60,
              opacity: 0,
              scale: 1,
              x: x + (Math.random() - 0.5) * 8,
            }
          : {
              x: [x - 0.3, x + 0.3, x - 0.2, x + 0.2, x],
              y: [y, y - 0.5, y + 0.3, y - 0.3, y],
              opacity: 1,
              scale: 1,
            }
      }
      transition={
        isReleasing
          ? { duration: 0.2, ease: 'easeIn', delay: releaseDelay }
          : {
              x: {
                duration: 0.5,
                repeat: Infinity,
                repeatType: 'mirror',
                ease: 'easeInOut',
                delay: delay,
              },
              y: {
                duration: 0.4,
                repeat: Infinity,
                repeatType: 'mirror',
                ease: 'easeInOut',
                delay: delay + 0.1,
              },
              opacity: { duration: 0.1, delay },
              scale: { duration: 0.1, delay, type: 'spring', stiffness: 400 },
            }
      }
    >
      <g filter="url(#tunnelBallShadow)">
        {/* Drop shadow - matches board balls */}
        <ellipse
          cx={2}
          cy={radius + 2}
          rx={radius * 0.7}
          ry={radius * 0.25}
          fill="black"
          opacity={0.15}
        />

        {/* Main ball */}
        <circle r={radius} fill="url(#tunnelBallGradient)" />

        {/* Specular highlight - enhanced to match board balls */}
        <ellipse
          cx={-radius * 0.3}
          cy={-radius * 0.3}
          rx={radius * 0.35}
          ry={radius * 0.25}
          fill="white"
          opacity={0.6}
        />

        {/* Secondary highlight - matches board balls */}
        <circle
          cx={-radius * 0.15}
          cy={-radius * 0.45}
          r={radius * 0.1}
          fill="white"
          opacity={0.8}
        />
      </g>
    </motion.g>
  );
};

export default ReleaseTunnel;
