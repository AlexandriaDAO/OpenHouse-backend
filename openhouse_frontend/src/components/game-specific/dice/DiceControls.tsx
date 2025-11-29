import React from 'react';

export type DiceDirection = 'Over' | 'Under';

interface DiceControlsProps {
  targetNumber: number;
  onTargetChange: (value: number) => void;
  disabled?: boolean;
}

export const DiceControls: React.FC<DiceControlsProps> = ({
  targetNumber,
  onTargetChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-500 text-xs">Target:</span>
      <input
        type="range"
        min="2"
        max="98"
        value={targetNumber}
        onChange={(e) => onTargetChange(parseInt(e.target.value))}
        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
        disabled={disabled}
      />
      <span className="text-white font-bold font-mono w-8 text-center">{targetNumber}</span>
    </div>
  );
};
