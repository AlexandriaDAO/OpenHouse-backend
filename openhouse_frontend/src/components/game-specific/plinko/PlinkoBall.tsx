import React from 'react';
import { motion } from 'framer-motion';
import { generatePhysicsKeyframes, generatePhysicsTiming, PLINKO_LAYOUT } from './plinkoAnimations';

interface PlinkoBallProps {
  id: number;
  path: boolean[];
  onComplete: (id: number) => void;
  staggerDelay?: number;
}

export const PlinkoBall: React.FC<PlinkoBallProps> = ({
  path,
  staggerDelay = 0
}) => {
  // Generate physics keyframes
  const keyframes = generatePhysicsKeyframes(path);
  const timings = generatePhysicsTiming(keyframes.length);

  // Duration based on path length (slightly longer for physics effect)
  const duration = (path.length * PLINKO_LAYOUT.MS_PER_ROW * 1.3) / 1000;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{
        x: keyframes.map(k => k.x),
        y: keyframes.map(k => k.y),
        scaleX: keyframes.map(k => k.scaleX),
        scaleY: keyframes.map(k => k.scaleY),
        rotate: keyframes.map(k => k.rotation),
        opacity: [0, 1, ...Array(Math.max(0, keyframes.length - 2)).fill(1)],
      }}
      transition={{
        duration,
        delay: staggerDelay,
        times: timings,
        ease: "easeInOut",
      }}
      style={{ transformOrigin: 'center center' }}
    >
      {/* Ball with gradient and shadows - uses defs from PlinkoBoard */}
      <g filter="url(#ballShadow)">
        {/* Drop shadow */}
        <ellipse
          cx={2}
          cy={PLINKO_LAYOUT.BALL_RADIUS + 2}
          rx={PLINKO_LAYOUT.BALL_RADIUS * 0.7}
          ry={PLINKO_LAYOUT.BALL_RADIUS * 0.25}
          fill="black"
          opacity={0.15}
        />

        {/* Main ball */}
        <circle
          r={PLINKO_LAYOUT.BALL_RADIUS}
          fill="url(#ballGradient)"
        />

        {/* Specular highlight */}
        <ellipse
          cx={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
          cy={-PLINKO_LAYOUT.BALL_RADIUS * 0.3}
          rx={PLINKO_LAYOUT.BALL_RADIUS * 0.35}
          ry={PLINKO_LAYOUT.BALL_RADIUS * 0.25}
          fill="white"
          opacity={0.6}
        />

        {/* Secondary highlight */}
        <circle
          cx={-PLINKO_LAYOUT.BALL_RADIUS * 0.15}
          cy={-PLINKO_LAYOUT.BALL_RADIUS * 0.45}
          r={PLINKO_LAYOUT.BALL_RADIUS * 0.1}
          fill="white"
          opacity={0.8}
        />
      </g>
    </motion.g>
  );
};