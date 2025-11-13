import React from 'react';

export type GameMode = 'practice' | 'real';

interface GameModeToggleProps {
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  isAuthenticated: boolean;
  error?: string;
}

export const GameModeToggle: React.FC<GameModeToggleProps> = ({
  mode,
  onModeChange,
  isAuthenticated,
  error,
}) => {
  const handleModeToggle = (newMode: GameMode) => {
    if (newMode === 'real' && !isAuthenticated) {
      // Parent should handle the error display
      return;
    }
    onModeChange(newMode);
  };

  return (
    <div className="text-center mb-4">
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => handleModeToggle('practice')}
          className={`px-4 py-2 rounded-lg transition ${
            mode === 'practice' ? 'bg-yellow-600' : 'bg-gray-700'
          }`}
          title="Practice Mode"
          aria-label="Switch to Practice Mode"
        >
          🎮
        </button>
        <button
          onClick={() => handleModeToggle('real')}
          disabled={!isAuthenticated}
          className={`px-4 py-2 rounded-lg transition ${
            mode === 'real' && isAuthenticated ? 'bg-green-600' : 'bg-gray-700'
          } ${!isAuthenticated ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={!isAuthenticated ? 'Login for Real Mode' : 'Real Mode'}
          aria-label={!isAuthenticated ? 'Login required for Real Mode' : 'Switch to Real Mode'}
        >
          💰
        </button>
      </div>
      {error && (
        <div className="text-red-400 text-sm mt-2">
          {error}
        </div>
      )}
    </div>
  );
};