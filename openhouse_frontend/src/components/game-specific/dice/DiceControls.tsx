import React from 'react';
import { DiceCountSelector } from './DiceCountSelector';

export type DiceDirection = 'Over' | 'Under';

interface DiceControlsProps {
  targetNumber: number;
  onTargetChange: (value: number) => void;
  diceCount: 1 | 2 | 3;
  onDiceCountChange: (count: 1 | 2 | 3) => void;
  disabled?: boolean;
}

export const DiceControls: React.FC<DiceControlsProps> = ({
  targetNumber,
  onTargetChange,
  diceCount,
  onDiceCountChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-center gap-3">
      {/* Dice count stepper - inline left */}
      <DiceCountSelector
        diceCount={diceCount}
        onDiceCountChange={onDiceCountChange}
        disabled={disabled}
      />

      {/* Separator */}
      <div className="w-px h-4 bg-gray-700" />

      {/* Target slider */}
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
