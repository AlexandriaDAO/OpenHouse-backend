import React from 'react';

interface PlinkoMultipliersProps {
  multipliers: number[];
  highlightedIndex?: number;
  showWinLoss?: boolean;
}

export const PlinkoMultipliers: React.FC<PlinkoMultipliersProps> = ({
  multipliers,
  highlightedIndex,
  showWinLoss = false
}) => {
  return (
    <div className="flex justify-center gap-1 mt-4">
      {multipliers.map((mult, index) => {
        const isHighlighted = highlightedIndex === index;
        const isWin = mult >= 1.0;
        const isBigWin = mult >= 3.0;

        return (
          <div
            key={index}
            className={`
              px-3 py-2 text-sm font-mono rounded relative
              transition-all duration-300
              ${isHighlighted
                ? 'scale-110 z-10 ring-2 ring-pure-white'
                : ''}
              ${isBigWin && showWinLoss
                ? 'bg-gradient-to-b from-dfinity-red to-red-900 text-pure-white'
                : isWin && showWinLoss
                ? 'bg-gradient-to-b from-green-600 to-green-900 text-pure-white'
                : showWinLoss
                ? 'bg-gradient-to-b from-gray-700 to-gray-900 text-gray-400'
                : 'bg-casino-primary text-pure-white/60'}
            `}
          >
            <div className="font-bold">
              {mult >= 1 ? mult.toFixed(2) : mult.toFixed(3)}x
            </div>
            {showWinLoss && (
              <div className="text-xs mt-1">
                {isWin ? `+${((mult - 1) * 100).toFixed(0)}%` : `-${((1 - mult) * 100).toFixed(0)}%`}
              </div>
            )}
            {/* Position indicator */}
            <div className="text-xs text-pure-white/30 mt-1">
              {index}
            </div>
          </div>
        );
      })}
    </div>
  );
};
