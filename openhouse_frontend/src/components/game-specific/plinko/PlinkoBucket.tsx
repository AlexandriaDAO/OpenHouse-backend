import React from 'react';
import { motion } from 'framer-motion';
import { PLINKO_LAYOUT } from './plinkoAnimations';

interface PlinkoBucketProps {
  ballCount: number;
  isOpen: boolean;
  isVisible: boolean;
}

export const PlinkoBucket: React.FC<PlinkoBucketProps> = ({
  ballCount,
  isOpen,
  isVisible,
}) => {
  const { BUCKET, BOARD_WIDTH, BALL_RADIUS, COLORS } = PLINKO_LAYOUT;
  const centerX = BOARD_WIDTH / 2;

  // Smaller ball size for bucket display (fits more balls visually)
  const bucketBallRadius = Math.min(BALL_RADIUS, 6);

  // Calculate ball positions inside bucket (grid layout)
  const ballPositions = React.useMemo(() => {
    const positions: { x: number; y: number }[] = [];
    const ballDiameter = bucketBallRadius * 2;
    const padding = 1;
    const innerWidth = BUCKET.WIDTH - BUCKET.WALL_THICKNESS * 2 - 4;
    const ballsPerRow = Math.floor(innerWidth / (ballDiameter + padding));

    for (let i = 0; i < ballCount; i++) {
      const row = Math.floor(i / ballsPerRow);
      const col = i % ballsPerRow;
      const rowBalls = Math.min(ballsPerRow, ballCount - row * ballsPerRow);
      const rowWidth = rowBalls * (ballDiameter + padding) - padding;
      const startX = -rowWidth / 2 + bucketBallRadius;

      positions.push({
        x: startX + col * (ballDiameter + padding),
        y: BUCKET.HEIGHT - BUCKET.DOOR_HEIGHT - bucketBallRadius - 2 - row * (ballDiameter + padding),
      });
    }
    return positions;
  }, [ballCount, BUCKET, bucketBallRadius]);

  if (!isVisible) return null;

  return (
    <g transform={`translate(${centerX}, ${BUCKET.Y})`}>
      {/* Bucket container */}
      <defs>
        <linearGradient id="bucketGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.bucketAccent} />
          <stop offset="50%" stopColor={COLORS.bucket} />
          <stop offset="100%" stopColor={COLORS.bucketAccent} />
        </linearGradient>
      </defs>

      {/* Left wall */}
      <rect
        x={-BUCKET.WIDTH / 2}
        y={0}
        width={BUCKET.WALL_THICKNESS}
        height={BUCKET.HEIGHT}
        fill="url(#bucketGradient)"
        rx={1}
      />

      {/* Right wall */}
      <rect
        x={BUCKET.WIDTH / 2 - BUCKET.WALL_THICKNESS}
        y={0}
        width={BUCKET.WALL_THICKNESS}
        height={BUCKET.HEIGHT}
        fill="url(#bucketGradient)"
        rx={1}
      />

      {/* Back wall (behind balls) */}
      <rect
        x={-BUCKET.WIDTH / 2 + BUCKET.WALL_THICKNESS}
        y={0}
        width={BUCKET.WIDTH - BUCKET.WALL_THICKNESS * 2}
        height={BUCKET.HEIGHT - BUCKET.DOOR_HEIGHT}
        fill={COLORS.bucketAccent}
        opacity={0.3}
      />

      {/* Balls inside bucket */}
      {ballPositions.map((pos, i) => (
        <BucketBall
          key={i}
          x={pos.x}
          y={pos.y}
          radius={bucketBallRadius}
          delay={i * 0.02}
          isDropping={isOpen}
        />
      ))}

      {/* Bottom door - splits in the middle */}
      {/* Left door half */}
      <motion.rect
        y={BUCKET.HEIGHT - BUCKET.DOOR_HEIGHT}
        width={(BUCKET.WIDTH - BUCKET.WALL_THICKNESS * 2) / 2}
        height={BUCKET.DOOR_HEIGHT}
        fill="url(#bucketGradient)"
        animate={{
          x: isOpen
            ? -BUCKET.WIDTH / 2 - 20
            : -BUCKET.WIDTH / 2 + BUCKET.WALL_THICKNESS,
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        rx={1}
      />
      {/* Right door half */}
      <motion.rect
        y={BUCKET.HEIGHT - BUCKET.DOOR_HEIGHT}
        width={(BUCKET.WIDTH - BUCKET.WALL_THICKNESS * 2) / 2}
        height={BUCKET.DOOR_HEIGHT}
        fill="url(#bucketGradient)"
        animate={{
          x: isOpen
            ? BUCKET.WIDTH / 2 + 20 - (BUCKET.WIDTH - BUCKET.WALL_THICKNESS * 2) / 2
            : 0,
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        rx={1}
      />

      {/* Top rim decoration */}
      <rect
        x={-BUCKET.WIDTH / 2 - 2}
        y={-2}
        width={BUCKET.WIDTH + 4}
        height={4}
        fill={COLORS.bucket}
        rx={2}
      />
    </g>
  );
};

// Individual ball inside the bucket with vibration animation
interface BucketBallProps {
  x: number;
  y: number;
  radius: number;
  delay: number;
  isDropping: boolean;
}

const BucketBall: React.FC<BucketBallProps> = ({ x, y, radius, delay, isDropping }) => {
  const { COLORS } = PLINKO_LAYOUT;

  return (
    <motion.g
      initial={{ x, y, opacity: 0, scale: 0 }}
      animate={
        isDropping
          ? {
              y: y + 100,
              opacity: 0,
              scale: 1,
            }
          : {
              x: [x - 1, x + 1, x - 0.5, x + 0.5, x],
              y: [y, y - 1.5, y + 0.5, y - 0.5, y],
              opacity: 1,
              scale: 1,
            }
      }
      transition={
        isDropping
          ? { duration: 0.3, ease: 'easeIn' }
          : {
              x: {
                duration: 0.3,
                repeat: Infinity,
                repeatType: 'mirror',
                ease: 'easeInOut',
                delay: delay,
              },
              y: {
                duration: 0.25,
                repeat: Infinity,
                repeatType: 'mirror',
                ease: 'easeInOut',
                delay: delay + 0.1,
              },
              opacity: { duration: 0.2, delay },
              scale: { duration: 0.2, delay, type: 'spring', stiffness: 500 },
            }
      }
    >
      <circle r={radius} fill={COLORS.ball} />
      <circle
        cx={-radius * 0.3}
        cy={-radius * 0.3}
        r={radius * 0.3}
        fill="white"
        opacity={0.4}
      />
    </motion.g>
  );
};
