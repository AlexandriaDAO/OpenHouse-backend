import React from 'react';
import { ChipDenomination, decomposeIntoChips, chipCountsToArray } from './chipConfig';

interface ChipStackProps {
  amount: number;
  maxChipsShown?: number;
  onClick?: () => void;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ChipStack: React.FC<ChipStackProps> = ({
  amount,
  maxChipsShown = 10,
  onClick,
  showValue = true,
  size = 'md',
  className = '',
}) => {
  const chipCounts = decomposeIntoChips(amount);
  const chipsToShow = chipCountsToArray(chipCounts, maxChipsShown);
  const totalChipCount = chipCounts.reduce((sum, { count }) => sum + count, 0);
  const hasMore = totalChipCount > maxChipsShown;

  // Size configurations
  const sizeConfig = {
    sm: { width: 40, height: 20, offset: -14 },
    md: { width: 60, height: 30, offset: -20 },
    lg: { width: 80, height: 40, offset: -28 },
  };
  const { width, height, offset } = sizeConfig[size];

  if (amount <= 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center ${className}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default', minHeight: height + 20 }}
      >
        <div className="text-gray-500 text-xs italic">No chips</div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Chip stack - side view images stacked vertically */}
      <div
        className="relative"
        style={{
          height: height + (chipsToShow.length - 1) * Math.abs(offset) + 10,
          width: width + 20,
        }}
      >
        {chipsToShow.map((chip, index) => (
          <img
            key={index}
            src={chip.sideImg}
            alt={`${chip.color} chip`}
            className="absolute left-1/2 transform -translate-x-1/2 drop-shadow-md transition-transform hover:scale-105"
            style={{
              width,
              height: 'auto',
              bottom: index * Math.abs(offset),
              zIndex: index,
            }}
          />
        ))}

        {/* "More" indicator if truncated */}
        {hasMore && (
          <div
            className="absolute -top-2 -right-2 bg-dfinity-turquoise text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
            style={{ zIndex: chipsToShow.length + 1 }}
          >
            +{totalChipCount - maxChipsShown}
          </div>
        )}
      </div>

      {/* Value display */}
      {showValue && (
        <div className="mt-1 text-xs font-mono font-bold text-gray-300">
          {amount.toFixed(2)} USDT
        </div>
      )}
    </div>
  );
};
