import React, { useMemo, useCallback } from 'react';
import { decomposeIntoChips, ChipDenomination, CHIP_DENOMINATIONS } from '../game-specific/dice/chipConfig';

interface InteractiveChipStackProps {
  amount: number;
  onRemoveChip?: (chipValue: number) => void;
  disabled?: boolean;
  maxChipsPerPile?: number;
}

interface ChipInStack {
  chip: ChipDenomination;
  index: number;
  pileIndex: number;
}

export const InteractiveChipStack: React.FC<InteractiveChipStackProps> = ({
  amount,
  onRemoveChip,
  disabled = false,
  maxChipsPerPile = 12,
}) => {
  // Decompose amount into chip counts
  const chipData = useMemo(() => decomposeIntoChips(amount), [amount]);

  // Handle clicking a chip to remove it
  const handleChipClick = useCallback((chip: ChipDenomination) => {
    if (disabled || !onRemoveChip) return;
    onRemoveChip(chip.value);
  }, [disabled, onRemoveChip]);

  // Calculate dimensions
  const chipWidth = 80;
  const chipHeight = 40;
  const stackOffset = 6; // Vertical spacing between chips in a pile
  const pileOverlap = -12; // Horizontal overlap between piles

  if (amount <= 0 || chipData.length === 0) {
    return (
      <div className="bet-placeholder">
        <span>BET</span>
      </div>
    );
  }

  // Calculate total width needed
  const totalPiles = chipData.length;
  const totalWidth = totalPiles * chipWidth + (totalPiles - 1) * pileOverlap;

  // Find max stack height for container sizing
  const maxStackHeight = Math.max(
    ...chipData.map(({ count }) => {
      const visibleCount = Math.min(count, maxChipsPerPile);
      return chipHeight + (visibleCount - 1) * stackOffset;
    })
  );

  return (
    <div
      className="chip-stack-container"
      style={{
        width: totalWidth + 20, // padding
        height: maxStackHeight + 20,
      }}
    >
      {chipData.map(({ chip, count }, pileIndex) => {
        const visibleCount = Math.min(count, maxChipsPerPile);
        const hasOverflow = count > maxChipsPerPile;
        const stackHeight = chipHeight + (visibleCount - 1) * stackOffset;

        // Position this pile
        const pileLeft = pileIndex * (chipWidth + pileOverlap);

        return (
          <div
            key={chip.color}
            className="chip-pile"
            style={{
              position: 'absolute',
              left: pileLeft,
              bottom: 0,
              width: chipWidth,
              height: stackHeight,
              zIndex: pileIndex + 1,
            }}
          >
            {/* Render chips in the pile */}
            {Array(visibleCount).fill(null).map((_, chipIndex) => (
              <img
                key={chipIndex}
                src={chip.sideImg}
                alt={`${chip.label} chip`}
                className={`chip-in-pile ${disabled ? '' : 'cursor-pointer'}`}
                onClick={() => handleChipClick(chip)}
                style={{
                  width: chipWidth,
                  height: 'auto',
                  bottom: chipIndex * stackOffset,
                  zIndex: chipIndex,
                }}
                title={disabled ? '' : `Click to remove $${chip.value.toFixed(2)}`}
              />
            ))}

            {/* Overflow indicator */}
            {hasOverflow && (
              <div
                className="absolute -top-2 -right-1 bg-white text-gray-900 text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md border border-gray-300"
                style={{ zIndex: 100 }}
              >
                +{count - maxChipsPerPile}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default InteractiveChipStack;
