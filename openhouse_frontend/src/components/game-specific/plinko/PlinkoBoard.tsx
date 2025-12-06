import React, { useMemo } from 'react';
import { PLINKO_LAYOUT } from './plinkoAnimations';

interface PlinkoBoardProps {
  rows: number;
  multipliers: number[];
}

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({ rows, multipliers }) => {
  // Generate peg positions
  const pegs = useMemo(() => generatePegPositions(rows), [rows]);

  // Generate slot positions (bottom of board)
  const slots = useMemo(() => generateSlotPositions(rows, multipliers), [rows, multipliers]);

  return (
    <g>
      {/* Render pegs */}
      <g id="pegs">
        {pegs.map((peg, i) => (
          <circle
            key={i}
            cx={peg.x}
            cy={peg.y}
            r={PLINKO_LAYOUT.PEG_RADIUS}
            fill={PLINKO_LAYOUT.COLORS.peg}
          />
        ))}
      </g>

      {/* Render multiplier slots */}
      <g id="slots">
        {slots.map((slot, i) => {
          const mult = multipliers[i];
          const safeMult = mult ?? 0;
          const isWin = safeMult > 1.0;

          return (
            <g key={i} transform={`translate(${slot.x}, ${slot.y})`}>
              {/* Slot box */}
              <rect
                x={-PLINKO_LAYOUT.SLOT_WIDTH / 2}
                y={0}
                width={PLINKO_LAYOUT.SLOT_WIDTH}
                height={PLINKO_LAYOUT.SLOT_HEIGHT}
                fill={isWin ? PLINKO_LAYOUT.COLORS.win : PLINKO_LAYOUT.COLORS.lose}
                opacity={0.2}
                stroke={isWin ? PLINKO_LAYOUT.COLORS.win : PLINKO_LAYOUT.COLORS.lose}
                strokeWidth={2}
                rx={4}
              />

              {/* Multiplier text */}
              <text
                x={0}
                y={PLINKO_LAYOUT.SLOT_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={10}
                fontWeight="bold"
                style={{ pointerEvents: 'none' }}
              >
                {safeMult.toFixed(2)}x
              </text>
            </g>
          );
        })}
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