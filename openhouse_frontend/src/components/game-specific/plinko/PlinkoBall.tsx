import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateBallKeyframes, PLINKO_LAYOUT } from './plinkoAnimations';

interface PlinkoBallProps {
  id: number;
  path: boolean[];
  onComplete: (id: number, finalSlot: number) => void;
  staggerDelay?: number;
}

export const PlinkoBall: React.FC<PlinkoBallProps> = ({
  id,
  path,
  onComplete,
  staggerDelay = 0
}) => {
  // Generate animation keyframes from path
  const keyframes = generateBallKeyframes(path);

  // Calculate final slot (count of rights in path)
  const finalSlot = path.filter(v => v).length;

  // Calculate total animation duration
  const duration = (path.length * PLINKO_LAYOUT.MS_PER_ROW) / 1000;

  // Notify parent when animation completes
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete(id, finalSlot);
    }, (duration + staggerDelay) * 1000);

    return () => clearTimeout(timer);
  }, [id, finalSlot, duration, staggerDelay, onComplete]);

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{
        x: keyframes.map(k => k.x),
        y: keyframes.map(k => k.y),
        opacity: [0, 1, 1, 1, 0.5],
      }}
      transition={{
        duration,
        delay: staggerDelay,
        ease: "linear", // Using linear for predictable path movement, or easeInOut for bounces
        times: keyframes.map((_, i) => i / (keyframes.length - 1)),
      }}
    >
      {/* Ball circle */}
      <circle
        r={PLINKO_LAYOUT.BALL_RADIUS}
        fill={PLINKO_LAYOUT.COLORS.ball}
      />

      {/* 3D highlight */}
      <circle
        cx={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
        cy={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
        r={PLINKO_LAYOUT.BALL_RADIUS * 0.3}
        fill="white"
        opacity={0.4}
      />
    </motion.g>
  );
};
