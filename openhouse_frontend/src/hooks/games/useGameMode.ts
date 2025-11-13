import { useState, useCallback } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { GameMode } from '../../components/game-ui';

export const useGameMode = () => {
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<GameMode>('practice');
  const [modeError, setModeError] = useState('');

  const isPracticeMode = mode === 'practice' || !isAuthenticated;

  const handleModeChange = useCallback((newMode: GameMode) => {
    setModeError('');

    if (newMode === 'real' && !isAuthenticated) {
      setModeError('Please login to use Real Mode');
      return;
    }

    setMode(newMode);
  }, [isAuthenticated]);

  return {
    mode,
    isPracticeMode,
    isAuthenticated,
    onModeChange: handleModeChange,
    error: modeError,
  };
};