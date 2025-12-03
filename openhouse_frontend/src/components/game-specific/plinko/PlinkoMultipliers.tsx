import React from 'react';

interface PlinkoMultipliersProps {
  multipliers: number[];
  highlightedIndex?: number;
}

export const PlinkoMultipliers: React.FC<PlinkoMultipliersProps> = ({
  multipliers,
  highlightedIndex
}) => {
  return (
    <div className="flex justify-center gap-1 flex-wrap">
      {multipliers.map((mult, index) => {
        const isHighlighted = highlightedIndex === index;
        const isWin = mult >= 1.0;

        return (
          <div
            key={index}
            className={`
              px-2 py-1 text-xs font-mono rounded relative
              transition-all duration-300
              ${isHighlighted
                ? 'scale-110 z-10 ring-1 ring-pure-white'
                : ''}
              ${isWin 
                ? 'bg-green-900/50 text-green-400' 
                : 'bg-red-900/50 text-red-400'}
            `}
          >
            {mult.toFixed(2)}x
          </div>
        );
      })}
    </div>
  );
};