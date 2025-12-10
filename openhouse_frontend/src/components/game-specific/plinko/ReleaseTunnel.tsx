import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLINKO_LAYOUT } from './plinkoAnimations';

interface ReleaseTunnelProps {
  rows: number;        // Number of plinko rows (needed for dynamic width calculation)
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
  rows,
  ballCount,
  isOpen,
  isVisible,
  showBalls = true,
}) => {
  const { BOARD_WIDTH, PADDING_X } = PLINKO_LAYOUT;
  const centerX = BOARD_WIDTH / 2;

  // Calculate dynamic width based on first row pins (matching physics engine exactly)
  const pinDistanceX = (BOARD_WIDTH - PADDING_X * 2) / (2 + rows);
  const rowPaddingX = PADDING_X + ((rows - 1) * pinDistanceX) / 2;
  const firstRowSpan = (BOARD_WIDTH - rowPaddingX * 2);
  const bucketWidth = Math.min(140, firstRowSpan - 20);

  // Box bucket dimensions - width now matches physics engine
  const BUCKET = {
    TOP_Y: 5,
    BOTTOM_Y: 70,
    WIDTH: bucketWidth,
    GATE_HEIGHT: 4,
  };

  const ballRadius = 8;  // Matches board balls for unified appearance
  const bucketHeight = BUCKET.BOTTOM_Y - BUCKET.TOP_Y;

  // Calculate ball positions - box shape with consistent width
  const boxBalls = useMemo(() => {
    const balls: { x: number; y: number; delay: number }[] = [];
    const ballDiameter = ballRadius * 2;
    const spacing = ballDiameter + 2;

    // Calculate how many balls fit per row
    const ballsPerRow = Math.floor((BUCKET.WIDTH - 8) / spacing);

    // Stack balls from bottom up inside the box
    let currentY = BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT - ballRadius - 2;
    let ballIndex = 0;

    while (ballIndex < ballCount && currentY > BUCKET.TOP_Y + ballRadius) {
      const actualBallsInRow = Math.min(ballsPerRow, ballCount - ballIndex);
      const rowWidth = actualBallsInRow * spacing - 2;
      const startX = -rowWidth / 2 + ballRadius;

      for (let col = 0; col < actualBallsInRow && ballIndex < ballCount; col++) {
        balls.push({
          x: startX + col * spacing,
          y: currentY,
          delay: ballIndex * 0.015,
        });
        ballIndex++;
      }

      currentY -= spacing * 0.85;
    }

    return balls;
  }, [ballCount, BUCKET, ballRadius]);

  if (!isVisible) return null;

  return (
    <g transform={`translate(${centerX}, 0)`}>
      {/* SVG definitions */}
      <defs>
        <radialGradient id="tunnelBallGradient" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#b3ffb3" />
          <stop offset="30%" stopColor="#39FF14" />
          <stop offset="70%" stopColor="#2ad912" />
          <stop offset="100%" stopColor="#1a8a0a" />
        </radialGradient>

        <linearGradient id="boxGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a202c" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2d3748" stopOpacity="0.2" />
        </linearGradient>

        {/* Drop shadow filter to match board balls */}
        <filter id="tunnelBallShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>

        {/* Clip path for box shape */}
        <clipPath id="bucketClip">
          <rect
            x={-BUCKET.WIDTH/2}
            y={BUCKET.TOP_Y}
            width={BUCKET.WIDTH}
            height={BUCKET.BOTTOM_Y - BUCKET.TOP_Y}
          />
        </clipPath>
      </defs>

      {/* Box container - subtle turquoise outline */}
      <rect
        x={-BUCKET.WIDTH/2}
        y={BUCKET.TOP_Y}
        width={BUCKET.WIDTH}
        height={BUCKET.BOTTOM_Y - BUCKET.TOP_Y}
        fill="url(#boxGradient)"
        stroke="rgba(57, 255, 20, 0.3)"
        strokeWidth={1}
        rx={4}
      />

      {/* Inner shadow for depth */}
      <rect
        x={-BUCKET.WIDTH/2 + 3}
        y={BUCKET.TOP_Y + 2}
        width={BUCKET.WIDTH - 6}
        height={BUCKET.BOTTOM_Y - BUCKET.TOP_Y - BUCKET.GATE_HEIGHT - 4}
        fill="#0a0a14"
        opacity={0.1}
        rx={2}
      />

      {/* Box balls (clipped) - only shown when showBalls is true */}
      {showBalls && (
        <g clipPath="url(#bucketClip)">
          <AnimatePresence>
            {boxBalls.map((pos, i) => (
              <TunnelBall
                key={`box-${i}`}
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

      {/* Release gate at bottom (splits open) - turquoise brand color */}
      <motion.g
        animate={{ y: isOpen ? 12 : 0, opacity: isOpen ? 0 : 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        <rect
          x={-BUCKET.WIDTH/2}
          y={BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT}
          width={BUCKET.WIDTH}
          height={BUCKET.GATE_HEIGHT}
          fill="#39FF14"
          rx={2}
        />
      </motion.g>

      {/* Bottom edge decoration - turquoise brand color */}
      <rect
        x={-BUCKET.WIDTH/2 - 2}
        y={BUCKET.BOTTOM_Y - 1}
        width={BUCKET.WIDTH + 4}
        height={2}
        fill="#39FF14"
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
