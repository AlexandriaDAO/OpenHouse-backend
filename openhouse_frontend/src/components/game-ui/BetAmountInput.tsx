import React from 'react';

interface BetAmountInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  isPracticeMode?: boolean;
  error?: string;
  variant?: 'input' | 'slider';
}

export const BetAmountInput: React.FC<BetAmountInputProps> = ({
  value,
  onChange,
  min = 0.01,
  max = 1,
  disabled = false,
  isPracticeMode = false,
  error,
  variant = 'input',
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value) || 0;
    // Clamp value between min and max
    const clampedValue = Math.min(Math.max(newValue, min), max);
    onChange(clampedValue);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    onChange(newValue);
  };

  if (variant === 'slider') {
    return (
      <div className="mb-4">
        <label className="block text-sm text-pure-white/60 mb-2 font-mono">
          Bet Amount {isPracticeMode ? '(Practice)' : ''}: {value.toFixed(2)} USDT
        </label>

        <input
          type="range"
          min={min}
          max={max}
          step="0.01"
          value={value}
          onChange={handleSliderChange}
          className="w-full slider-turquoise"
          disabled={disabled}
        />

        <div className="flex justify-between text-xs text-pure-white/40 font-mono mt-1">
          <span>{min} USDT</span>
          <span>{max} USDT</span>
        </div>

        {error && (
          <div className="text-dfinity-red text-sm mt-2 font-mono">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-sm text-pure-white/60 mb-2 font-mono">
        Bet Amount {isPracticeMode ? '(Practice)' : ''} (USDT)
      </label>

      <input
        type="number"
        min={min}
        max={max}
        step="0.01"
        value={value}
        onChange={handleChange}
        className="w-full bg-transparent border-2 border-pure-white/20 text-pure-white
                   focus:border-dfinity-turquoise focus:outline-none
                   font-mono px-4 py-3 text-lg
                   disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={disabled}
        placeholder="0.00"
      />

      {error && (
        <div className="text-dfinity-red text-sm mt-2 font-mono">
          {error}
        </div>
      )}
    </div>
  );
};
