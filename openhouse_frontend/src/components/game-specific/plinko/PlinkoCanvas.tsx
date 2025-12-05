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

  // Refs for stale closures
  const gamePhaseRef = useRef(gamePhase);
  const disabledRef = useRef(disabled);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    gamePhaseRef.current = gamePhase;
    disabledRef.current = disabled;
    onDropRef.current = onDrop;
  }, [gamePhase, disabled, onDrop]);

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
      onDrop: () => {
        if (!disabledRef.current && gamePhaseRef.current === 'idle') {
          onDropRef.current();
        }
      },
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

  return (
    <div className="relative w-full h-full flex flex-col items-center">
      {/* Pixi.js canvas container */}
      <div
        ref={containerRef}
        className="flex-1 w-full"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
};
