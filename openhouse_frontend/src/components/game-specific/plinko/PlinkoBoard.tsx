import React, { useMemo } from 'react';
import { PLINKO_LAYOUT } from './plinkoAnimations';
import { MultiplierSlot } from './MultiplierSlot';

interface PlinkoBoardProps {
  rows: number;
  multipliers: number[];
  activeSlot?: number | null;
}

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({ rows, multipliers, activeSlot = null }) => {
  // Generate peg positions
  const pegs = useMemo(() => generatePegPositions(rows), [rows]);

  // Generate slot positions (bottom of board)
  const slots = useMemo(() => generateSlotPositions(rows, multipliers), [rows, multipliers]);

  return (
    <g>
      <defs>
        {/* Pin gradient - 3D spherical effect */}
        <radialGradient id="pinGradient" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#c0c0c0" />
          <stop offset="100%" stopColor="#808080" />
        </radialGradient>

        {/* Pin subtle glow */}
        <filter id="pinGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Ball gradient - metallic gold */}
        <radialGradient id="ballGradient" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#fff7cc" />
          <stop offset="30%" stopColor="#ffd700" />
          <stop offset="70%" stopColor="#daa520" />
          <stop offset="100%" stopColor="#b8860b" />
        </radialGradient>

        {/* Ball shadow filter */}
        <filter id="ballShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Render pegs */}
      <g id="pegs">
        {pegs.map((peg, i) => (
          <g key={i}>
            {/* Shadow for depth */}
            <circle
              cx={peg.x}
              cy={peg.y + 1}
              r={PLINKO_LAYOUT.PEG_RADIUS}
              fill="#404040"
              opacity={0.4}
            />
            {/* Main pin with gradient */}
            <circle
              cx={peg.x}
              cy={peg.y}
              r={PLINKO_LAYOUT.PEG_RADIUS}
              fill="url(#pinGradient)"
              filter="url(#pinGlow)"
            />
          </g>
        ))}
      </g>

      {/* Render multiplier slots */}
      <g id="slots">
        {slots.map((slot, i) => (
          <MultiplierSlot
            key={i}
            index={i}
            totalSlots={slots.length}
            multiplier={multipliers[i] ?? 0}
            x={slot.x}
            y={slot.y}
            isActive={activeSlot === i}
          />
        ))}
      </g>
    </g>
  );
};

// Helper: Generate peg grid positions
function generatePegPositions(rows: number) {
  const pegs: { x: number; y: number }[] = [];
  const centerX = PLINKO_LAYOUT.BOARD_WIDTH / 2;

  for (let row = 0; row < rows; row++) {
      // Use row + 1 to create pyramid pattern matching ball path calculations
      const pegsInRow = row + 1;
      for (let col = 0; col < pegsInRow; col++) {
          const x = centerX + (col - row / 2) * PLINKO_LAYOUT.PEG_SPACING_X;
          const y = PLINKO_LAYOUT.DROP_ZONE_Y + row * PLINKO_LAYOUT.PEG_SPACING_Y;
          pegs.push({ x, y });
      }
  }

  return pegs;
}

// Helper: Generate slot positions
function generateSlotPositions(rows: number, multipliers: number[]) {
  const slots: { x: number; y: number }[] = [];
  const centerX = PLINKO_LAYOUT.BOARD_WIDTH / 2;
  const slotCount = rows + 1;
  const slotsY = PLINKO_LAYOUT.DROP_ZONE_Y + rows * PLINKO_LAYOUT.PEG_SPACING_Y + PLINKO_LAYOUT.SLOT_OFFSET_Y;

  for (let i = 0; i < slotCount; i++) {
    const x = centerX + (i - rows / 2) * PLINKO_LAYOUT.PEG_SPACING_X;
    slots.push({ x, y: slotsY });
  }

  return slots;
}