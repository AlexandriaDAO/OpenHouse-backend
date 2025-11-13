import React from 'react';

interface BetAmountInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  isPracticeMode?: boolean;
  error?: string;
}

export const BetAmountInput: React.FC<BetAmountInputProps> = ({
  value,
  onChange,
  min = 0.1,
  max = 100,
  disabled = false,
  isPracticeMode = false,
  error,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value) || 0;
    onChange(newValue);
  };

  // Quick bet buttons
  const quickBets = [1, 5, 10, 25, 50];

  return (
    <div className="mb-4">
      <label className="block text-sm text-gray-400 mb-2">
        Bet Amount {isPracticeMode ? '(Practice)' : ''} (ICP)
      </label>

      <input
        type="number"
        min={min}
        max={max}
        step="0.1"
        value={value}
        onChange={handleChange}
        className="w-full bg-casino-primary border border-casino-accent rounded px-4 py-3 text-lg"
        disabled={disabled}
      />

      {/* Quick bet buttons */}
      <div className="flex gap-2 mt-2">
        {quickBets.map(amount => (
          <button
            key={amount}
            onClick={() => onChange(amount)}
            disabled={disabled}
            className="flex-1 py-1 text-xs bg-casino-secondary hover:bg-casino-accent rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {amount}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-red-400 text-sm mt-2">
          {error}
        </div>
      )}
    </div>
  );
};