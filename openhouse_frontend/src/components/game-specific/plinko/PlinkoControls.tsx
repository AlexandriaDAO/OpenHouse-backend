import React from 'react';

export type RiskLevel = 'Low' | 'Medium' | 'High';
export type RowCount = 8 | 12 | 16;

interface PlinkoControlsProps {
  rows: RowCount;
  onRowsChange: (rows: RowCount) => void;
  riskLevel: RiskLevel;
  onRiskLevelChange: (risk: RiskLevel) => void;
  disabled?: boolean;
}

export const PlinkoControls: React.FC<PlinkoControlsProps> = ({
  rows,
  onRowsChange,
  riskLevel,
  onRiskLevelChange,
  disabled = false,
}) => {
  const rowOptions: RowCount[] = [8, 12, 16];
  const riskOptions: RiskLevel[] = ['Low', 'Medium', 'High'];

  return (
    <>
      {/* Rows Selection */}
      <div className="mb-4">
        <label className="block text-sm text-pure-white/60 mb-2 font-mono">
          Rows: {rows}
        </label>
        <div className="flex gap-2">
          {rowOptions.map((option) => (
            <button
              key={option}
              onClick={() => onRowsChange(option)}
              disabled={disabled}
              className={`flex-1 py-3 font-mono font-bold border-2 transition ${
                rows === option
                  ? 'bg-dfinity-turquoise border-dfinity-turquoise text-pure-black'
                  : 'bg-transparent border-dfinity-turquoise text-dfinity-turquoise hover:bg-dfinity-turquoise/10'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Risk Level Selection */}
      <div className="mb-4">
        <label className="block text-sm text-pure-white/60 mb-2 font-mono">
          Risk Level
        </label>
        <div className="flex gap-2">
          {riskOptions.map((option) => {
            const isSelected = riskLevel === option;
            let colorClass = '';
            if (option === 'Low') {
              colorClass = isSelected
                ? 'bg-dfinity-green border-dfinity-green text-pure-black'
                : 'bg-transparent border-dfinity-green text-dfinity-green hover:bg-dfinity-green/10';
            } else if (option === 'Medium') {
              colorClass = isSelected
                ? 'bg-yellow-500 border-yellow-500 text-pure-black'
                : 'bg-transparent border-yellow-500 text-yellow-500 hover:bg-yellow-500/10';
            } else {
              colorClass = isSelected
                ? 'bg-dfinity-red border-dfinity-red text-pure-black'
                : 'bg-transparent border-dfinity-red text-dfinity-red hover:bg-dfinity-red/10';
            }

            return (
              <button
                key={option}
                onClick={() => onRiskLevelChange(option)}
                disabled={disabled}
                className={`flex-1 py-3 font-mono font-bold border-2 transition ${colorClass} ${
                  disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {option.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
