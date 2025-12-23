import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BASE_SIZE, BASE_WALL_COLOR } from '../../riskConstants';
import {
  TutorialCell,
  BaseState,
  TUTORIAL_GRID_SIZE,
  PLAYER_ID,
  ENEMY_ID,
  PLAYER_COLOR,
  ENEMY_COLOR,
  PLAYER_TERRITORY_COLOR,
  ENEMY_TERRITORY_COLOR,
  GLIDER_DOWN_RIGHT,
  GLIDER_UP_LEFT,
  createEmptyGrid,
  isWall,
  isInterior,
} from './types';
import { stepGenerationSinglePlayer, stepGenerationMultiplayer } from './simulation';
import { TUTORIAL_SLIDES } from './slides';

interface RiskTutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

// Slide-specific base positions
const SLIDE_CONFIGS: Record<string, {
  playerBase?: { x: number; y: number };
  enemyBase?: { x: number; y: number };
}> = {
  'place-cells': {
    playerBase: { x: 8, y: 8 },
  },
  'attack-territory': {
    playerBase: { x: 2, y: 14 },
    enemyBase: { x: 14, y: 2 },
  },
  'territory-cutoff': {
    playerBase: { x: 8, y: 14 },
  },
  'attack-strategy': {
    playerBase: { x: 2, y: 14 },
    enemyBase: { x: 14, y: 2 },
  },
  'wipers': {
    playerBase: { x: 4, y: 4 },
  },
  'coins-economy': {
    playerBase: { x: 8, y: 8 },
  },
};

export const RiskTutorial: React.FC<RiskTutorialProps> = ({
  isOpen,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [cells, setCells] = useState<TutorialCell[][]>(createEmptyGrid);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasPlaced, setHasPlaced] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const animationRef = useRef<number>(0);

  // Slide-specific state
  const [bases, setBases] = useState<BaseState[]>([]);
  const [enemyCoins, setEnemyCoins] = useState(50);
  const [showVictory, setShowVictory] = useState(false);

  const currentSlideData = TUTORIAL_SLIDES[currentSlide];
  const slideConfig = SLIDE_CONFIGS[currentSlideData?.id] || {};

  // Initialize grid for current slide
  const initializeSlide = useCallback((slideIndex: number) => {
    const slide = TUTORIAL_SLIDES[slideIndex];
    if (!slide) return;

    const config = SLIDE_CONFIGS[slide.id] || {};
    const grid = createEmptyGrid();
    const newBases: BaseState[] = [];

    // Set up player base and territory
    if (config.playerBase) {
      const pb = config.playerBase;
      newBases.push({ x: pb.x, y: pb.y, owner: PLAYER_ID, coins: 100 });

      for (let y = pb.y; y < pb.y + BASE_SIZE; y++) {
        for (let x = pb.x; x < pb.x + BASE_SIZE; x++) {
          if (!isWall(x, y, pb.x, pb.y)) {
            grid[y][x].territory = PLAYER_ID;
          }
        }
      }
    }

    // Set up enemy base and territory
    if (config.enemyBase) {
      const eb = config.enemyBase;
      newBases.push({ x: eb.x, y: eb.y, owner: ENEMY_ID, coins: 50 });

      // Enemy territory (base + extended area)
      for (let y = eb.y - 2; y < eb.y + BASE_SIZE + 2; y++) {
        for (let x = eb.x - 2; x < eb.x + BASE_SIZE + 2; x++) {
          if (y >= 0 && y < TUTORIAL_GRID_SIZE && x >= 0 && x < TUTORIAL_GRID_SIZE) {
            if (!isWall(x, y, eb.x, eb.y)) {
              grid[y][x].territory = ENEMY_ID;
            }
          }
        }
      }
    }

    setBases(newBases);
    setCells(grid);
    setIsAnimating(false);
    setHasPlaced(false);
    setShowHint(true);
    setEnemyCoins(50);
    setShowVictory(false);
  }, []);

  // Reset state when modal opens or slide changes
  useEffect(() => {
    if (isOpen) {
      initializeSlide(currentSlide);
    }
  }, [isOpen, currentSlide, initializeSlide]);

  // Handle enemy territory being touched
  const handleEnemyTerritoryTouched = useCallback((enemyOwner: number) => {
    if (enemyOwner === ENEMY_ID) {
      setEnemyCoins(prev => {
        const newCoins = Math.max(0, prev - 1);
        if (newCoins === 0) {
          setShowVictory(true);
          setIsAnimating(false);
        }
        return newCoins;
      });
    }
  }, []);

  // Animation loop
  useEffect(() => {
    if (!isAnimating) return;

    const animate = () => {
      setCells(prev => {
        if (bases.length === 0) {
          return stepGenerationSinglePlayer(prev);
        } else {
          return stepGenerationMultiplayer(prev, bases, handleEnemyTerritoryTouched);
        }
      });

      animationRef.current = window.setTimeout(() => {
        requestAnimationFrame(animate);
      }, 200);
    };

    animate();

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [isAnimating, bases, handleEnemyTerritoryTouched]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = canvas.width / TUTORIAL_GRID_SIZE;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= TUTORIAL_GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }

    // Territory
    for (let y = 0; y < TUTORIAL_GRID_SIZE; y++) {
      for (let x = 0; x < TUTORIAL_GRID_SIZE; x++) {
        const territory = cells[y][x].territory;
        if (territory !== 0) {
          const inBase = bases.find(b => isWall(x, y, b.x, b.y));
          if (!inBase) {
            ctx.fillStyle = territory === PLAYER_ID ? PLAYER_TERRITORY_COLOR : ENEMY_TERRITORY_COLOR;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    // Base walls
    ctx.fillStyle = BASE_WALL_COLOR;
    for (const base of bases) {
      for (let y = 0; y < TUTORIAL_GRID_SIZE; y++) {
        for (let x = 0; x < TUTORIAL_GRID_SIZE; x++) {
          if (isWall(x, y, base.x, base.y)) {
            ctx.fillRect(x * cellSize + 0.5, y * cellSize + 0.5, cellSize - 1, cellSize - 1);
          }
        }
      }
    }

    // For slides without bases in state, draw from config
    if (bases.length === 0 && slideConfig.playerBase) {
      const pb = slideConfig.playerBase;
      for (let y = 0; y < TUTORIAL_GRID_SIZE; y++) {
        for (let x = 0; x < TUTORIAL_GRID_SIZE; x++) {
          if (isWall(x, y, pb.x, pb.y)) {
            ctx.fillRect(x * cellSize + 0.5, y * cellSize + 0.5, cellSize - 1, cellSize - 1);
          }
        }
      }
    }

    // Living cells
    for (let y = 0; y < TUTORIAL_GRID_SIZE; y++) {
      for (let x = 0; x < TUTORIAL_GRID_SIZE; x++) {
        if (cells[y][x].alive) {
          ctx.fillStyle = cells[y][x].owner === PLAYER_ID ? PLAYER_COLOR : ENEMY_COLOR;
          const padding = 1;
          ctx.fillRect(
            x * cellSize + padding,
            y * cellSize + padding,
            cellSize - padding * 2,
            cellSize - padding * 2
          );
        }
      }
    }

    // Hint pulse
    if (showHint && !hasPlaced && currentSlideData?.implemented) {
      const pulseAlpha = 0.3 + 0.2 * Math.sin(Date.now() / 300);
      ctx.fillStyle = `rgba(57, 255, 20, ${pulseAlpha})`;

      const hintBase = slideConfig.playerBase;
      if (hintBase) {
        for (let y = hintBase.y + 1; y < hintBase.y + BASE_SIZE - 1; y++) {
          for (let x = hintBase.x + 1; x < hintBase.x + BASE_SIZE - 1; x++) {
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    // Coin counter for enemy base
    if (bases.length >= 2) {
      ctx.font = 'bold 10px monospace';
      const enemyBase = bases[1];
      const enemyCenterX = (enemyBase.x + BASE_SIZE / 2) * cellSize;
      const enemyCenterY = (enemyBase.y + BASE_SIZE / 2) * cellSize;

      ctx.fillStyle = enemyCoins <= 10 ? '#FF4444' : '#FFD700';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${enemyCoins}`, enemyCenterX, enemyCenterY);
    }

    // "Coming Soon" overlay for unimplemented slides
    if (!currentSlideData?.implemented) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Coming Soon', canvas.width / 2, canvas.height / 2);
    }
  }, [cells, hasPlaced, showHint, bases, enemyCoins, currentSlideData, slideConfig]);

  // Hint pulse animation
  useEffect(() => {
    if (!showHint || hasPlaced || !currentSlideData?.implemented) return;
    const interval = setInterval(() => {
      setCells(prev => prev.map(row => row.map(cell => ({ ...cell }))));
    }, 50);
    return () => clearInterval(interval);
  }, [showHint, hasPlaced, currentSlideData?.implemented]);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || hasPlaced || !currentSlideData?.implemented) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellSize = canvas.width / TUTORIAL_GRID_SIZE;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);

    const targetBase = slideConfig.playerBase;
    if (!targetBase) return;

    if (isInterior(cellX, cellY, targetBase.x, targetBase.y)) {
      setCells(prev => {
        const next = prev.map(row => row.map(cell => ({ ...cell })));

        // Use glider that moves toward enemy (if enemy exists) or down-right
        const pattern = slideConfig.enemyBase ? GLIDER_UP_LEFT : GLIDER_DOWN_RIGHT;

        for (const [dx, dy] of pattern) {
          const px = cellX + dx;
          const py = cellY + dy;
          if (px >= 0 && px < TUTORIAL_GRID_SIZE && py >= 0 && py < TUTORIAL_GRID_SIZE) {
            next[py][px].alive = true;
            next[py][px].owner = PLAYER_ID;
            next[py][px].territory = PLAYER_ID;
          }
        }
        return next;
      });
      setHasPlaced(true);
      setShowHint(false);

      setTimeout(() => {
        setIsAnimating(true);
      }, 500);
    }
  }, [hasPlaced, currentSlideData?.implemented, slideConfig]);

  // Reset handler
  const handleReset = useCallback(() => {
    initializeSlide(currentSlide);
  }, [currentSlide, initializeSlide]);

  // Slide change handler
  const handleSlideChange = useCallback((newSlide: number) => {
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    setCurrentSlide(newSlide);
  }, []);

  if (!isOpen) return null;

  const hasEnemyBase = !!slideConfig.enemyBase;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-green-500/30 rounded-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">How to Play Risk</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-green-400 mb-2">
            {currentSlide + 1}. {currentSlideData?.title}
            {!currentSlideData?.implemented && (
              <span className="ml-2 text-xs text-gray-500 font-normal">(Coming Soon)</span>
            )}
          </h3>
          <p className="text-gray-400 mb-4">
            {currentSlideData?.description}
          </p>

          <div className="flex flex-col items-center">
            {/* Coin display for slides with enemy */}
            {hasEnemyBase && currentSlideData?.implemented && (
              <div className="flex justify-between w-full mb-3 px-4">
                <div className="text-green-400 text-sm">
                  <span className="text-gray-500">You:</span> Base
                </div>
                <div className={`text-sm ${enemyCoins <= 10 ? 'text-red-400 animate-pulse' : 'text-red-400'}`}>
                  <span className="text-gray-500">Enemy:</span> {enemyCoins} coins
                </div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              width={288}
              height={288}
              onClick={handleCanvasClick}
              className={`rounded-lg border border-gray-700 ${!hasPlaced && currentSlideData?.implemented ? 'cursor-pointer' : ''}`}
              style={{ imageRendering: 'pixelated' }}
            />

            {/* Status text */}
            <div className="mt-4 text-center">
              {currentSlideData?.implemented && (
                <>
                  {!hasPlaced && (
                    <p className="text-green-400 animate-pulse">
                      {hasEnemyBase
                        ? 'Click inside YOUR base (bottom-left) to attack!'
                        : 'Click inside the base to spawn a Glider'}
                    </p>
                  )}
                  {hasPlaced && isAnimating && !hasEnemyBase && (
                    <p className="text-blue-400">
                      Watch the glider claim territory as it moves!
                    </p>
                  )}
                  {hasPlaced && isAnimating && hasEnemyBase && !showVictory && (
                    <p className="text-blue-400">
                      Your cells are draining enemy coins!
                    </p>
                  )}
                  {showVictory && (
                    <p className="text-yellow-400 font-bold animate-bounce">
                      Enemy base destroyed! You win!
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Reset button */}
            {hasPlaced && currentSlideData?.implemented && (
              <button
                onClick={handleReset}
                className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        </div>

        {/* Footer navigation */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-800 bg-black/30">
          <div className="text-gray-500 text-sm">
            Slide {currentSlide + 1} of {TUTORIAL_SLIDES.length}
          </div>
          <div className="flex gap-3">
            {currentSlide > 0 && (
              <button
                onClick={() => handleSlideChange(currentSlide - 1)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Previous
              </button>
            )}
            {currentSlide < TUTORIAL_SLIDES.length - 1 ? (
              <button
                onClick={() => handleSlideChange(currentSlide + 1)}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
              >
                Got it!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
