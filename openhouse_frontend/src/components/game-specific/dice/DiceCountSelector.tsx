import React from 'react';

interface DiceCountSelectorProps {
  diceCount: 1 | 2 | 3;
  onDiceCountChange: (count: 1 | 2 | 3) => void;
  disabled?: boolean;
}

export const DiceCountSelector: React.FC<DiceCountSelectorProps> = ({
  diceCount,
  onDiceCountChange,
  disabled = false,
}) => {
  const decrement = () => {
    if (diceCount > 1) {
      onDiceCountChange((diceCount - 1) as 1 | 2 | 3);
    }
  };

  const increment = () => {
    if (diceCount < 3) {
      onDiceCountChange((diceCount + 1) as 1 | 2 | 3);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={decrement}
        disabled={disabled || diceCount <= 1}
        className={`w-6 h-6 flex items-center justify-center rounded text-sm font-bold transition-colors
          ${disabled || diceCount <= 1
            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-gray-700 text-white hover:bg-gray-600 active:bg-gray-500'
          }`}
        aria-label="Decrease dice count"
      >
        −
      </button>
      <span className="w-5 text-center text-white font-mono font-bold text-sm">
        {diceCount}
      </span>
      <button
        onClick={increment}
        disabled={disabled || diceCount >= 3}
        className={`w-6 h-6 flex items-center justify-center rounded text-sm font-bold transition-colors
          ${disabled || diceCount >= 3
            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-gray-700 text-white hover:bg-gray-600 active:bg-gray-500'
          }`}
        aria-label="Increase dice count"
      >
        +
      </button>
    </div>
  );
};
