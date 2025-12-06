import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const isWin = multiplier >= 1.0;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Glow effect when active */}
      <AnimatePresence>
        {isActive && (
          <motion.rect
            x={-SLOT_WIDTH / 2 - 4}
            y={-4}
            width={SLOT_WIDTH + 8}
            height={SLOT_HEIGHT + 8}
            fill="none"
            stroke={colors.glow}
            strokeWidth={3}
            rx={8}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0, 1, 0.5, 1, 0],
              scale: [0.8, 1.1, 1, 1.05, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            filter={`drop-shadow(0 0 8px ${colors.glow})`}
          />
        )}
      </AnimatePresence>

      {/* Shadow layer for 3D depth */}
      <rect
        x={-SLOT_WIDTH / 2}
        y={4}
        width={SLOT_WIDTH}
        height={SLOT_HEIGHT}
        fill={colors.shadow}
        rx={4}
      />

      {/* Main bucket body */}
      <motion.rect
        x={-SLOT_WIDTH / 2}
        y={0}
        width={SLOT_WIDTH}
        height={SLOT_HEIGHT}
        fill={colors.background}
        rx={4}
        animate={isActive ? { y: [0, 2, 0] } : {}}
        transition={{ duration: 0.2 }}
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

      {/* Win popup */}
      <AnimatePresence>
        {isActive && isWin && (
          <motion.text
            x={0}
            y={-10}
            textAnchor="middle"
            fill="#00ff00"
            fontSize={12}
            fontWeight="bold"
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [1, 0], y: -20 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            WIN!
          </motion.text>
        )}
      </AnimatePresence>
    </g>
  );
};
