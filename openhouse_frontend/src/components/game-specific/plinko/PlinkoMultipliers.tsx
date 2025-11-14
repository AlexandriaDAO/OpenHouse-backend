import React from 'react';

interface PlinkoMultipliersProps {
  multipliers: number[];
  highlightedIndex?: number;
}

export const PlinkoMultipliers: React.FC<PlinkoMultipliersProps> = ({
  multipliers,
  highlightedIndex,
}) => {
  const getMultiplierColor = (multiplier: number) => {
    if (multiplier >= 100) return 'text-purple-400 font-bold';
    if (multiplier >= 10) return 'text-dfinity-red font-bold';
    if (multiplier >= 3) return 'text-yellow-500';
    if (multiplier >= 1) return 'text-dfinity-turquoise';
    return 'text-gray-400';
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {multipliers.map((mult, index) => (
          <div
            key={index}
            className={`
              px-2 py-1 rounded text-xs font-mono transition-all
              ${getMultiplierColor(mult)}
              ${highlightedIndex === index ? 'bg-white/20 scale-125 ring-2 ring-dfinity-turquoise' : 'bg-casino-primary/50'}
            `}
          >
            {mult.toFixed(mult >= 10 ? 0 : 1)}x
          </div>
        ))}
      </div>
    </div>
  );
};
