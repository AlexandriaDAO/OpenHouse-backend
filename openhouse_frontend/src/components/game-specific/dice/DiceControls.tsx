import React from 'react';

export type DiceDirection = 'Over' | 'Under';

interface DiceControlsProps {
  targetNumber: number;
  onTargetChange: (value: number) => void;
  direction: DiceDirection;
  onDirectionChange: (direction: DiceDirection) => void;
  disabled?: boolean;
}

export const DiceControls: React.FC<DiceControlsProps> = ({
  targetNumber,
  onTargetChange,
  direction,
  onDirectionChange,
  disabled = false,
}) => {
  return (
    <>
      {/* Target Number Slider */}
      <div className="mb-4">
        <label className="block text-sm text-pure-white/60 mb-2 font-mono">
          Target: {targetNumber}
        </label>
        <input
          type="range"
          min="1"
          max="99"
          value={targetNumber}
          onChange={(e) => onTargetChange(parseInt(e.target.value))}
          className="w-full slider-turquoise"
          disabled={disabled}
        />
      </div>

      {/* Direction - Over/Under */}
      <div className="mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => onDirectionChange('Over')}
            disabled={disabled}
            className={`flex-1 py-3 font-mono font-bold border-2 transition ${
              direction === 'Over'
                ? 'bg-dfinity-green border-dfinity-green text-pure-black'
                : 'bg-transparent border-dfinity-green text-dfinity-green'
            }`}
          >
            OVER {targetNumber}
          </button>
          <button
            onClick={() => onDirectionChange('Under')}
            disabled={disabled}
            className={`flex-1 py-3 font-mono font-bold border-2 transition ${
              direction === 'Under'
                ? 'bg-dfinity-red border-dfinity-red text-pure-black'
                : 'bg-transparent border-dfinity-red text-dfinity-red'
            }`}
          >
            UNDER {targetNumber}
          </button>
        </div>
      </div>
    </>
  );
};