import React, { useRef, useEffect, useState, useCallback } from 'react';

// Cell size in pixels
const CELL_SIZE = 10;
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const DEAD_COLOR = '#000000';

// Player colors
const PLAYER_COLORS: Record<number, string> = {
  1: '#39FF14', // Green - Player 1
  2: '#FF3939', // Red - Player 2
  3: '#3939FF', // Blue - Player 3
  4: '#FFD700', // Gold - Player 4
};

// Faded territory colors (for claimed but empty squares)
const TERRITORY_COLORS: Record<number, string> = {
  1: 'rgba(57, 255, 20, 0.15)',   // Green faded
  2: 'rgba(255, 57, 57, 0.15)',   // Red faded
  3: 'rgba(57, 57, 255, 0.15)',   // Blue faded
  4: 'rgba(255, 215, 0, 0.15)',   // Gold faded
};

// Pattern categories for game
type PatternCategory = 'gun' | 'spaceship' | 'defense' | 'bomb' | 'oscillator';

interface PatternInfo {
  name: string;
  rle: string;
  category: PatternCategory;
  description: string;
  tier?: number;
}

// RLE Parser - converts RLE string to coordinate array
function parseRLE(rle: string): number[][] {
  const coords: number[][] = [];
  const lines = rle.split('\n');
  let patternData = '';
  let width = 0;
  let height = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('x')) {
      const match = trimmed.match(/x\s*=\s*(\d+).*y\s*=\s*(\d+)/);
      if (match) {
        width = parseInt(match[1]);
        height = parseInt(match[2]);
      }
      continue;
    }
    patternData += trimmed;
  }

  let x = 0;
  let y = 0;
  let countStr = '';

  for (const char of patternData) {
    if (char >= '0' && char <= '9') {
      countStr += char;
    } else if (char === 'b') {
      const count = countStr ? parseInt(countStr) : 1;
      x += count;
      countStr = '';
    } else if (char === 'o') {
      const count = countStr ? parseInt(countStr) : 1;
      for (let i = 0; i < count; i++) {
        coords.push([x + i, y]);
      }
      x += count;
      countStr = '';
    } else if (char === '$') {
      const count = countStr ? parseInt(countStr) : 1;
      y += count;
      x = 0;
      countStr = '';
    } else if (char === '!') {
      break;
    }
  }

  if (coords.length > 0) {
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    return coords.map(([cx, cy]) => [cx - centerX, cy - centerY]);
  }

  return coords;
}

// Curated pattern library
const PATTERNS: PatternInfo[] = [
  // === SPACESHIPS ===
  {
    name: 'Glider',
    category: 'spaceship',
    description: 'The classic. Moves diagonally at c/4.',
    tier: 1,
    rle: `#N Glider
x = 3, y = 3, rule = B3/S23
bo$2bo$3o!`,
  },
  {
    name: 'LWSS',
    category: 'spaceship',
    description: 'Lightweight spaceship. Moves horizontally at c/2.',
    tier: 1,
    rle: `#N LWSS
x = 5, y = 4, rule = B3/S23
bo2bo$o$o3bo$4o!`,
  },
  {
    name: 'MWSS',
    category: 'spaceship',
    description: 'Middleweight spaceship. Larger c/2 horizontal.',
    tier: 2,
    rle: `#N MWSS
x = 6, y = 5, rule = B3/S23
3bo$bo3bo$o$o4bo$5o!`,
  },
  {
    name: 'HWSS',
    category: 'spaceship',
    description: 'Heavyweight spaceship. Largest standard ship.',
    tier: 2,
    rle: `#N HWSS
x = 7, y = 5, rule = B3/S23
3b2o$bo4bo$o$o5bo$6o!`,
  },
  {
    name: 'Copperhead',
    category: 'spaceship',
    description: 'First c/10 orthogonal spaceship. Slow and menacing.',
    tier: 3,
    rle: `#N Copperhead
x = 8, y = 12, rule = B3/S23
b2o2b2o$3b2o$3b2o$obo2bobo$o6bo2$o6bo$b2o2b2o$2b4o2$3b2o$3b2o!`,
  },

  // === GUNS ===
  {
    name: 'Gosper Glider Gun',
    category: 'gun',
    description: 'The first gun ever discovered. Fires gliders every 30 gen.',
    tier: 1,
    rle: `#N Gosper glider gun
x = 36, y = 9, rule = B3/S23
24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!`,
  },
  {
    name: 'Simkin Glider Gun',
    category: 'gun',
    description: 'Smallest known gun (29 cells). Period 120.',
    tier: 2,
    rle: `#N Simkin glider gun
x = 33, y = 21, rule = B3/S23
2o5b2o$2o5b2o2$4b2o$4b2o5$22b2ob2o$21bo5bo$21bo6bo2b2o$21b3o3bo3b2o$26bo4$20b2o$20bo$21b3o$23bo!`,
  },
  {
    name: 'P46 Gun',
    category: 'gun',
    description: 'Period 46 glider gun. Twin bee shuttle based.',
    tier: 3,
    rle: `#N p46 gun
x = 29, y = 19, rule = B3/S23
18bo$17bobo$6bo11bo5b2o$5bobo9bobo4b2o$5bobo9bobo$2o3bo2bo7bo2bo$2o4bobo7bobo5b2o$6bo11bo4b2o$26bo$24bobo$24bo!`,
  },

  // === DEFENSE (Still Lifes & Eaters) ===
  {
    name: 'Block',
    category: 'defense',
    description: 'Simplest still life. Indestructible wall unit.',
    tier: 1,
    rle: `#N Block
x = 2, y = 2, rule = B3/S23
2o$2o!`,
  },
  {
    name: 'Beehive',
    category: 'defense',
    description: 'Common still life. Stable barrier.',
    tier: 1,
    rle: `#N Beehive
x = 4, y = 3, rule = B3/S23
b2o$o2bo$b2o!`,
  },
  {
    name: 'Loaf',
    category: 'defense',
    description: 'Larger still life. Sturdy structure.',
    tier: 1,
    rle: `#N Loaf
x = 4, y = 4, rule = B3/S23
b2o$o2bo$bobo$2bo!`,
  },
  {
    name: 'Eater 1',
    category: 'defense',
    description: 'Can absorb gliders! Key defensive structure.',
    tier: 2,
    rle: `#N Eater 1
x = 4, y = 4, rule = B3/S23
2o$bo$bobo$2b2o!`,
  },
  {
    name: 'Boat',
    category: 'defense',
    description: 'Small still life. Cheap wall filler.',
    tier: 1,
    rle: `#N Boat
x = 3, y = 3, rule = B3/S23
2o$obo$bo!`,
  },
  {
    name: 'Ship',
    category: 'defense',
    description: 'Diagonal still life. Corner defense.',
    tier: 1,
    rle: `#N Ship
x = 3, y = 3, rule = B3/S23
2o$obo$b2o!`,
  },
  {
    name: 'Tub',
    category: 'defense',
    description: 'Hollow still life. Compact barrier.',
    tier: 1,
    rle: `#N Tub
x = 3, y = 3, rule = B3/S23
bo$obo$bo!`,
  },
  {
    name: 'Snake',
    category: 'defense',
    description: 'Long still life. Extended wall section.',
    tier: 2,
    rle: `#N Snake
x = 4, y = 2, rule = B3/S23
2obo$ob2o!`,
  },

  // === BOMBS (Methuselahs) ===
  {
    name: 'R-pentomino',
    category: 'bomb',
    description: 'Chaos bomb! 5 cells evolve for 1103 generations.',
    tier: 1,
    rle: `#N R-pentomino
x = 3, y = 3, rule = B3/S23
b2o$2o$bo!`,
  },
  {
    name: 'Acorn',
    category: 'bomb',
    description: 'Spawns many gliders. 5206 gen to stabilize.',
    tier: 2,
    rle: `#N Acorn
x = 7, y = 3, rule = B3/S23
bo$3bo$2o2b3o!`,
  },
  {
    name: 'Die Hard',
    category: 'bomb',
    description: 'Vanishes after 130 gen. Leaves nothing behind.',
    tier: 2,
    rle: `#N Die hard
x = 8, y = 3, rule = B3/S23
6bo$2o$bo3b3o!`,
  },
  {
    name: 'B-heptomino',
    category: 'bomb',
    description: 'Active chaos. Produces gliders and debris.',
    tier: 2,
    rle: `#N B-heptomino
x = 4, y = 3, rule = B3/S23
ob2o$2o$bo!`,
  },
  {
    name: 'Pi-heptomino',
    category: 'bomb',
    description: 'Pi explosion. 173 gen of chaos.',
    tier: 2,
    rle: `#N Pi-heptomino
x = 3, y = 2, rule = B3/S23
b3o$3o!`,
  },

  // === OSCILLATORS ===
  {
    name: 'Blinker',
    category: 'oscillator',
    description: 'Simplest oscillator. Period 2.',
    tier: 1,
    rle: `#N Blinker
x = 3, y = 1, rule = B3/S23
3o!`,
  },
  {
    name: 'Toad',
    category: 'oscillator',
    description: 'Period 2 oscillator. Compact.',
    tier: 1,
    rle: `#N Toad
x = 4, y = 2, rule = B3/S23
b3o$3o!`,
  },
  {
    name: 'Beacon',
    category: 'oscillator',
    description: 'Period 2 flasher. Visual indicator.',
    tier: 1,
    rle: `#N Beacon
x = 4, y = 4, rule = B3/S23
2o$2o$2b2o$2b2o!`,
  },
  {
    name: 'Pulsar',
    category: 'oscillator',
    description: 'Beautiful period 3 oscillator. 48 cells.',
    tier: 2,
    rle: `#N Pulsar
x = 13, y = 13, rule = B3/S23
2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!`,
  },
  {
    name: 'Pentadecathlon',
    category: 'oscillator',
    description: 'Period 15 oscillator. Long cycle time.',
    tier: 3,
    rle: `#N Pentadecathlon
x = 10, y = 3, rule = B3/S23
2bo4bo$2ob4ob2o$2bo4bo!`,
  },
  {
    name: 'Clock',
    category: 'oscillator',
    description: 'Period 2 spinner. Rotates 90 degrees.',
    tier: 1,
    rle: `#N Clock
x = 4, y = 4, rule = B3/S23
2bo$obo$bobo$bo!`,
  },
];

// Category metadata
const CATEGORY_INFO: Record<PatternCategory, { label: string; color: string; icon: string }> = {
  gun: { label: 'Guns', color: 'text-red-400 border-red-500/50 bg-red-500/10', icon: '>' },
  spaceship: { label: 'Ships', color: 'text-blue-400 border-blue-500/50 bg-blue-500/10', icon: '~' },
  defense: { label: 'Defense', color: 'text-green-400 border-green-500/50 bg-green-500/10', icon: '#' },
  bomb: { label: 'Bombs', color: 'text-orange-400 border-orange-500/50 bg-orange-500/10', icon: '*' },
  oscillator: { label: 'Oscillators', color: 'text-purple-400 border-purple-500/50 bg-purple-500/10', icon: 'o' },
};

export const Life: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState<PatternInfo>(PATTERNS[0]);
  const [selectedCategory, setSelectedCategory] = useState<PatternCategory | 'all'>('all');
  // Grid now stores owner ID: 0 = dead, 1+ = player ID
  const [grid, setGrid] = useState<number[][]>([]);
  // Territory tracks the last owner of each square (persists after cell dies)
  const [territory, setTerritory] = useState<number[][]>([]);
  const [gridSize, setGridSize] = useState({ rows: 0, cols: 0 });
  const [speed, setSpeed] = useState(100);
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const [parsedPattern, setParsedPattern] = useState<number[][]>([]);

  // Parse pattern when selection changes
  useEffect(() => {
    const coords = parseRLE(selectedPattern.rle);
    setParsedPattern(coords);
  }, [selectedPattern]);

  // Initialize grid based on canvas size
  useEffect(() => {
    const updateGridSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const container = canvas.parentElement;
      if (!container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      canvas.width = width;
      canvas.height = height;

      const cols = Math.floor(width / CELL_SIZE);
      const rows = Math.floor(height / CELL_SIZE);

      setGridSize({ rows, cols });
      setGrid(createEmptyGrid(rows, cols));
      setTerritory(createEmptyGrid(rows, cols));
      setGeneration(0);
    };

    updateGridSize();
    window.addEventListener('resize', updateGridSize);
    return () => window.removeEventListener('resize', updateGridSize);
  }, []);

  const createEmptyGrid = (rows: number, cols: number): number[][] => {
    return Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(0));
  };

  // Draw the grid with territory colors
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = DEAD_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw territory (faded background for claimed squares)
    for (let row = 0; row < gridSize.rows; row++) {
      for (let col = 0; col < gridSize.cols; col++) {
        const owner = territory[row]?.[col];
        if (owner > 0) {
          ctx.fillStyle = TERRITORY_COLORS[owner] || 'rgba(255,255,255,0.1)';
          ctx.fillRect(
            col * CELL_SIZE,
            row * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
          );
        }
      }
    }

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    for (let i = 0; i <= gridSize.cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, gridSize.rows * CELL_SIZE);
      ctx.stroke();
    }

    for (let i = 0; i <= gridSize.rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(gridSize.cols * CELL_SIZE, i * CELL_SIZE);
      ctx.stroke();
    }

    // Draw living cells with owner colors (on top of territory)
    for (let row = 0; row < gridSize.rows; row++) {
      for (let col = 0; col < gridSize.cols; col++) {
        const owner = grid[row]?.[col];
        if (owner > 0) {
          ctx.fillStyle = PLAYER_COLORS[owner] || '#FFFFFF';
          ctx.fillRect(
            col * CELL_SIZE + 1,
            row * CELL_SIZE + 1,
            CELL_SIZE - 2,
            CELL_SIZE - 2
          );
        }
      }
    }
  }, [grid, territory, gridSize]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Count neighbors and their owners
  const getNeighborInfo = (grid: number[][], row: number, col: number): { count: number; owners: Record<number, number> } => {
    let count = 0;
    const owners: Record<number, number> = {};

    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        const newRow = row + i;
        const newCol = col + j;
        const wrappedRow = (newRow + gridSize.rows) % gridSize.rows;
        const wrappedCol = (newCol + gridSize.cols) % gridSize.cols;
        const owner = grid[wrappedRow]?.[wrappedCol];
        if (owner > 0) {
          count++;
          owners[owner] = (owners[owner] || 0) + 1;
        }
      }
    }
    return { count, owners };
  };

  // Get majority owner from neighbor counts
  const getMajorityOwner = (owners: Record<number, number>): number => {
    let maxCount = 0;
    let maxOwner = 1;
    for (const [owner, count] of Object.entries(owners)) {
      if (count > maxCount) {
        maxCount = count;
        maxOwner = parseInt(owner);
      }
    }
    return maxOwner;
  };

  const nextGeneration = useCallback(() => {
    setGrid((currentGrid) => {
      const newGrid = currentGrid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const { count, owners } = getNeighborInfo(currentGrid, rowIndex, colIndex);

          if (cell > 0) {
            // Living cell - survives with 2 or 3 neighbors, keeps its owner
            return (count === 2 || count === 3) ? cell : 0;
          } else {
            // Dead cell - born with exactly 3 neighbors, inherits majority owner
            if (count === 3) {
              return getMajorityOwner(owners);
            }
            return 0;
          }
        })
      );

      // Update territory: any living cell claims its square
      setTerritory((currentTerritory) => {
        const newTerritory = currentTerritory.map((r) => [...r]);
        for (let row = 0; row < newGrid.length; row++) {
          for (let col = 0; col < newGrid[row].length; col++) {
            if (newGrid[row][col] > 0) {
              newTerritory[row][col] = newGrid[row][col];
            }
          }
        }
        return newTerritory;
      });

      return newGrid;
    });
    setGeneration((g) => g + 1);
  }, [gridSize]);

  useEffect(() => {
    if (!isRunning) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= speed) {
        nextGeneration();
        lastUpdateRef.current = timestamp;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning, speed, nextGeneration]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    const cellPositions: Array<[number, number]> = [];

    setGrid((currentGrid) => {
      const newGrid = currentGrid.map((r) => [...r]);

      parsedPattern.forEach(([dx, dy]) => {
        const newRow = (row + dy + gridSize.rows) % gridSize.rows;
        const newCol = (col + dx + gridSize.cols) % gridSize.cols;
        if (newGrid[newRow]) {
          newGrid[newRow][newCol] = currentPlayer;
          cellPositions.push([newRow, newCol]);
        }
      });

      return newGrid;
    });

    // Also claim territory for placed cells
    setTerritory((currentTerritory) => {
      const newTerritory = currentTerritory.map((r) => [...r]);
      cellPositions.forEach(([r, c]) => {
        newTerritory[r][c] = currentPlayer;
      });
      return newTerritory;
    });
  };

  const handleClear = () => {
    setGrid(createEmptyGrid(gridSize.rows, gridSize.cols));
    setTerritory(createEmptyGrid(gridSize.rows, gridSize.cols));
    setGeneration(0);
    setIsRunning(false);
  };

  const handleStep = () => {
    nextGeneration();
  };

  // Count cells per player
  const cellCounts = grid.reduce((acc, row) => {
    row.forEach((cell) => {
      if (cell > 0) {
        acc[cell] = (acc[cell] || 0) + 1;
      }
    });
    return acc;
  }, {} as Record<number, number>);

  // Count territory per player
  const territoryCounts = territory.reduce((acc, row) => {
    row.forEach((owner) => {
      if (owner > 0) {
        acc[owner] = (acc[owner] || 0) + 1;
      }
    });
    return acc;
  }, {} as Record<number, number>);

  const totalTerritory = Object.values(territoryCounts).reduce((a, b) => a + b, 0);

  // Filter patterns by category
  const filteredPatterns = selectedCategory === 'all'
    ? PATTERNS
    : PATTERNS.filter(p => p.category === selectedCategory);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-white">Conway's Game of Life</h1>
          <p className="text-gray-500 text-xs">Territory mode - cells spread your color</p>
        </div>

        <div className="flex items-center gap-4 text-sm font-mono">
          <div className="text-gray-400">
            Gen: <span className="text-dfinity-turquoise">{generation}</span>
          </div>
          <div className="text-gray-600">|</div>
          {/* Territory counts per player */}
          <div className="text-gray-400 text-xs">Territory:</div>
          {Object.entries(territoryCounts).map(([player, count]) => (
            <div key={player} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-sm opacity-50"
                style={{ backgroundColor: PLAYER_COLORS[parseInt(player)] }}
              />
              <span style={{ color: PLAYER_COLORS[parseInt(player)] }}>{count}</span>
            </div>
          ))}
          {totalTerritory === 0 && (
            <span className="text-gray-500">None</span>
          )}
          <div className="text-gray-600">|</div>
          {/* Living cell counts */}
          <div className="text-gray-400 text-xs">Cells:</div>
          {Object.entries(cellCounts).map(([player, count]) => (
            <div key={`cell-${player}`} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: PLAYER_COLORS[parseInt(player)] }}
              />
              <span className="text-xs" style={{ color: PLAYER_COLORS[parseInt(player)] }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-3 p-3 bg-white/5 rounded-lg">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={`px-4 py-1.5 rounded font-mono text-sm font-bold transition-all ${
            isRunning
              ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
              : 'bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30'
          }`}
        >
          {isRunning ? 'PAUSE' : 'PLAY'}
        </button>

        <button
          onClick={handleStep}
          disabled={isRunning}
          className="px-3 py-1.5 rounded font-mono text-sm bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          STEP
        </button>

        <button
          onClick={handleClear}
          className="px-3 py-1.5 rounded font-mono text-sm bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-all"
        >
          CLEAR
        </button>

        <div className="flex items-center gap-2 ml-2">
          <span className="text-gray-500 text-xs">Speed:</span>
          <input
            type="range"
            min="20"
            max="500"
            value={500 - speed + 20}
            onChange={(e) => setSpeed(500 - Number(e.target.value) + 20)}
            className="w-20 slider-turquoise"
          />
          <span className="text-gray-600 text-xs w-12">{Math.round(1000 / speed)}/s</span>
        </div>

        {/* Player selector */}
        <div className="flex items-center gap-2 ml-4 pl-4 border-l border-white/10">
          <span className="text-gray-500 text-xs">Player:</span>
          {[1, 2, 3, 4].map((player) => (
            <button
              key={player}
              onClick={() => setCurrentPlayer(player)}
              className={`w-6 h-6 rounded transition-all ${
                currentPlayer === player
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-black'
                  : 'opacity-50 hover:opacity-75'
              }`}
              style={{ backgroundColor: PLAYER_COLORS[player] }}
              title={`Player ${player}`}
            />
          ))}
        </div>
      </div>

      {/* Pattern Selector */}
      <div className="mb-3 p-3 bg-white/5 rounded-lg">
        {/* Category tabs */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded text-xs font-mono transition-all ${
              selectedCategory === 'all'
                ? 'bg-white/20 text-white border border-white/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            All ({PATTERNS.length})
          </button>
          {(Object.keys(CATEGORY_INFO) as PatternCategory[]).map((cat) => {
            const info = CATEGORY_INFO[cat];
            const count = PATTERNS.filter(p => p.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded text-xs font-mono transition-all border ${
                  selectedCategory === cat
                    ? info.color
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {info.icon} {info.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Pattern grid */}
        <div className="flex flex-wrap gap-2">
          {filteredPatterns.map((pattern) => {
            const catInfo = CATEGORY_INFO[pattern.category];
            const isSelected = selectedPattern.name === pattern.name;
            return (
              <button
                key={pattern.name}
                onClick={() => setSelectedPattern(pattern)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-all border ${
                  isSelected
                    ? catInfo.color + ' ring-1 ring-white/30'
                    : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:border-white/20'
                }`}
                title={pattern.description}
              >
                {pattern.name}
              </button>
            );
          })}
        </div>

        {/* Selected pattern info */}
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">Selected: </span>
            <span className={`font-mono text-sm ${CATEGORY_INFO[selectedPattern.category].color.split(' ')[0]}`}>
              {selectedPattern.name}
            </span>
            <span className="text-gray-500 text-xs">({parsedPattern.length} cells)</span>
            <div
              className="w-3 h-3 rounded-sm ml-2"
              style={{ backgroundColor: PLAYER_COLORS[currentPlayer] }}
              title={`Will place as Player ${currentPlayer}`}
            />
          </div>
          <p className="text-gray-500 text-xs max-w-md">{selectedPattern.description}</p>
        </div>
      </div>

      {/* Canvas container */}
      <div className="flex-1 border border-white/20 rounded-lg overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="cursor-crosshair"
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};
