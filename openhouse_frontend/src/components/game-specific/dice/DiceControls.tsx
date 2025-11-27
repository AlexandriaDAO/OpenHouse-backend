import React, { useState } from 'react';

export type DiceDirection = 'Over' | 'Under';

interface DiceControlsProps {
  targetNumber: number;
  onTargetChange: (value: number) => void;
  direction: DiceDirection;
  onDirectionChange: (direction: DiceDirection) => void;
  disabled?: boolean;
}

// Preset win chances with their corresponding target numbers
const WIN_PRESETS = [
  { chance: 10, label: '10%', targetOver: 90, targetUnder: 10 },
  { chance: 25, label: '25%', targetOver: 75, targetUnder: 25 },
  { chance: 50, label: '50%', targetOver: 50, targetUnder: 50 },
  { chance: 75, label: '75%', targetOver: 25, targetUnder: 75 },
  { chance: 90, label: '90%', targetOver: 10, targetUnder: 90 },
];

export const DiceControls: React.FC<DiceControlsProps> = ({
  targetNumber,
  onTargetChange,
  direction,
  onDirectionChange,
  disabled = false,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Calculate current win chance based on direction and target
  const winChance = direction === 'Over' ? 100 - targetNumber : targetNumber;

  // Handle preset click - sets both target and direction optimally
  const handlePresetClick = (preset: typeof WIN_PRESETS[0]) => {
    if (direction === 'Over') {
      onTargetChange(preset.targetOver);
    } else {
      onTargetChange(preset.targetUnder);
    }
  };

  return (
    <div className="space-y-3">
      {/* Direction toggle - big and clear */}
      <div className="flex gap-2">
        <button
          onClick={() => onDirectionChange('Over')}
          disabled={disabled}
          className={`flex-1 py-3 text-sm font-bold rounded-lg transition ${
            direction === 'Over'
              ? 'bg-green-500 text-black shadow-lg shadow-green-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-white'
          }`}
        >
          ROLL HIGH
        </button>
        <button
          onClick={() => onDirectionChange('Under')}
          disabled={disabled}
          className={`flex-1 py-3 text-sm font-bold rounded-lg transition ${
            direction === 'Under'
              ? 'bg-blue-500 text-black shadow-lg shadow-blue-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-white'
          }`}
        >
          ROLL LOW
        </button>
      </div>

      {/* Quick presets by win chance */}
      <div className="flex gap-1.5">
        {WIN_PRESETS.map((preset) => {
          const isActive = Math.abs(winChance - preset.chance) < 3;
          return (
            <button
              key={preset.chance}
              onClick={() => handlePresetClick(preset)}
              disabled={disabled}
              className={`flex-1 py-2 text-xs font-bold rounded transition ${
                isActive
                  ? 'bg-dfinity-turquoise text-black'
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Current selection display */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-gray-500">
          {direction === 'Over' ? `Roll > ${targetNumber}` : `Roll < ${targetNumber}`}
        </span>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-gray-500 hover:text-dfinity-turquoise transition"
        >
          {showAdvanced ? 'Hide' : 'Custom'}
        </button>
      </div>

      {/* Advanced slider (hidden by default) */}
      {showAdvanced && (
        <div className="pt-2 border-t border-gray-700/30">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-8">{targetNumber}</span>
            <input
              type="range"
              min="1"
              max="99"
              value={targetNumber}
              onChange={(e) => onTargetChange(parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dfinity-turquoise"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
};