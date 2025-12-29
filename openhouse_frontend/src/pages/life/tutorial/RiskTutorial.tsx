import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BASE_SIZE } from '../../lifeConstants';
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
  GLIDER_UP_RIGHT,
  BLOCK_PATTERN,
  createEmptyGrid,
  isInBase,
} from './types';
import { stepGenerationSinglePlayer, stepGenerationMultiplayer, checkTerritoryConnectivity, applyTerritoryCutoff, applyWiper } from './simulation';
import { TUTORIAL_SLIDES } from './slides';
import { drawProceduralTerritory, PLAYER_ELEMENT, ENEMY_ELEMENT, getElementConfigForRegion } from './proceduralTexture';

// Helper to convert hex color to rgba with custom alpha
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(100, 100, 100, ${alpha})`;
}

interface RiskTutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

// Animation types for visual effects
interface FloatingNumber {
  id: number;
  x: number;
  y: number;
  value: number;
  startTime: number;
}

interface FlyingCoin {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTime: number;
}

interface TerritoryFlash {
  id: number;
  x: number;
  y: number;
  startTime: number;
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
    playerBase: { x: 8, y: 8 },  // Center of grid for encirclement demo
  },
  'attack-strategy': {
    playerBase: { x: 2, y: 14 },
    enemyBase: { x: 14, y: 2 },
  },
  'wipers': {
    playerBase: { x: 2, y: 14 },  // Bottom-left quadrant (safe during demo)
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
  const textureTimeRef = useRef<number>(0);
  const textureAnimRef = useRef<number>(0);
  const [renderTick, setRenderTick] = useState(0);
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

  // Polish: spawn animation and stats tracking
  const [spawnAnimation, setSpawnAnimation] = useState<{ x: number; y: number; frame: number } | null>(null);
  const [territoryCount, setTerritoryCount] = useState(0);
  const [cellCount, setCellCount] = useState(0);

  // Visual effect animations
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([]);
  const [flyingCoins, setFlyingCoins] = useState<FlyingCoin[]>([]);
  const [territoryFlashes, setTerritoryFlashes] = useState<TerritoryFlash[]>([]);
  const [showAttackArrow, setShowAttackArrow] = useState(false);
  const nextAnimationId = useRef(0);

  // Territory cutoff state (slide 3)
  const [cutoffTriggered, setCutoffTriggered] = useState(false);
  const [fadingTerritory, setFadingTerritory] = useState<{ x: number; y: number }[]>([]);
  const [fadeStartTime, setFadeStartTime] = useState<number | null>(null);
  const [territoryLostCount, setTerritoryLostCount] = useState(0);
  const [initialTerritoryCount, setInitialTerritoryCount] = useState(0);

  // Wiper state (slide 5)
  const [wiperCountdown, setWiperCountdown] = useState(5);
  const [targetQuadrant, setTargetQuadrant] = useState(1); // 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
  const [wiperPhase, setWiperPhase] = useState<'countdown' | 'wiping' | 'aftermath'>('countdown');
  const [wipeFlashTime, setWipeFlashTime] = useState<number | null>(null);
  const [wiperCycleCount, setWiperCycleCount] = useState(0);
  const wiperTimerRef = useRef<number>(0);

  // Coin economy slide state (slide 6)
  const [walletCoins, setWalletCoins] = useState(50);
  const [baseCoins, setBaseCoins] = useState(25);
  const [economyPhase, setEconomyPhase] = useState<'earning' | 'spending' | 'faucet' | 'free'>('earning');
  const [displayedWallet, setDisplayedWallet] = useState(50);
  const [displayedBase, setDisplayedBase] = useState(25);
  const [walletFlash, setWalletFlash] = useState<'gain' | 'lose' | null>(null);
  const [baseFlash, setBaseFlash] = useState<'gain' | 'lose' | null>(null);
  const [coinTransferActive, setCoinTransferActive] = useState(false);
  const [economyTerritoryCount, setEconomyTerritoryCount] = useState(36);
  const [economyPlacementCount, setEconomyPlacementCount] = useState(0);
  const incomeIntervalRef = useRef<number>(0);

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
          grid[y][x].territory = PLAYER_ID;
        }
      }
    }

    // Set up enemy base and territory
    if (config.enemyBase) {
      const eb = config.enemyBase;
      // Use 30 coins for attack-strategy slide (faster demo)
      const enemyStartingCoins = slide.id === 'attack-strategy' ? 30 : 50;
      newBases.push({ x: eb.x, y: eb.y, owner: ENEMY_ID, coins: enemyStartingCoins });

      // Enemy territory (base + extended area)
      for (let y = eb.y - 2; y < eb.y + BASE_SIZE + 2; y++) {
        for (let x = eb.x - 2; x < eb.x + BASE_SIZE + 2; x++) {
          if (y >= 0 && y < TUTORIAL_GRID_SIZE && x >= 0 && x < TUTORIAL_GRID_SIZE) {
            grid[y][x].territory = ENEMY_ID;
          }
        }
      }
    }

    // Determine starting coins based on slide
    const startingEnemyCoins = slide.id === 'attack-strategy' ? 30 : 50;

    setBases(newBases);
    setCells(grid);
    setIsAnimating(false);
    setHasPlaced(false);
    setShowHint(true);
    setEnemyCoins(startingEnemyCoins);
    setShowVictory(false);
    setSpawnAnimation(null);
    setTerritoryCount(0);
    setCellCount(0);
    setFloatingNumbers([]);
    setFlyingCoins([]);
    setTerritoryFlashes([]);
    setShowAttackArrow(false);

    // Reset wiper state
    setWiperCountdown(5);
    setTargetQuadrant(1); // Top-right quadrant will be wiped
    setWiperPhase('countdown');
    setWipeFlashTime(null);
    setWiperCycleCount(0);
    if (wiperTimerRef.current) {
      clearInterval(wiperTimerRef.current);
    }

    // Reset coin economy state
    setWalletCoins(50);
    setBaseCoins(25);
    setEconomyPhase('earning');
    setDisplayedWallet(50);
    setDisplayedBase(25);
    setWalletFlash(null);
    setBaseFlash(null);
    setCoinTransferActive(false);
    setEconomyTerritoryCount(36);
    setEconomyPlacementCount(0);
    if (incomeIntervalRef.current) {
      clearInterval(incomeIntervalRef.current);
    }

    // Reset cutoff state
    setCutoffTriggered(false);
    setFadingTerritory([]);
    setFadeStartTime(null);
    setTerritoryLostCount(0);
    setInitialTerritoryCount(0);

    // Special setup for territory-cutoff slide
    // Demonstrates: Enemy glider cuts across player's territory corridor, disconnecting the far end
    if (slide.id === 'territory-cutoff') {
      const pb = config.playerBase;
      if (pb) {
        // Create a corridor of territory from base going up
        // Base at (8, 8), corridor goes up toward y=0
        const corridorCenterX = pb.x + BASE_SIZE / 2;  // Center of base = 12

        // Wide corridor (5 cells wide) going up from base
        for (let y = 2; y < pb.y; y++) {
          for (let x = corridorCenterX - 2; x <= corridorCenterX + 2; x++) {
            if (x >= 0 && x < TUTORIAL_GRID_SIZE && y >= 0 && y < TUTORIAL_GRID_SIZE) {
              grid[y][x].territory = PLAYER_ID;
            }
          }
        }

        // Wider area at the top (the part that will be cut off)
        for (let y = 2; y < 6; y++) {
          for (let x = corridorCenterX - 5; x <= corridorCenterX + 5; x++) {
            if (x >= 0 && x < TUTORIAL_GRID_SIZE && y >= 0 && y < TUTORIAL_GRID_SIZE) {
              grid[y][x].territory = PLAYER_ID;
            }
          }
        }

        // Enemy glider moving RIGHT across the corridor
        // Position it to cut through the corridor around y=7 (just above base)
        // Glider moving down-right pattern
        const enemyGliderDownRight: [number, number][] = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
        const gliderStartX = 2;  // Start from left side
        const gliderY = 6;  // Will cut through the corridor as it moves right

        for (const [dx, dy] of enemyGliderDownRight) {
          const gx = gliderStartX + dx;
          const gy = gliderY + dy;
          if (gx >= 0 && gx < TUTORIAL_GRID_SIZE && gy >= 0 && gy < TUTORIAL_GRID_SIZE) {
            grid[gy][gx].alive = true;
            grid[gy][gx].owner = ENEMY_ID;
          }
        }

        // Count initial territory
        let initTerritory = 0;
        for (let y = 0; y < TUTORIAL_GRID_SIZE; y++) {
          for (let x = 0; x < TUTORIAL_GRID_SIZE; x++) {
            if (grid[y][x].territory === PLAYER_ID) initTerritory++;
          }
        }
        setInitialTerritoryCount(initTerritory);
        setTerritoryCount(initTerritory);
      }

      setCells(grid);
      setBases(newBases);
      setHasPlaced(true);
      setShowHint(false);
      setTimeout(() => setIsAnimating(true), 500);
      return;
    }

    // Special setup for wipers slide
    if (slide.id === 'wipers') {
      // Place some cells in the danger zone (top-right quadrant)
      const quadrantSize = TUTORIAL_GRID_SIZE / 2; // 12 cells per quadrant
      // Scatter some player cells in top-right quadrant (will be wiped)
      const dangerCells: [number, number][] = [
        [14, 3], [15, 3], [14, 4], [15, 4],  // Block pattern
        [18, 6], [19, 7], [17, 8], [18, 8], [19, 8],  // Glider
      ];
      for (const [x, y] of dangerCells) {
        if (x < TUTORIAL_GRID_SIZE && y < TUTORIAL_GRID_SIZE) {
          grid[y][x].alive = true;
          grid[y][x].owner = PLAYER_ID;
          grid[y][x].territory = PLAYER_ID;
        }
      }

      // Place cells inside base (will survive the wipe)
      const pb = config.playerBase;
      if (pb) {
        // Place a block inside the base
        grid[pb.y + 3][pb.x + 3].alive = true;
        grid[pb.y + 3][pb.x + 3].owner = PLAYER_ID;
        grid[pb.y + 3][pb.x + 4].alive = true;
        grid[pb.y + 3][pb.x + 4].owner = PLAYER_ID;
        grid[pb.y + 4][pb.x + 3].alive = true;
        grid[pb.y + 4][pb.x + 3].owner = PLAYER_ID;
        grid[pb.y + 4][pb.x + 4].alive = true;
        grid[pb.y + 4][pb.x + 4].owner = PLAYER_ID;
      }

      // Update grid state
      setCells(grid);
      setBases(newBases);
      setHasPlaced(true);
      setShowHint(false);
      return;
    }

    // Special setup for coins-economy slide
    if (slide.id === 'coins-economy') {
      const pb = config.playerBase;
      if (pb) {
        for (let y = pb.y - 2; y < pb.y + BASE_SIZE + 2; y++) {
          for (let x = pb.x - 2; x < pb.x + BASE_SIZE + 2; x++) {
            if (y >= 0 && y < TUTORIAL_GRID_SIZE && x >= 0 && x < TUTORIAL_GRID_SIZE) {
              grid[y][x].territory = PLAYER_ID;
            }
          }
        }
      }
      let initialTerritory = 0;
      for (let y = 0; y < TUTORIAL_GRID_SIZE; y++) {
        for (let x = 0; x < TUTORIAL_GRID_SIZE; x++) {
          if (grid[y][x].territory === PLAYER_ID) initialTerritory++;
        }
      }
      setEconomyTerritoryCount(initialTerritory);
      setCells(grid);
      setBases(newBases);
      setShowHint(false);
      return;
    }
  }, []);

  // Reset state when modal opens or slide changes
  useEffect(() => {
    if (isOpen) {
      initializeSlide(currentSlide);
    }
  }, [isOpen, currentSlide, initializeSlide]);

  // Handle enemy territory being touched - triggers visual effects
  const handleEnemyTerritoryTouched = useCallback((enemyOwner: number, x: number, y: number) => {
    if (enemyOwner === ENEMY_ID) {
      const now = Date.now();
      const id = nextAnimationId.current++;

      // Add floating damage number at the touch location
      setFloatingNumbers(prev => [...prev, { id, x, y, value: -1, startTime: now }]);

      // Add territory flash effect (contact highlight)
      setTerritoryFlashes(prev => [...prev, { id, x, y, startTime: now }]);

      // Add flying coin animation from enemy base
      const config = SLIDE_CONFIGS[currentSlideData?.id] || {};
      if (config.enemyBase) {
        const eb = config.enemyBase;
        const coinId = nextAnimationId.current++;
        setFlyingCoins(prev => [...prev, {
          id: coinId,
          startX: eb.x + BASE_SIZE / 2,
          startY: eb.y + BASE_SIZE / 2,
          endX: x,
          endY: y - 2,
          startTime: now,
        }]);
      }

      setEnemyCoins(prev => {
        const newCoins = Math.max(0, prev - 1);
        if (newCoins === 0) {
          setShowVictory(true);
          setIsAnimating(false);
        }
        return newCoins;
      });
    }
  }, [currentSlideData?.id]);

  // Animation loop
  useEffect(() => {
    if (!isAnimating) return;

    const animate = () => {
      setCells(prev => {
        let nextCells: TutorialCell[][];
        if (bases.length === 0) {
          nextCells = stepGenerationSinglePlayer(prev);
        } else {
          nextCells = stepGenerationMultiplayer(prev, bases, handleEnemyTerritoryTouched);
        }

        // Territory cutoff check for slide 3
        if (currentSlideData?.id === 'territory-cutoff' && !cutoffTriggered) {
          const pb = slideConfig.playerBase;
          if (pb) {
            const disconnected = checkTerritoryConnectivity(nextCells, pb.x, pb.y, PLAYER_ID);
            if (disconnected.length > 0) {
              setCutoffTriggered(true);
              setFadingTerritory(disconnected);
              setFadeStartTime(Date.now());
              setTerritoryLostCount(disconnected.length);
              setTimeout(() => {
                setCells(current => applyTerritoryCutoff(current, disconnected));
                setFadingTerritory([]);
              }, 600);
            }
          }
        }

        // Track stats for educational display
        let cellsCount = 0;
        let territory = 0;
        for (let y = 0; y < TUTORIAL_GRID_SIZE; y++) {
          for (let x = 0; x < TUTORIAL_GRID_SIZE; x++) {
            if (nextCells[y][x].alive && nextCells[y][x].owner === PLAYER_ID) cellsCount++;
            if (nextCells[y][x].territory === PLAYER_ID) territory++;
          }
        }
        setCellCount(cellsCount);
        setTerritoryCount(territory);

        return nextCells;
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
  }, [isAnimating, bases, handleEnemyTerritoryTouched, currentSlideData?.id, cutoffTriggered, slideConfig.playerBase]);

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

    // Create set of fading coordinates for quick lookup
    const fadingSet = new Set(fadingTerritory.map(c => `${c.x},${c.y}`));
    const fadeProgress = fadeStartTime ? Math.min(1, (Date.now() - fadeStartTime) / 500) : 0;

    // Territory - draw with procedural textures (skip fading cells)
    drawProceduralTerritory(
      ctx,
      cells,
      cellSize,
      textureTimeRef.current,
      PLAYER_ELEMENT,
      ENEMY_ELEMENT,
      PLAYER_ID,
      ENEMY_ID,
      fadingSet.size > 0 ? fadingSet : undefined
    );

    // Draw fading cells with special effect (territory being cut off)
    if (fadingSet.size > 0) {
      for (const coord of fadingSet) {
        const [xStr, yStr] = coord.split(',');
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        if (fadeProgress < 0.3) {
          // Flash red
          ctx.fillStyle = `rgba(255, 100, 100, ${0.3 * (1 - fadeProgress / 0.3)})`;
        } else {
          // Fade to transparent
          const alpha = 0.15 * (1 - (fadeProgress - 0.3) / 0.7);
          ctx.fillStyle = hexToRgba(PLAYER_COLOR, alpha);
        }
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
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
    // For attack-strategy slide, show hint near enemy walls (where to place block)
    const isAttackStrategySlide = currentSlideData?.id === 'attack-strategy';
    if (showHint && !hasPlaced && currentSlideData?.implemented) {
      const pulseAlpha = 0.3 + 0.2 * Math.sin(Date.now() / 300);
      ctx.fillStyle = hexToRgba(PLAYER_COLOR, pulseAlpha);

      if (isAttackStrategySlide && slideConfig.enemyBase) {
        // For attack-strategy, highlight 2x2 area just below enemy base wall
        const eb = slideConfig.enemyBase;
        const hintX = eb.x + 2;
        const hintY = eb.y + BASE_SIZE; // Just below enemy base
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            ctx.fillRect((hintX + dx) * cellSize, (hintY + dy) * cellSize, cellSize, cellSize);
          }
        }
      } else {
        // Default: highlight inside player base
        const hintBase = slideConfig.playerBase;
        if (hintBase) {
          for (let y = hintBase.y + 1; y < hintBase.y + BASE_SIZE - 1; y++) {
            for (let x = hintBase.x + 1; x < hintBase.x + BASE_SIZE - 1; x++) {
              ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
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

    // "YOU" label for player base (Slide 1 polish)
    if (slideConfig.playerBase && currentSlideData?.implemented) {
      const pb = slideConfig.playerBase;
      const baseCenterX = (pb.x + BASE_SIZE / 2) * cellSize;
      const labelY = pb.y * cellSize - 6;

      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = PLAYER_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('YOU', baseCenterX, labelY);
    }

    // "ENEMY" label for enemy base
    if (slideConfig.enemyBase && currentSlideData?.implemented) {
      const eb = slideConfig.enemyBase;
      const baseCenterX = (eb.x + BASE_SIZE / 2) * cellSize;
      const labelY = eb.y * cellSize - 6;

      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = ENEMY_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('ENEMY', baseCenterX, labelY);
    }

    // Territory flash effects (contact highlight)
    const now = Date.now();
    for (const flash of territoryFlashes) {
      const elapsed = now - flash.startTime;
      if (elapsed < 300) {
        const progress = elapsed / 300;
        const alpha = 0.8 * (1 - progress);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(flash.x * cellSize, flash.y * cellSize, cellSize, cellSize);
      }
    }

    // Flying coin animations
    for (const coin of flyingCoins) {
      const elapsed = now - coin.startTime;
      if (elapsed < 400) {
        const progress = elapsed / 400;
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        const currentX = coin.startX + (coin.endX - coin.startX) * easeProgress;
        const currentY = coin.startY + (coin.endY - coin.startY) * easeProgress;

        const alpha = 1 - progress;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u00A4', currentX * cellSize, currentY * cellSize);
      }
    }

    // Floating damage numbers
    for (const num of floatingNumbers) {
      const elapsed = now - num.startTime;
      if (elapsed < 800) {
        const progress = elapsed / 800;
        const floatY = num.y - progress * 2;
        const alpha = 1 - progress;

        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = `rgba(255, 68, 68, ${alpha})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${num.value}`, num.x * cellSize + cellSize / 2, floatY * cellSize);
      }
    }

    // Spawn animation glow effect
    if (spawnAnimation) {
      const elapsed = Date.now() - spawnAnimation.frame;
      if (elapsed < 500) {
        const progress = elapsed / 500;
        const alpha = 0.6 * (1 - progress);
        const radius = 20 + progress * 30;

        const centerX = spawnAnimation.x * cellSize + cellSize / 2;
        const centerY = spawnAnimation.y * cellSize + cellSize / 2;

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, hexToRgba(PLAYER_COLOR, alpha));
        gradient.addColorStop(1, hexToRgba(PLAYER_COLOR, 0));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // "DISCONNECTED" label for territory-cutoff slide during fade
    if (currentSlideData?.id === 'territory-cutoff' && fadingTerritory.length > 0) {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#FF6666';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DISCONNECTED!', canvas.width / 2, 20);
    }

    // Direction arrow for glider movement (when animating)
    if (hasPlaced && isAnimating && !slideConfig.enemyBase && currentSlideData?.id === 'place-cells') {
      // Draw a small arrow indicating down-right movement
      ctx.strokeStyle = hexToRgba(PLAYER_COLOR, 0.7);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      // Arrow position (bottom right of canvas)
      const arrowX = canvas.width - 35;
      const arrowY = canvas.height - 35;
      const arrowLen = 20;

      // Draw arrow line (diagonal down-right)
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX + arrowLen, arrowY + arrowLen);
      ctx.stroke();

      // Draw arrowhead
      ctx.beginPath();
      ctx.moveTo(arrowX + arrowLen, arrowY + arrowLen);
      ctx.lineTo(arrowX + arrowLen - 6, arrowY + arrowLen - 2);
      ctx.moveTo(arrowX + arrowLen, arrowY + arrowLen);
      ctx.lineTo(arrowX + arrowLen - 2, arrowY + arrowLen - 6);
      ctx.stroke();
    }

    // Wipers slide: Draw quadrant overlay and warning effects
    if (currentSlideData?.id === 'wipers') {
      const quadrantSize = canvas.width / 2;
      
      // Draw quadrant grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(quadrantSize, 0);
      ctx.lineTo(quadrantSize, canvas.height);
      ctx.moveTo(0, quadrantSize);
      ctx.lineTo(canvas.width, quadrantSize);
      ctx.stroke();

      // Draw quadrant numbers
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const quadrantLabels = ['0', '1', '2', '3'];
      const labelPositions = [
        [quadrantSize / 2, quadrantSize / 2],           // Top-left
        [quadrantSize * 1.5, quadrantSize / 2],         // Top-right
        [quadrantSize / 2, quadrantSize * 1.5],         // Bottom-left
        [quadrantSize * 1.5, quadrantSize * 1.5],       // Bottom-right
      ];
      
      for (let i = 0; i < 4; i++) {
        const isTarget = i === targetQuadrant;
        if (!isTarget) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fillText(quadrantLabels[i], labelPositions[i][0], labelPositions[i][1]);
        }
      }

      // Highlight target quadrant with pulsing warning
      const qx = targetQuadrant % 2;
      const qy = Math.floor(targetQuadrant / 2);
      const quadX = qx * quadrantSize;
      const quadY = qy * quadrantSize;

      if (wiperPhase === 'countdown') {
        // Warning colors based on countdown
        let warningColor = 'rgba(255, 255, 0, ';  // Yellow
        if (wiperCountdown <= 2) warningColor = 'rgba(255, 165, 0, ';  // Orange
        if (wiperCountdown <= 1) warningColor = 'rgba(255, 0, 0, ';    // Red

        const pulseAlpha = 0.2 + 0.15 * Math.sin(Date.now() / 150);
        
        // Fill quadrant with warning color
        ctx.fillStyle = warningColor + pulseAlpha + ')';
        ctx.fillRect(quadX, quadY, quadrantSize, quadrantSize);

        // Draw border
        ctx.strokeStyle = warningColor + '0.8)';
        ctx.lineWidth = 3;
        ctx.strokeRect(quadX + 1, quadY + 1, quadrantSize - 2, quadrantSize - 2);

        // Draw countdown text
        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = warningColor + '1)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wiperCountdown.toString(), quadX + quadrantSize / 2, quadY + quadrantSize / 2);
      } else if (wiperPhase === 'wiping' && wipeFlashTime) {
        // Wipe flash animation
        const elapsed = Date.now() - wipeFlashTime;
        const progress = Math.min(elapsed / 800, 1);
        
        // Red flash that fades out
        const flashAlpha = 0.8 * (1 - progress);
        ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
        ctx.fillRect(quadX, quadY, quadrantSize, quadrantSize);

        // Sweep effect
        if (progress < 0.5) {
          const sweepWidth = quadrantSize * (progress * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fillRect(quadX, quadY, sweepWidth, quadrantSize);
        }

        // WIPE! text
        if (progress < 0.6) {
          ctx.font = 'bold 20px sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('WIPE!', quadX + quadrantSize / 2, quadY + quadrantSize / 2);
        }
      } else if (wiperPhase === 'aftermath') {
        // Show "Cleared" briefly
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CLEARED', quadX + quadrantSize / 2, quadY + quadrantSize / 2);
      }

      // "SAFE" indicator for base quadrant
      const baseQuadrant = 2; // Bottom-left where player base is
      if (baseQuadrant !== targetQuadrant) {
        const bqx = baseQuadrant % 2;
        const bqy = Math.floor(baseQuadrant / 2);
        const baseQuadX = bqx * quadrantSize;
        const baseQuadY = bqy * quadrantSize;
        
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = hexToRgba(PLAYER_COLOR, 0.6);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('SAFE', baseQuadX + 4, baseQuadY + 4);
      }
    }

    // Attack direction arrow for attack-territory slide (diagonal up-left toward enemy)
    if (hasPlaced && isAnimating && slideConfig.enemyBase && currentSlideData?.id === 'attack-territory') {
      ctx.strokeStyle = hexToRgba(PLAYER_COLOR, 0.7);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      // Arrow from player base toward enemy base
      const arrowX = 35;
      const arrowY = canvas.height - 35;
      const arrowLen = 20;

      // Draw arrow line (diagonal up-left)
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - arrowLen / 2, arrowY - arrowLen);
      ctx.stroke();

      // Draw arrowhead
      ctx.beginPath();
      ctx.moveTo(arrowX - arrowLen / 2, arrowY - arrowLen);
      ctx.lineTo(arrowX - arrowLen / 2 + 5, arrowY - arrowLen + 4);
      ctx.moveTo(arrowX - arrowLen / 2, arrowY - arrowLen);
      ctx.lineTo(arrowX - arrowLen / 2 + 6, arrowY - arrowLen - 1);
      ctx.stroke();
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
  }, [cells, hasPlaced, showHint, bases, enemyCoins, currentSlideData, slideConfig, spawnAnimation, isAnimating, floatingNumbers, flyingCoins, territoryFlashes, wiperCountdown, targetQuadrant, wiperPhase, wipeFlashTime, fadingTerritory, fadeStartTime, renderTick]);

  // Animation cleanup effect - remove expired animations
  useEffect(() => {
    if (floatingNumbers.length === 0 && flyingCoins.length === 0 && territoryFlashes.length === 0) return;

    const cleanup = () => {
      const now = Date.now();
      setFloatingNumbers(prev => prev.filter(n => now - n.startTime < 800));
      setFlyingCoins(prev => prev.filter(c => now - c.startTime < 400));
      setTerritoryFlashes(prev => prev.filter(f => now - f.startTime < 300));
    };

    const timer = setInterval(cleanup, 100);
    return () => clearInterval(timer);
  }, [floatingNumbers.length, flyingCoins.length, territoryFlashes.length]);

  // Re-render during visual effects animations
  useEffect(() => {
    if (floatingNumbers.length === 0 && flyingCoins.length === 0 && territoryFlashes.length === 0) return;

    const timer = setInterval(() => {
      setCells(prev => prev.map(row => row.map(cell => ({ ...cell }))));
    }, 30);
    return () => clearInterval(timer);
  }, [floatingNumbers.length, flyingCoins.length, territoryFlashes.length]);

  // Hint pulse animation
  useEffect(() => {
    if (!showHint || hasPlaced || !currentSlideData?.implemented) return;
    const interval = setInterval(() => {
      setCells(prev => prev.map(row => row.map(cell => ({ ...cell }))));
    }, 50);
    return () => clearInterval(interval);
  }, [showHint, hasPlaced, currentSlideData?.implemented]);

  // Fade animation timer - re-render while fading is active
  useEffect(() => {
    if (fadingTerritory.length === 0 || !fadeStartTime) return;
    const elapsed = Date.now() - fadeStartTime;
    if (elapsed >= 600) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - fadeStartTime < 600) {
        setCells(prev => prev.map(row => row.map(cell => ({ ...cell }))));
      }
    }, 30);
    return () => clearInterval(timer);
  }, [fadingTerritory, fadeStartTime]);

  // Spawn animation timer - re-render while glow is active
  useEffect(() => {
    if (!spawnAnimation) return;
    const elapsed = Date.now() - spawnAnimation.frame;
    if (elapsed >= 500) {
      setSpawnAnimation(null);
      return;
    }
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - spawnAnimation.frame >= 500) {
        setSpawnAnimation(null);
      } else {
        // Force re-render by updating cells reference
        setCells(prev => prev.map(row => row.map(cell => ({ ...cell }))));
      }
    }, 30);
    return () => clearInterval(timer);
  }, [spawnAnimation]);

  // Procedural texture animation loop - continuous update for smooth visuals
  useEffect(() => {
    if (!isOpen) return;

    let lastTime = performance.now();
    let frameCount = 0;

    const animateTextures = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      textureTimeRef.current += deltaTime;
      frameCount++;

      // Trigger re-render every 2 frames (~30fps) to balance smoothness and performance
      if (frameCount % 2 === 0) {
        setRenderTick(prev => prev + 1);
      }

      textureAnimRef.current = requestAnimationFrame(animateTextures);
    };

    textureAnimRef.current = requestAnimationFrame(animateTextures);

    return () => {
      if (textureAnimRef.current) {
        cancelAnimationFrame(textureAnimRef.current);
      }
    };
  }, [isOpen]);

  // Coin economy: Passive income from territory
  useEffect(() => {
    if (currentSlideData?.id !== 'coins-economy') return;
    
    incomeIntervalRef.current = window.setInterval(() => {
      // Generate income based on territory (1 coin per 10 territory per second, accelerated for demo)
      const income = Math.max(1, Math.floor(economyTerritoryCount / 10));
      setWalletCoins(prev => prev + income);
      setWalletFlash('gain');
      setTimeout(() => setWalletFlash(null), 300);
    }, 1000);
    
    return () => {
      if (incomeIntervalRef.current) {
        clearInterval(incomeIntervalRef.current);
      }
    };
  }, [currentSlideData?.id, economyTerritoryCount]);

  // Smooth counter animation
  useEffect(() => {
    if (displayedWallet !== walletCoins) {
      const diff = walletCoins - displayedWallet;
      const step = diff > 0 ? Math.max(1, Math.ceil(diff / 10)) : Math.min(-1, Math.floor(diff / 10));
      const timer = setTimeout(() => {
        setDisplayedWallet(prev => {
          const next = prev + step;
          return diff > 0 ? Math.min(next, walletCoins) : Math.max(next, walletCoins);
        });
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [walletCoins, displayedWallet]);

  useEffect(() => {
    if (displayedBase !== baseCoins) {
      const diff = baseCoins - displayedBase;
      const step = diff > 0 ? Math.max(1, Math.ceil(diff / 10)) : Math.min(-1, Math.floor(diff / 10));
      const timer = setTimeout(() => {
        setDisplayedBase(prev => {
          const next = prev + step;
          return diff > 0 ? Math.min(next, baseCoins) : Math.max(next, baseCoins);
        });
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [baseCoins, displayedBase]);

  // Faucet handler
  const handleFaucet = useCallback(() => {
    setWalletCoins(prev => prev + 1000);
    setWalletFlash('gain');
    setTimeout(() => setWalletFlash(null), 300);
    
    // Move to free phase after using faucet
    if (economyPhase === 'faucet') {
      setEconomyPhase('free');
    }
  }, [economyPhase]);


  // Wiper countdown timer (slide 5)
  useEffect(() => {
    if (currentSlideData?.id !== 'wipers' || !isOpen) return;

    const quadrantSize = TUTORIAL_GRID_SIZE / 2;

    const timer = setInterval(() => {
      setWiperCountdown(prev => {
        if (prev <= 1) {
          // Trigger wipe!
          setWiperPhase('wiping');
          setWipeFlashTime(Date.now());

          // Apply wiper to target quadrant
          const qx = targetQuadrant % 2; // 0 or 1
          const qy = Math.floor(targetQuadrant / 2); // 0 or 1
          const startX = qx * quadrantSize;
          const startY = qy * quadrantSize;

          setCells(prevCells => {
            // Apply wiper but protect cells inside bases
            let wiped = applyWiper(prevCells, startX, startY, quadrantSize, quadrantSize);

            // Restore cells inside player base (walls protect)
            const pb = slideConfig.playerBase;
            if (pb) {
              for (let y = pb.y + 1; y < pb.y + BASE_SIZE - 1; y++) {
                for (let x = pb.x + 1; x < pb.x + BASE_SIZE - 1; x++) {
                  if (prevCells[y] && prevCells[y][x]) {
                    wiped[y][x] = { ...prevCells[y][x] };
                  }
                }
              }
            }

            return wiped;
          });

          // After wipe animation, move to aftermath
          setTimeout(() => {
            setWiperPhase('aftermath');

            // After showing aftermath, rotate to next quadrant and restart
            setTimeout(() => {
              setWiperCycleCount(c => c + 1);
              setTargetQuadrant(q => (q + 1) % 4);
              setWiperPhase('countdown');
            }, 2000);
          }, 800);

          return 5; // Reset countdown
        }
        return prev - 1;
      });
    }, 1000);

    wiperTimerRef.current = timer;
    return () => clearInterval(timer);
  }, [currentSlideData?.id, isOpen, targetQuadrant, slideConfig.playerBase]);

  // Wiper flash animation timer
  useEffect(() => {
    if (!wipeFlashTime) return;
    const timer = setInterval(() => {
      setCells(prev => prev.map(row => row.map(cell => ({ ...cell }))));
    }, 30);
    const cleanup = setTimeout(() => {
      setWipeFlashTime(null);
    }, 800);
    return () => {
      clearInterval(timer);
      clearTimeout(cleanup);
    };
  }, [wipeFlashTime]);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    
    // Coin economy slide: allow multiple placements, each costs 5 coins
    if (currentSlideData?.id === 'coins-economy') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const xPos = e.clientX - rect.left;
      const yPos = e.clientY - rect.top;
      const cSize = canvas.width / TUTORIAL_GRID_SIZE;
      const cX = Math.floor(xPos / cSize);
      const cY = Math.floor(yPos / cSize);
      
      const targetBase = slideConfig.playerBase;
      if (!targetBase) return;
      
      // Only allow placing in player territory
      if (cells[cY]?.[cX]?.territory === PLAYER_ID) {
        const placementCost = 5; // 5 cells in glider
        
        if (walletCoins < placementCost) {
          // Not enough coins - flash red
          setWalletFlash('lose');
          setTimeout(() => setWalletFlash(null), 300);
          return;
        }
        
        setCells(prev => {
          const next = prev.map(row => row.map(cell => ({ ...cell })));
          for (const [dx, dy] of GLIDER_DOWN_RIGHT) {
            const px = cX + dx;
            const py = cY + dy;
            if (px >= 0 && px < TUTORIAL_GRID_SIZE && py >= 0 && py < TUTORIAL_GRID_SIZE) {
              next[py][px].alive = true;
              next[py][px].owner = PLAYER_ID;
              next[py][px].territory = PLAYER_ID;
            }
          }
          return next;
        });
        
        // Deduct from wallet, add to base
        setWalletCoins(prev => prev - placementCost);
        setBaseCoins(prev => prev + placementCost);
        setWalletFlash('lose');
        setBaseFlash('gain');
        setCoinTransferActive(true);
        setTimeout(() => {
          setWalletFlash(null);
          setBaseFlash(null);
          setCoinTransferActive(false);
        }, 300);
        
        setEconomyPlacementCount(prev => prev + 1);
        
        // Progress through phases
        if (economyPhase === 'earning' && economyPlacementCount === 0) {
          setEconomyPhase('spending');
        } else if (economyPhase === 'spending' && economyPlacementCount >= 1) {
          setEconomyPhase('faucet');
        }
        
        // Trigger spawn animation
        setSpawnAnimation({ x: cX + 1, y: cY + 1, frame: Date.now() });
        
        // Start animation if not already running
        if (!isAnimating) {
          setTimeout(() => setIsAnimating(true), 500);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || hasPlaced || !currentSlideData?.implemented) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellSize = canvas.width / TUTORIAL_GRID_SIZE;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);

    // For attack-strategy slide: click near enemy walls to place a block
    if (currentSlideData?.id === 'attack-strategy' && slideConfig.enemyBase) {
      const eb = slideConfig.enemyBase;
      // Allow clicking in the area around enemy base (extended territory)
      const nearEnemyBase = 
        cellX >= eb.x - 2 && cellX < eb.x + BASE_SIZE + 2 &&
        cellY >= eb.y + BASE_SIZE - 1 && cellY < eb.y + BASE_SIZE + 4;
      
      if (nearEnemyBase) {
        setCells(prev => {
          const next = prev.map(row => row.map(cell => ({ ...cell })));
          
          // Place BLOCK pattern (2x2 stable still life)
          for (const [dx, dy] of BLOCK_PATTERN) {
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
        
        // Trigger spawn animation
        setSpawnAnimation({ x: cellX, y: cellY, frame: Date.now() });
        setCellCount(4); // 4 cells in block
        setTerritoryCount(4);
        
        setTimeout(() => {
          setIsAnimating(true);
        }, 500);
        return;
      }
    }

    // Default behavior: place glider inside player base
    const targetBase = slideConfig.playerBase;
    if (!targetBase) return;

    if (isInBase(cellX, cellY, targetBase.x, targetBase.y)) {
      setCells(prev => {
        const next = prev.map(row => row.map(cell => ({ ...cell })));

        // Use glider that moves toward enemy (if enemy exists) or down-right
        // Player is at bottom-left, enemy at top-right - use UP_RIGHT glider to attack diagonally
        const pattern = slideConfig.enemyBase ? GLIDER_UP_RIGHT : GLIDER_DOWN_RIGHT;

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

      // Trigger spawn animation glow
      setSpawnAnimation({ x: cellX + 1, y: cellY + 1, frame: Date.now() });

      // Set initial cell count (5 cells in glider)
      setCellCount(5);
      setTerritoryCount(5);

      setTimeout(() => {
        setIsAnimating(true);
      }, 500);
    }
  }, [hasPlaced, currentSlideData?.implemented, currentSlideData?.id, slideConfig, cells, walletCoins, economyPhase, economyPlacementCount, isAnimating]);

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
  const isCutoffSlide = currentSlideData?.id === 'territory-cutoff';

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
            {/* Coin economy slide UI */}
            {currentSlideData?.id === 'coins-economy' && (
              <div className="w-full mb-3 px-2">
                <div className="flex justify-between items-center mb-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-900/30 border ${walletFlash === 'gain' ? 'border-green-400' : walletFlash === 'lose' ? 'border-red-400' : 'border-yellow-600/30'} transition-colors`}>
                    <span className="text-yellow-400">Wallet:</span>
                    <span className={`font-bold ${walletFlash === 'gain' ? 'text-green-400' : walletFlash === 'lose' ? 'text-red-400' : 'text-yellow-300'}`}>
                      {displayedWallet}
                    </span>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-900/30 border ${baseFlash === 'gain' ? 'border-green-400' : baseFlash === 'lose' ? 'border-red-400' : 'border-green-600/30'} transition-colors`}>
                    <span className="text-green-400">Base:</span>
                    <span className={`font-bold ${baseFlash === 'gain' ? 'text-green-400' : baseFlash === 'lose' ? 'text-red-400' : 'text-green-300'}`}>
                      {displayedBase}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>Territory: {economyTerritoryCount} (+{Math.max(1, Math.floor(economyTerritoryCount / 10))}/sec)</span>
                  <span>Placement: 5 coins</span>
                </div>
              </div>
            )}

            {/* Territory stats for cutoff slide */}
            {isCutoffSlide && currentSlideData?.implemented && (
              <div className="flex justify-center gap-6 mb-3 text-sm">
                <div className="text-green-400">
                  <span className="text-gray-500">Territory:</span> {territoryCount}
                </div>
                {territoryLostCount > 0 && (
                  <div className="text-red-400 animate-pulse">
                    <span className="text-gray-500">Lost:</span> -{territoryLostCount}
                  </div>
                )}
              </div>
            )}

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
              className={`rounded-lg border border-gray-700 ${(!hasPlaced && currentSlideData?.implemented) || currentSlideData?.id === 'coins-economy' ? 'cursor-pointer' : ''}`}
              style={{ imageRendering: 'pixelated' }}
            />

            {/* Stats display for place-cells slide - shows cell and territory count */}
            {currentSlideData?.id === 'place-cells' && hasPlaced && isAnimating && (
              <div className="flex justify-center gap-6 mt-3 text-xs">
                <div className="text-green-400">
                  <span className="text-gray-500">Cells:</span> {cellCount}
                </div>
                <div className="text-green-300">
                  <span className="text-gray-500">Territory:</span> {territoryCount}
                </div>
              </div>
            )}


            {/* Wiper timer display */}
            {currentSlideData?.id === 'wipers' && (
              <div className="flex justify-center gap-4 mt-3 text-sm">
                <div className={`${wiperPhase === 'wiping' ? 'text-red-500 animate-pulse font-bold' : wiperCountdown <= 2 ? 'text-orange-400' : 'text-yellow-400'}`}>
                  {wiperPhase === 'wiping' ? 'WIPING!' : wiperPhase === 'aftermath' ? 'Quadrant Cleared' : `Quadrant ${targetQuadrant} wipes in: ${wiperCountdown}s`}
                </div>
              </div>
            )}
            {/* Status text */}
            <div className="mt-4 text-center">
              {/* Coins economy slide status */}
              {currentSlideData?.id === 'coins-economy' && (
                <p className={`text-sm ${economyPhase === 'earning' ? 'text-yellow-400' : economyPhase === 'spending' ? 'text-green-400' : economyPhase === 'faucet' ? 'text-blue-400' : 'text-gray-400'}`}>
                  {economyPhase === 'earning' && 'Watch your wallet grow! Territory generates income.'}
                  {economyPhase === 'spending' && 'Click in your territory to place cells (5 coins each)'}
                  {economyPhase === 'faucet' && 'Running low? Try the faucet button below!'}
                  {economyPhase === 'free' && 'Experiment freely! Place cells and watch the economy.'}
                </p>
              )}

              {currentSlideData?.implemented && (
                <>
                  {!hasPlaced && !isCutoffSlide && (
                    <p className="text-green-400 animate-pulse">
                      {currentSlideData?.id === 'attack-strategy'
                        ? 'Click on the glowing area below the enemy base to place a Block!'
                        : hasEnemyBase
                        ? 'Click inside YOUR base (bottom-left) to attack!'
                        : 'Click inside the base to spawn a Glider'}
                    </p>
                  )}
                  {isCutoffSlide && !cutoffTriggered && (
                    <p className="text-blue-400">
                      Watch the enemy glider approach your territory...
                    </p>
                  )}
                  {isCutoffSlide && cutoffTriggered && fadingTerritory.length > 0 && (
                    <p className="text-red-400 font-bold animate-pulse">
                      Territory cut off! Connection to base lost!
                    </p>
                  )}
                  {isCutoffSlide && cutoffTriggered && fadingTerritory.length === 0 && (
                    <p className="text-yellow-400">
                      Keep your territory connected to avoid losses!
                    </p>
                  )}
                  {hasPlaced && isAnimating && !hasEnemyBase && !isCutoffSlide && (
                    <p className="text-blue-400">
                      Watch the glider claim territory as it moves!
                    </p>
                  )}
                  {hasPlaced && isAnimating && hasEnemyBase && !showVictory && currentSlideData?.id !== 'attack-strategy' && (
                    <p className="text-blue-400">
                      Your cells are draining enemy coins!
                    </p>
                  )}
                  {hasPlaced && isAnimating && currentSlideData?.id === 'attack-strategy' && !showVictory && (
                    <p className="text-blue-400">
                      The block is stable and drains coins forever!
                    </p>
                  )}
                  {showVictory && currentSlideData?.id === 'attack-strategy' && (
                    <p className="text-yellow-400 font-bold animate-bounce">
                      Enemy destroyed! Blocks are deadly siege weapons!
                    </p>
                  )}
                  {showVictory && currentSlideData?.id !== 'attack-strategy' && (
                    <p className="text-yellow-400 font-bold animate-bounce">
                      Enemy base destroyed! You win!
                    </p>
                  )}
                  {/* Wiper slide status messages */}
                  {currentSlideData?.id === 'wipers' && wiperPhase === 'countdown' && (
                    <p className="text-yellow-400">
                      {wiperCountdown > 2 ? 'Watch the countdown! Cells outside the base will be wiped.' : 'Cells in bases are protected!'}
                    </p>
                  )}
                  {currentSlideData?.id === 'wipers' && wiperPhase === 'aftermath' && (
                    <p className="text-blue-400">
                      Territory remains, but cells are gone. Bases protect cells inside!
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
                {isCutoffSlide ? 'Watch Again' : 'Try Again'}
              </button>
            )}

            {/* Faucet button for coin economy slide */}
            {currentSlideData?.id === 'coins-economy' && (
              <button
                onClick={handleFaucet}
                className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded transition-colors font-bold"
              >
                +1000 Faucet
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
