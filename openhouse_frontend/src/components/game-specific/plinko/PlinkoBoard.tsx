import React, { useMemo } from 'react';
import { PLINKO_LAYOUT } from './plinkoAnimations';
import { MultiplierSlot } from './MultiplierSlot';

interface PlinkoBoardProps {
  rows: number;
  multipliers: number[];
  activeSlot?: number | null;  // Legacy single slot
  activeSlots?: Set<number>;   // Multiple active slots for multi-ball
}

export const PlinkoBoard: React.FC<PlinkoBoardProps> = ({ rows, multipliers, activeSlot = null, activeSlots }) => {
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

        {/* Ball gradient - metallic turquoise (brand color) */}
        <radialGradient id="ballGradient" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#b3ffb3" />
          <stop offset="30%" stopColor="#39FF14" />
          <stop offset="70%" stopColor="#2ad912" />
          <stop offset="100%" stopColor="#1a8a0a" />
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
            isActive={activeSlot === i || (activeSlots?.has(i) ?? false)}
          />
        ))}
      </g>
    </g>
  );
};

// Helper: Generate peg grid positions (matching open source layout)
// Open source uses 3+row pins per row: row 0 = 3 pins, row 1 = 4 pins, etc.
function generatePegPositions(rows: number) {
  const pegs: { x: number; y: number }[] = [];
  const { BOARD_WIDTH, BOARD_HEIGHT, PADDING_X, PADDING_TOP, PADDING_BOTTOM } = PLINKO_LAYOUT;

  // Pin distance X = available width / (last row pin count - 1)
  // Last row has 3 + (rows - 1) = 2 + rows pins
  const lastRowPinCount = 2 + rows;
  const pinDistanceX = (BOARD_WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);

  for (let row = 0; row < rows; row++) {
    // Y position: evenly distributed from PADDING_TOP to (HEIGHT - PADDING_BOTTOM)
    const rowY = PADDING_TOP + ((BOARD_HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (rows - 1)) * row;

    // Horizontal padding for this row (wider at top, narrower at bottom)
    const rowPaddingX = PADDING_X + ((rows - 1 - row) * pinDistanceX) / 2;

    // Each row has 3 + row pins
    const pinsInRow = 3 + row;

    for (let col = 0; col < pinsInRow; col++) {
      // X position: evenly distributed within row's available width
      const colX = rowPaddingX + ((BOARD_WIDTH - rowPaddingX * 2) / (pinsInRow - 1)) * col;
      pegs.push({ x: colX, y: rowY });
    }
  }

  return pegs;
}

// Helper: Generate slot positions matching backend's 9 multipliers (positions 0-8)
// Slots are positioned at the CENTER of gaps between consecutive last-row pins
function generateSlotPositions(rows: number, _multipliers: number[]) {
  const slots: { x: number; y: number }[] = [];
  const { BOARD_WIDTH, BOARD_HEIGHT, PADDING_X, PADDING_TOP, PADDING_BOTTOM, SLOT_OFFSET_Y } = PLINKO_LAYOUT;

  // Last row has 3 + (rows-1) = 2 + rows pins
  const lastRowPinCount = 2 + rows;  // 10 pins for 8 rows
  const pinDistanceX = (BOARD_WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);

  // Calculate last row pin X positions (matching physics engine)
  const lastRowPinXs: number[] = [];
  for (let col = 0; col < lastRowPinCount; col++) {
    const x = PADDING_X + col * pinDistanceX;
    lastRowPinXs.push(x);
  }

  // Slots Y is below the last row of pins
  const lastRowY = PADDING_TOP + ((BOARD_HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (rows - 1)) * (rows - 1);
  const slotsY = lastRowY + SLOT_OFFSET_Y + 15;

  // Slot count = gaps between pins = pins - 1 = 9 (matching backend positions 0-8)
  const slotCount = lastRowPinCount - 1;

  // Position each slot at the CENTER of the gap between consecutive pins
  for (let i = 0; i < slotCount; i++) {
    // Slot i is centered between pin i and pin i+1
    const x = (lastRowPinXs[i] + lastRowPinXs[i + 1]) / 2;
    slots.push({ x, y: slotsY });
  }

  return slots;
}