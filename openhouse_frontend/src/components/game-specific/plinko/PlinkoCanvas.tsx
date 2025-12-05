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
  isWaitingForBackend: _isWaitingForBackend,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PlinkoPixiApp | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const prevGamePhaseRef = useRef<GamePhase>('idle');
  const animationCompleteCalledRef = useRef(false);
  const droppedBallsRef = useRef(false);

  // Refs for stale closures
  const gamePhaseRef = useRef(gamePhase);
  const disabledRef = useRef(disabled);
  const onDropRef = useRef(onDrop);
  const finalPositionsRef = useRef(finalPositions);

  useEffect(() => {
    gamePhaseRef.current = gamePhase;
    disabledRef.current = disabled;
    onDropRef.current = onDrop;
    finalPositionsRef.current = finalPositions;
  }, [gamePhase, disabled, onDrop, finalPositions]);

  // Handle all balls landed
  const handleAllBallsLanded = useCallback(() => {
    if (!animationCompleteCalledRef.current) {
      animationCompleteCalledRef.current = true;
      setTimeout(() => {
        onAnimationComplete?.();
      }, 300);
    }
  }, [onAnimationComplete]);

  // Handle individual ball landed
  const handleBallLanded = useCallback(
    (_ballId: number, _slot: number) => {
      if (appRef.current && finalPositionsRef.current) {
        appRef.current.highlightSlots(finalPositionsRef.current);
      }
    },
    []
  );

  // Initialize Pixi app
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    const container = containerRef.current;

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

    app.init(container).then(() => {
      appRef.current = app;
      // Apply multipliers immediately after init (in case they were available before init completed)
      if (multipliers.length > 0) {
        app.updateMultipliers(multipliers);
      }
      setIsInitialized(true);
    }).catch((err) => {
      console.error('Failed to initialize Plinko canvas:', err);
    });

    return () => {
      if (appRef.current) {
        appRef.current.destroy();
        appRef.current = null;
        setIsInitialized(false);
      }
    };
  }, [rows]);

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

    // Reset flags on new game
    if (gamePhase === 'idle' && prevPhase !== 'idle') {
      animationCompleteCalledRef.current = false;
      droppedBallsRef.current = false;
    }

    // Reset dropped flag when starting a new filling phase
    if (gamePhase === 'filling' && prevPhase === 'idle') {
      droppedBallsRef.current = false;
    }

    appRef.current.setGamePhase(gamePhase);

    // Handle phase-specific actions
    if (gamePhase === 'filling') {
      appRef.current.fillBucket(ballCount);
    }

    // Only drop balls ONCE per animation cycle
    if (gamePhase === 'animating' && paths && paths.length > 0 && !droppedBallsRef.current) {
      droppedBallsRef.current = true;
      appRef.current.dropBalls(paths);
    }

    if (gamePhase === 'complete' && finalPositionsRef.current) {
      appRef.current.highlightSlots(finalPositionsRef.current);
    }
  }, [gamePhase, paths, ballCount]);

  // Handle door state
  useEffect(() => {
    if (!appRef.current) return;

    if (doorOpen) {
      appRef.current.setGamePhase('releasing');
    }
  }, [doorOpen]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
};
