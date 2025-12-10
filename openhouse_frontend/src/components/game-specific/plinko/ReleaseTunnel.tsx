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
  // Physics uses: / (lastRowPinCount - 1) where lastRowPinCount = 2 + rows
  const pinDistanceX = (BOARD_WIDTH - PADDING_X * 2) / (2 + rows - 1);
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
  // Balls can now extend off-screen (negative Y) since roof is removed
  const boxBalls = useMemo(() => {
    const balls: { x: number; y: number; delay: number }[] = [];
    const ballDiameter = ballRadius * 2;
    const spacing = ballDiameter + 2;

    // Calculate how many balls fit per row
    const ballsPerRow = Math.floor((BUCKET.WIDTH - 8) / spacing);

    // Stack balls from bottom up - no upper limit since container is open-topped
    let currentY = BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT - ballRadius - 2;
    let ballIndex = 0;

    // Allow balls to stack up to -80 (off-screen) instead of stopping at TOP_Y
    while (ballIndex < ballCount && currentY > -80) {
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
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="30%" stopColor="#E2E8F0" />
          <stop offset="70%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </radialGradient>

        {/* Container interior - darker, more visible background - Cyber dark */}
        <linearGradient id="boxGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a1a2e" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0d0d1a" stopOpacity="0.9" />
        </linearGradient>

        {/* Wall gradient for 3D metallic depth - Dark Steel/Tech */}
        <linearGradient id="wallGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4a4a5a" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#2d2d3d" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#1a1a2e" stopOpacity="0.9" />
        </linearGradient>

        {/* Gate metallic gradient - Dark Tech */}
        <linearGradient id="gateGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5c5c6c" />
          <stop offset="40%" stopColor="#3d3d4d" />
          <stop offset="70%" stopColor="#262636" />
          <stop offset="100%" stopColor="#121218" />
        </linearGradient>

        {/* Drop shadow filter to match board balls */}
        <filter id="tunnelBallShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>

        {/* Container drop shadow filter */}
        <filter id="containerShadow" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="2" dy="4" stdDeviation="3" floodColor="#000" floodOpacity="0.5" />
        </filter>

        {/* Clip path for box shape - extended upward for off-screen balls */}
        <clipPath id="bucketClip">
          <rect
            x={-BUCKET.WIDTH/2}
            y={-100}
            width={BUCKET.WIDTH}
            height={BUCKET.BOTTOM_Y + 100}
          />
        </clipPath>
      </defs>

      {/* Container with drop shadow */}
      <g filter="url(#containerShadow)">
        {/* U-shaped container - open top extends off-screen */}
        <path
          d={`
            M ${-BUCKET.WIDTH/2} ${-50}
            L ${-BUCKET.WIDTH/2} ${BUCKET.BOTTOM_Y}
            L ${BUCKET.WIDTH/2} ${BUCKET.BOTTOM_Y}
            L ${BUCKET.WIDTH/2} ${-50}
          `}
          fill="url(#boxGradient)"
          stroke="none"
        />

        {/* Outer wall stroke - shadow side (darker) */}
        <path
          d={`
            M ${-BUCKET.WIDTH/2 - 1.5} ${-50}
            L ${-BUCKET.WIDTH/2 - 1.5} ${BUCKET.BOTTOM_Y + 1}
            L ${BUCKET.WIDTH/2 + 1.5} ${BUCKET.BOTTOM_Y + 1}
            L ${BUCKET.WIDTH/2 + 1.5} ${-50}
          `}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={3}
        />

        {/* Inner wall stroke - highlight side (Tech Green Accent) */}
        <path
          d={`
            M ${-BUCKET.WIDTH/2 + 1} ${-50}
            L ${-BUCKET.WIDTH/2 + 1} ${BUCKET.BOTTOM_Y - 1}
            L ${BUCKET.WIDTH/2 - 1} ${BUCKET.BOTTOM_Y - 1}
            L ${BUCKET.WIDTH/2 - 1} ${-50}
          `}
          fill="none"
          stroke="rgba(57, 255, 20, 0.3)"
          strokeWidth={1}
        />

        {/* Metallic rim on walls */}
        <path
          d={`
            M ${-BUCKET.WIDTH/2} ${-50}
            L ${-BUCKET.WIDTH/2} ${BUCKET.BOTTOM_Y}
            L ${BUCKET.WIDTH/2} ${BUCKET.BOTTOM_Y}
            L ${BUCKET.WIDTH/2} ${-50}
          `}
          fill="none"
          stroke="url(#wallGradient)"
          strokeWidth={2}
        />
      </g>

      {/* Inner shadow for depth */}
      <rect
        x={-BUCKET.WIDTH/2 + 4}
        y={-50}
        width={BUCKET.WIDTH - 8}
        height={BUCKET.BOTTOM_Y + 50 - BUCKET.GATE_HEIGHT - 4}
        fill="#000000"
        opacity={0.3}
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

      {/* Gate groove tracks on sides */}
      <rect
        x={-BUCKET.WIDTH/2 - 3}
        y={BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT - 2}
        width={3}
        height={BUCKET.GATE_HEIGHT + 4}
        fill="#111118"
        rx={1}
      />
      <rect
        x={BUCKET.WIDTH/2}
        y={BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT - 2}
        width={3}
        height={BUCKET.GATE_HEIGHT + 4}
        fill="#111118"
        rx={1}
      />

      {/* Release gate at bottom (slides down) - metallic finish */}
      <motion.g
        animate={{ y: isOpen ? 12 : 0, opacity: isOpen ? 0 : 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {/* Gate shadow */}
        <rect
          x={-BUCKET.WIDTH/2 + 1}
          y={BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT + 1}
          width={BUCKET.WIDTH - 2}
          height={BUCKET.GATE_HEIGHT}
          fill="#000000"
          rx={1}
          opacity={0.5}
        />
        {/* Gate body with metallic gradient */}
        <rect
          x={-BUCKET.WIDTH/2}
          y={BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT}
          width={BUCKET.WIDTH}
          height={BUCKET.GATE_HEIGHT}
          fill="url(#gateGradient)"
          rx={1}
        />
        {/* Gate highlight - Green Tech Accent */}
        <rect
          x={-BUCKET.WIDTH/2 + 2}
          y={BUCKET.BOTTOM_Y - BUCKET.GATE_HEIGHT}
          width={BUCKET.WIDTH - 4}
          height={1}
          fill="rgba(57, 255, 20, 0.4)"
          rx={0.5}
        />
      </motion.g>

      {/* Bottom edge decoration - metallic rim */}
      <rect
        x={-BUCKET.WIDTH/2 - 3}
        y={BUCKET.BOTTOM_Y}
        width={BUCKET.WIDTH + 6}
        height={3}
        fill="#2d2d3d"
        rx={1}
      />
      {/* Bottom edge highlight */}
      <rect
        x={-BUCKET.WIDTH/2 - 2}
        y={BUCKET.BOTTOM_Y}
        width={BUCKET.WIDTH + 4}
        height={1}
        fill="rgba(57, 255, 20, 0.2)"
        rx={0.5}
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
