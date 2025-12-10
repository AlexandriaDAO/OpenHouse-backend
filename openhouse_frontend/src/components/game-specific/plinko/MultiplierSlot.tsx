import React from 'react';
import { motion } from 'framer-motion';
import { getBucketColors, PLINKO_LAYOUT } from './plinkoAnimations';

interface MultiplierSlotProps {
  index: number;
  totalSlots: number;
  multiplier: number;
  x: number;
  y: number;
  isActive?: boolean;
}

export const MultiplierSlot: React.FC<MultiplierSlotProps> = ({
  index,
  totalSlots,
  multiplier,
  x,
  y,
  isActive = false,
}) => {
  const { SLOT_WIDTH, SLOT_HEIGHT } = PLINKO_LAYOUT;
  const colors = getBucketColors(index, totalSlots);

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Shadow layer for 3D depth - stays in place */}
      <rect
        x={-SLOT_WIDTH / 2}
        y={4}
        width={SLOT_WIDTH}
        height={SLOT_HEIGHT}
        fill={colors.shadow}
        rx={4}
      />

      {/* Animated bucket contents */}
      <motion.g
        animate={
          isActive
            ? {
                y: [0, -4, 1, 0], // Small bounce up and down
              }
            : { y: 0 }
        }
        transition={
          isActive
            ? {
                duration: 0.3,
                ease: 'easeOut',
              }
            : {}
        }
      >
        {/* Main bucket body */}
        <rect
          x={-SLOT_WIDTH / 2}
          y={0}
          width={SLOT_WIDTH}
          height={SLOT_HEIGHT}
          fill={colors.background}
          rx={4}
        />

        {/* Top highlight for 3D effect */}
        <rect
          x={-SLOT_WIDTH / 2 + 2}
          y={2}
          width={SLOT_WIDTH - 4}
          height={4}
          fill="white"
          opacity={0.3}
          rx={2}
        />

        {/* Multiplier text */}
        <text
          x={0}
          y={SLOT_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={10}
          fontWeight="bold"
          style={{
            pointerEvents: 'none',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {multiplier.toFixed(1)}x
        </text>
      </motion.g>
    </g>
  );
};
