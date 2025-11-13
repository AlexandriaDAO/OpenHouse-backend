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
        <label className="block text-sm text-gray-400 mb-2">
          Target: {targetNumber}
        </label>
        <input
          type="range"
          min="1"
          max="99"
          value={targetNumber}
          onChange={(e) => onTargetChange(parseInt(e.target.value))}
          className="w-full"
          disabled={disabled}
        />
      </div>

      {/* Direction - Over/Under */}
      <div className="mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => onDirectionChange('Over')}
            disabled={disabled}
            className={`flex-1 py-3 rounded font-bold transition ${
              direction === 'Over' ? 'bg-green-600' : 'bg-gray-700'
            }`}
          >
            OVER {targetNumber}
          </button>
          <button
            onClick={() => onDirectionChange('Under')}
            disabled={disabled}
            className={`flex-1 py-3 rounded font-bold transition ${
              direction === 'Under' ? 'bg-red-600' : 'bg-gray-700'
            }`}
          >
            UNDER {targetNumber}
          </button>
        </div>
      </div>
    </>
  );
};