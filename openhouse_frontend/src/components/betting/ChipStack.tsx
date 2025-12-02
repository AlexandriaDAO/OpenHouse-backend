import { useMemo, useCallback } from 'react';
import { decomposeIntoChips, ChipDenomination } from '../game-specific/dice/chipConfig';
import { ChipStackProps } from './types';

// Base chip stack dimensions (desktop)
const BASE_CHIP_WIDTH = 80;
const BASE_CHIP_HEIGHT = 40;
const BASE_STACK_OFFSET = 6; // Vertical spacing between chips in a pile
const BASE_PILE_OVERLAP = -12; // Horizontal overlap between piles

interface ExtendedChipStackProps extends ChipStackProps {
  scale?: number;
  layout?: 'horizontal' | 'circular'; // horizontal = desktop, circular = mobile pile
  circleSize?: number; // Size of the circular container
}

export function ChipStack({
  amount,
  onRemoveChip,
  disabled = false,
  maxChipsPerPile = 12,
  scale = 1,
  layout = 'horizontal',
  circleSize = 70,
}: ExtendedChipStackProps) {
  // Decompose amount into chip counts
  const chipData = useMemo(() => decomposeIntoChips(amount), [amount]);

  // Handle clicking a chip to remove it
  const handleChipClick = useCallback((chip: ChipDenomination) => {
    if (disabled || !onRemoveChip) return;
    onRemoveChip(chip.value);
  }, [disabled, onRemoveChip]);

  // Empty state
  if (amount <= 0 || chipData.length === 0) {
    return (
      <div className="bet-placeholder" style={layout === 'circular' ? { width: circleSize, height: circleSize } : undefined}>
        <span>BET</span>
      </div>
    );
  }

  // CIRCULAR LAYOUT - stacked piles arranged in a full circle, no overlap
  if (layout === 'circular') {
    const totalPiles = chipData.length;

    // Chip sizing for mobile - larger chips
    const chipWidth = circleSize * 0.42;
    const stackOffset = circleSize * 0.035;
    const maxChips = 5; // Max chips per pile in this layout

    // Tighter circle arrangement
    const radius = circleSize * 0.26;

    return (
      <div
        className="chip-pile-circular"
        style={{
          width: circleSize,
          height: circleSize,
          position: 'relative',
          overflow: 'visible', // Ensure chips aren't clipped
        }}
      >
        {chipData.map(({ chip, count }, pileIndex) => {
          const visibleCount = Math.min(count, maxChips);
          const hasOverflow = count > maxChips;

          // Position around the circle - start from BOTTOM and go clockwise
          // This puts white chips (index 0) at the front/bottom where they're visible
          const angle = (pileIndex / totalPiles) * Math.PI * 2 + Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius * 0.45; // Squash for perspective

          return (
            <div
              key={chip.color}
              className="chip-pile"
              style={{
                position: 'absolute',
                left: '50%',
                top: '65%', // Lower in the container
                width: chipWidth,
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                zIndex: Math.round(10 + y), // Further back = lower z-index (top chips behind)
              }}
            >
              {/* Render stacked chips */}
              {Array(visibleCount).fill(null).map((_, chipIndex) => (
                <img
                  key={chipIndex}
                  src={chip.sideImg}
                  alt={`${chip.label} chip`}
                  className={`chip-in-pile ${disabled ? '' : 'cursor-pointer'}`}
                  onClick={() => handleChipClick(chip)}
                  style={{
                    position: 'absolute',
                    width: chipWidth,
                    height: 'auto',
                    bottom: chipIndex * stackOffset,
                    left: 0,
                    zIndex: chipIndex,
                  }}
                  title={disabled ? '' : `Click to remove $${chip.value.toFixed(2)}`}
                />
              ))}

              {/* Overflow indicator */}
              {hasOverflow && (
                <div
                  className="absolute -top-1 -right-1 bg-white text-gray-900 text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-md border border-gray-300"
                  style={{ zIndex: 100 }}
                >
                  +{count - maxChips}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // HORIZONTAL LAYOUT (default - desktop)
  const CHIP_WIDTH = BASE_CHIP_WIDTH * scale;
  const CHIP_HEIGHT = BASE_CHIP_HEIGHT * scale;
  const STACK_OFFSET = BASE_STACK_OFFSET * scale;
  const PILE_OVERLAP = BASE_PILE_OVERLAP * scale;

  const totalPiles = chipData.length;
  const totalWidth = totalPiles * CHIP_WIDTH + (totalPiles - 1) * PILE_OVERLAP;

  const maxStackHeight = Math.max(
    ...chipData.map(({ count }) => {
      const visibleCount = Math.min(count, maxChipsPerPile);
      return CHIP_HEIGHT + (visibleCount - 1) * STACK_OFFSET;
    })
  );

  const containerWidth = totalWidth + 20;
  const centerOffset = (containerWidth - totalWidth) / 2;

  return (
    <div
      className="chip-stack-container"
      style={{
        width: containerWidth,
        height: maxStackHeight,
        position: 'relative',
        marginBottom: -8,
      }}
    >
      {chipData.map(({ chip, count }, pileIndex) => {
        const visibleCount = Math.min(count, maxChipsPerPile);
        const hasOverflow = count > maxChipsPerPile;
        const stackHeight = CHIP_HEIGHT + (visibleCount - 1) * STACK_OFFSET;
        const pileLeft = centerOffset + pileIndex * (CHIP_WIDTH + PILE_OVERLAP);

        return (
          <div
            key={chip.color}
            className="chip-pile"
            style={{
              position: 'absolute',
              left: pileLeft,
              bottom: 0,
              width: CHIP_WIDTH,
              height: stackHeight,
              zIndex: pileIndex + 1,
            }}
          >
            {Array(visibleCount).fill(null).map((_, chipIndex) => (
              <img
                key={chipIndex}
                src={chip.sideImg}
                alt={`${chip.label} chip`}
                className={`chip-in-pile ${disabled ? '' : 'cursor-pointer'}`}
                onClick={() => handleChipClick(chip)}
                style={{
                  width: CHIP_WIDTH,
                  height: 'auto',
                  bottom: chipIndex * STACK_OFFSET,
                  zIndex: chipIndex,
                }}
                title={disabled ? '' : `Click to remove $${chip.value.toFixed(2)}`}
              />
            ))}

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
}
