import React, { useRef, useEffect, useCallback, useState } from 'react';
import { PlinkoPixiApp, GamePhase } from './pixi';

interface PlinkoCanvasProps {
  rows: number;
  multipliers: number[];
  paths: boolean[][] | null;
  gamePhase: GamePhase;
  fillProgress: number;
  doorOpen: boolean;
  ballCount: number;
  finalPositions?: number[];
  onAnimationComplete?: () => void;
  onDrop: () => void;
  disabled: boolean;
  isWaitingForBackend: boolean;
}

export const PlinkoCanvas: React.FC<PlinkoCanvasProps> = ({
  rows,
  multipliers,
  paths,
  gamePhase,
  fillProgress: _fillProgress,
  doorOpen,
  ballCount,
  finalPositions,
  onAnimationComplete,
  onDrop,
  disabled,
  isWaitingForBackend,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PlinkoPixiApp | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const prevGamePhaseRef = useRef<GamePhase>('idle');
  const animationCompleteCalledRef = useRef(false);

  // Handle all balls landed
  const handleAllBallsLanded = useCallback(() => {
    if (!animationCompleteCalledRef.current) {
      animationCompleteCalledRef.current = true;
      // Small delay before completing to let landing effect show
      setTimeout(() => {
        onAnimationComplete?.();
      }, 300);
    }
  }, [onAnimationComplete]);

  // Handle individual ball landed
  const handleBallLanded = useCallback(
    (_ballId: number, _slot: number) => {
      // Highlight the slot
      if (appRef.current && finalPositions) {
        appRef.current.highlightSlots(finalPositions);
      }
    },
    [finalPositions]
  );

  // Initialize Pixi app
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    const app = new PlinkoPixiApp({
      rows,
      multipliers,
      onBallLanded: handleBallLanded,
      onAllBallsLanded: handleAllBallsLanded,
    });

    app.init(containerRef.current).then(() => {
      appRef.current = app;
      setIsInitialized(true);
    });

    return () => {
      app.destroy();
      appRef.current = null;
      setIsInitialized(false);
    };
  }, [rows]); // Only re-init if rows change

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !appRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        appRef.current?.resize(width, height);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [isInitialized]);

  // Update multipliers when they change
  useEffect(() => {
    if (appRef.current && multipliers.length > 0) {
      appRef.current.updateMultipliers(multipliers);
    }
  }, [multipliers]);

  // Handle game phase changes
  useEffect(() => {
    if (!appRef.current) return;

    const prevPhase = prevGamePhaseRef.current;
    prevGamePhaseRef.current = gamePhase;

    // Reset animation complete flag on new game
    if (gamePhase === 'idle' && prevPhase !== 'idle') {
      animationCompleteCalledRef.current = false;
    }

    appRef.current.setGamePhase(gamePhase);

    // Handle phase-specific actions
    if (gamePhase === 'filling') {
      appRef.current.fillBucket(ballCount);
    }

    if (gamePhase === 'animating' && paths && paths.length > 0) {
      appRef.current.dropBalls(paths);
    }

    if (gamePhase === 'complete' && finalPositions) {
      appRef.current.highlightSlots(finalPositions);
    }
  }, [gamePhase, paths, ballCount, finalPositions]);

  // Handle door state
  useEffect(() => {
    if (!appRef.current) return;

    if (doorOpen) {
      appRef.current.setGamePhase('releasing');
    }
  }, [doorOpen]);

  // Handle drop click
  const handleClick = useCallback(() => {
    if (disabled || gamePhase !== 'idle') return;
    onDrop();
  }, [disabled, gamePhase, onDrop]);

  // Get button label
  const getLabel = () => {
    if (isWaitingForBackend) return 'WAITING...';
    switch (gamePhase) {
      case 'filling':
        return 'LOADING...';
      case 'releasing':
      case 'animating':
        return 'DROPPING...';
      default:
        return ballCount > 1 ? `DROP ${ballCount}` : 'DROP';
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center" style={{ minHeight: '400px' }}>
      {/* Pixi.js canvas container */}
      <div
        ref={containerRef}
        className="flex-1 w-full"
        style={{ touchAction: 'none', minHeight: '350px' }}
      />

      {/* Drop button overlay (positioned at top center) */}
      <button
        onClick={handleClick}
        disabled={disabled || gamePhase !== 'idle'}
        className={`
          absolute top-4 left-1/2 -translate-x-1/2 z-10
          px-6 py-3 rounded-lg font-bold text-sm uppercase tracking-wide
          transition-all duration-200
          ${
            disabled || gamePhase !== 'idle'
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-b from-yellow-500 to-yellow-600 text-black hover:from-yellow-400 hover:to-yellow-500 hover:scale-105 active:scale-95 cursor-pointer shadow-lg'
          }
        `}
      >
        {getLabel()}
      </button>
    </div>
  );
};
