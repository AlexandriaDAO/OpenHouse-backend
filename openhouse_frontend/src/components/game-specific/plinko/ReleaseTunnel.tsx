import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLINKO_LAYOUT } from './plinkoAnimations';

interface ReleaseTunnelProps {
  ballCount: number;
  isOpen: boolean;
  isVisible: boolean;
}

/**
 * Release tunnel that displays queued balls at the top of the Plinko board.
 * Uses the same gold ball styling as the physics engine for consistency.
 */
export const ReleaseTunnel: React.FC<ReleaseTunnelProps> = ({
  ballCount,
  isOpen,
  isVisible,
}) => {
  const { TUNNEL, BOARD_WIDTH } = PLINKO_LAYOUT;
  const centerX = BOARD_WIDTH / 2;
  const ballRadius = TUNNEL.BALL_RADIUS;

  // Calculate ball positions - inside funnel and overflowing above
  const { insideBalls, overflowBalls } = useMemo(() => {
    const inside: { x: number; y: number; delay: number }[] = [];
    const overflow: { x: number; y: number; delay: number }[] = [];
    const ballDiameter = ballRadius * 2;
    const spacing = ballDiameter + 1;

    // Available width inside funnel (narrows toward bottom)
    const topWidth = TUNNEL.WIDTH - 8;
    const bottomWidth = ballDiameter + 4;

    // Stack balls from bottom to top INSIDE the funnel
    let currentY = TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT - ballRadius - 2;
    let ballIndex = 0;

    while (ballIndex < ballCount && currentY > TUNNEL.Y + ballRadius) {
      // Calculate width at this Y position (linear interpolation)
      const progress = (currentY - TUNNEL.Y) / (TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT);
      const widthAtY = bottomWidth + (topWidth - bottomWidth) * (1 - progress);
      const ballsInRow = Math.max(1, Math.floor(widthAtY / spacing));

      // Center the row
      const actualBallsInRow = Math.min(ballsInRow, ballCount - ballIndex);
      const rowWidth = actualBallsInRow * spacing - 1;
      const startX = -rowWidth / 2 + ballRadius;

      for (let col = 0; col < actualBallsInRow && ballIndex < ballCount; col++) {
        inside.push({
          x: startX + col * spacing,
          y: currentY,
          delay: ballIndex * 0.02,
        });
        ballIndex++;
      }

      currentY -= spacing * 0.85;
    }

    // Remaining balls overflow ABOVE the funnel
    // Stack them in rows above the funnel opening
    const overflowStartY = TUNNEL.Y - ballRadius - 2;
    const overflowWidth = TUNNEL.WIDTH + 20; // Slightly wider than funnel top
    const ballsPerOverflowRow = Math.floor(overflowWidth / spacing);

    while (ballIndex < ballCount) {
      const overflowIndex = ballIndex - inside.length;
      const row = Math.floor(overflowIndex / ballsPerOverflowRow);
      const col = overflowIndex % ballsPerOverflowRow;

      // Calculate how many balls in this row
      const remainingBalls = ballCount - inside.length - row * ballsPerOverflowRow;
      const ballsInThisRow = Math.min(ballsPerOverflowRow, remainingBalls);
      const rowWidth = ballsInThisRow * spacing - 1;
      const startX = -rowWidth / 2 + ballRadius;

      overflow.push({
        x: startX + col * spacing,
        y: overflowStartY - row * spacing * 0.9,
        delay: ballIndex * 0.02,
      });
      ballIndex++;
    }

    return { insideBalls: inside, overflowBalls: overflow };
  }, [ballCount, TUNNEL, ballRadius]);

  if (!isVisible) return null;

  return (
    <g transform={`translate(${centerX}, 0)`}>
      {/* SVG definitions for ball gradient (matching physics balls) */}
      <defs>
        <radialGradient id="tunnelBallGradient" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fff7cc" />
          <stop offset="30%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#daa520" />
          <stop offset="100%" stopColor="#b8860b" />
        </radialGradient>

        <linearGradient id="tunnelGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2d3748" />
          <stop offset="100%" stopColor="#1a202c" />
        </linearGradient>

        {/* Clip path for funnel shape */}
        <clipPath id="tunnelClip">
          <path d={`
            M ${-TUNNEL.WIDTH/2} ${TUNNEL.Y}
            L ${TUNNEL.WIDTH/2} ${TUNNEL.Y}
            L ${ballRadius + 4} ${TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT}
            L ${ballRadius + 4} ${TUNNEL.Y + TUNNEL.HEIGHT}
            L ${-ballRadius - 4} ${TUNNEL.Y + TUNNEL.HEIGHT}
            L ${-ballRadius - 4} ${TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT}
            Z
          `} />
        </clipPath>
      </defs>

      {/* Tunnel background */}
      <path
        d={`
          M ${-TUNNEL.WIDTH/2} ${TUNNEL.Y}
          L ${TUNNEL.WIDTH/2} ${TUNNEL.Y}
          L ${ballRadius + 6} ${TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT}
          L ${ballRadius + 6} ${TUNNEL.Y + TUNNEL.HEIGHT}
          L ${-ballRadius - 6} ${TUNNEL.Y + TUNNEL.HEIGHT}
          L ${-ballRadius - 6} ${TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT}
          Z
        `}
        fill="url(#tunnelGradient)"
        stroke="#4a5568"
        strokeWidth={1.5}
        opacity={0.9}
      />

      {/* Inner shadow for depth */}
      <path
        d={`
          M ${-TUNNEL.WIDTH/2 + 3} ${TUNNEL.Y + 3}
          L ${TUNNEL.WIDTH/2 - 3} ${TUNNEL.Y + 3}
          L ${ballRadius + 3} ${TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT - 2}
          L ${-ballRadius - 3} ${TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT - 2}
          Z
        `}
        fill="#0a0a14"
        opacity={0.5}
      />

      {/* Overflow balls ABOVE the funnel (not clipped, rendered first/behind) */}
      <g>
        <AnimatePresence>
          {overflowBalls.map((pos, i) => (
            <TunnelBall
              key={`overflow-${i}`}
              x={pos.x}
              y={pos.y}
              radius={ballRadius}
              delay={pos.delay}
              isReleasing={isOpen}
              releaseDelay={(insideBalls.length + i) * 0.03}
            />
          ))}
        </AnimatePresence>
      </g>

      {/* Balls inside tunnel (clipped to funnel shape) */}
      <g clipPath="url(#tunnelClip)">
        <AnimatePresence>
          {insideBalls.map((pos, i) => (
            <TunnelBall
              key={`inside-${i}`}
              x={pos.x}
              y={pos.y}
              radius={ballRadius}
              delay={pos.delay}
              isReleasing={isOpen}
              releaseDelay={i * 0.03}
            />
          ))}
        </AnimatePresence>
      </g>

      {/* Release gate (slides open) */}
      <motion.g
        animate={{ y: isOpen ? 15 : 0, opacity: isOpen ? 0 : 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Left gate */}
        <rect
          x={-ballRadius - 5}
          y={TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT}
          width={ballRadius + 5 - 1}
          height={TUNNEL.GATE_HEIGHT}
          fill="#4a5568"
          rx={1}
        />
        {/* Right gate */}
        <rect
          x={1}
          y={TUNNEL.Y + TUNNEL.HEIGHT - TUNNEL.GATE_HEIGHT}
          width={ballRadius + 5 - 1}
          height={TUNNEL.GATE_HEIGHT}
          fill="#4a5568"
          rx={1}
        />
      </motion.g>

      {/* Top rim decoration */}
      <rect
        x={-TUNNEL.WIDTH/2 - 2}
        y={TUNNEL.Y - 2}
        width={TUNNEL.WIDTH + 4}
        height={4}
        fill="#4a5568"
        rx={2}
      />
    </g>
  );
};

// Individual ball with physics-matching style
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
              y: y + 80,
              opacity: 0,
              scale: 1,
              x: x + (Math.random() - 0.5) * 10,
            }
          : {
              // Subtle jiggle animation while waiting
              x: [x - 0.5, x + 0.5, x - 0.3, x + 0.3, x],
              y: [y, y - 1, y + 0.5, y - 0.5, y],
              opacity: 1,
              scale: 1,
            }
      }
      transition={
        isReleasing
          ? { duration: 0.25, ease: 'easeIn', delay: releaseDelay }
          : {
              x: {
                duration: 0.4,
                repeat: Infinity,
                repeatType: 'mirror',
                ease: 'easeInOut',
                delay: delay,
              },
              y: {
                duration: 0.35,
                repeat: Infinity,
                repeatType: 'mirror',
                ease: 'easeInOut',
                delay: delay + 0.15,
              },
              opacity: { duration: 0.15, delay },
              scale: { duration: 0.15, delay, type: 'spring', stiffness: 400 },
            }
      }
    >
      {/* Drop shadow */}
      <ellipse
        cx={1}
        cy={radius + 1}
        rx={radius * 0.6}
        ry={radius * 0.2}
        fill="black"
        opacity={0.2}
      />

      {/* Main ball with gold gradient */}
      <circle
        r={radius}
        fill="url(#tunnelBallGradient)"
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
    </motion.g>
  );
};

export default ReleaseTunnel;
