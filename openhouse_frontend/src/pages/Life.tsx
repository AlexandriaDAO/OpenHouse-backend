import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { Actor, HttpAgent, ActorSubclass } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory } from '../declarations/life1_backend';
import type { _SERVICE, GameState, Cell } from '../declarations/life1_backend/life1_backend.did.d';

const LIFE1_CANISTER_ID = 'pijnb-7yaaa-aaaae-qgcuq-cai';

// Grid dimensions - 512x512 divided into 16 quadrants of 128x128
const GRID_SIZE = 512;
const QUADRANT_SIZE = 128;
const QUADRANTS_PER_ROW = 4;
const TOTAL_QUADRANTS = 16;

// Legacy constants for backend compatibility
const GRID_WIDTH = GRID_SIZE;
const GRID_HEIGHT = GRID_SIZE;

// Simulation timing
const LOCAL_TICK_MS = 100;      // Local simulation: 10 generations/second
const BACKEND_SYNC_MS = 5000;   // Sync with backend every 5 seconds

// Rendering constants
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';

// View modes
type ViewMode = 'overview' | 'quadrant';

// Swipe detection
const SWIPE_THRESHOLD = 50;
const DEAD_COLOR = '#000000';

// 10 Player colors
const PLAYER_COLORS: Record<number, string> = {
  1: '#39FF14',  // Neon Green
  2: '#FF3939',  // Red
  3: '#3939FF',  // Blue
  4: '#FFD700',  // Gold
  5: '#FF39FF',  // Magenta
  6: '#39FFFF',  // Cyan
  7: '#FF8C00',  // Orange
  8: '#8B5CF6',  // Purple
  9: '#F472B6',  // Pink
  10: '#A3E635', // Lime
};

const TERRITORY_COLORS: Record<number, string> = {
  1: 'rgba(57, 255, 20, 0.15)',
  2: 'rgba(255, 57, 57, 0.15)',
  3: 'rgba(57, 57, 255, 0.15)',
  4: 'rgba(255, 215, 0, 0.15)',
  5: 'rgba(255, 57, 255, 0.15)',
  6: 'rgba(57, 255, 255, 0.15)',
  7: 'rgba(255, 140, 0, 0.15)',
  8: 'rgba(139, 92, 246, 0.15)',
  9: 'rgba(244, 114, 182, 0.15)',
  10: 'rgba(163, 230, 53, 0.15)',
};

// Gold border for cells with points
const GOLD_BORDER_MIN_OPACITY = 0.3;
const GOLD_BORDER_MAX_OPACITY = 1.0;

// Pattern types
type PatternCategory = 'gun' | 'spaceship' | 'defense' | 'bomb' | 'oscillator';

interface PatternInfo {
  name: string;
  rle: string;
  category: PatternCategory;
  description: string;
}

// Batch placement support
interface PendingPlacement {
  id: string;
  cells: [number, number][];
  patternName: string;
  centroid: [number, number]; // For display purposes
}

// RLE Parser
function parseRLE(rle: string): [number, number][] {
  const coords: [number, number][] = [];
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

  let x = 0, y = 0, countStr = '';
  for (const char of patternData) {
    if (char >= '0' && char <= '9') {
      countStr += char;
    } else if (char === 'b') {
      x += countStr ? parseInt(countStr) : 1;
      countStr = '';
    } else if (char === 'o') {
      const count = countStr ? parseInt(countStr) : 1;
      for (let i = 0; i < count; i++) coords.push([x + i, y]);
      x += count;
      countStr = '';
    } else if (char === '$') {
      y += countStr ? parseInt(countStr) : 1;
      x = 0;
      countStr = '';
    } else if (char === '!') break;
  }

  // Center the pattern
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  return coords.map(([cx, cy]) => [cx - centerX, cy - centerY]);
}

// Pattern library
const PATTERNS: PatternInfo[] = [
  { name: 'Glider', category: 'spaceship', description: 'Classic diagonal mover',
    rle: `x = 3, y = 3\nbo$2bo$3o!` },
  { name: 'LWSS', category: 'spaceship', description: 'Lightweight spaceship',
    rle: `x = 5, y = 4\nbo2bo$o$o3bo$4o!` },
  { name: 'MWSS', category: 'spaceship', description: 'Middleweight spaceship',
    rle: `x = 6, y = 5\n3bo$bo3bo$o$o4bo$5o!` },
  { name: 'HWSS', category: 'spaceship', description: 'Heavyweight spaceship',
    rle: `x = 7, y = 5\n3b2o$bo4bo$o$o5bo$6o!` },
  { name: 'Gosper Gun', category: 'gun', description: 'Fires gliders every 30 gen',
    rle: `x = 36, y = 9\n24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!` },
  { name: 'Simkin Gun', category: 'gun', description: 'Smallest known gun',
    rle: `x = 33, y = 21\n2o5b2o$2o5b2o2$4b2o$4b2o5$22b2ob2o$21bo5bo$21bo6bo2b2o$21b3o3bo3b2o$26bo4$20b2o$20bo$21b3o$23bo!` },
  { name: 'Block', category: 'defense', description: 'Simplest still life',
    rle: `x = 2, y = 2\n2o$2o!` },
  { name: 'Beehive', category: 'defense', description: 'Common still life',
    rle: `x = 4, y = 3\nb2o$o2bo$b2o!` },
  { name: 'Eater 1', category: 'defense', description: 'Absorbs gliders',
    rle: `x = 4, y = 4\n2o$bo$bobo$2b2o!` },
  { name: 'R-pentomino', category: 'bomb', description: 'Chaos bomb - 1103 gen',
    rle: `x = 3, y = 3\nb2o$2o$bo!` },
  { name: 'Acorn', category: 'bomb', description: 'Spawns gliders - 5206 gen',
    rle: `x = 7, y = 3\nbo$3bo$2o2b3o!` },
  { name: 'Blinker', category: 'oscillator', description: 'Period 2',
    rle: `x = 3, y = 1\n3o!` },
  { name: 'Pulsar', category: 'oscillator', description: 'Period 3',
    rle: `x = 13, y = 13\n2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!` },
];

const CATEGORY_INFO: Record<PatternCategory, { label: string; color: string; icon: string }> = {
  gun: { label: 'Guns', color: 'text-red-400 border-red-500/50 bg-red-500/10', icon: '>' },
  spaceship: { label: 'Ships', color: 'text-blue-400 border-blue-500/50 bg-blue-500/10', icon: '~' },
  defense: { label: 'Defense', color: 'text-green-400 border-green-500/50 bg-green-500/10', icon: '#' },
  bomb: { label: 'Bombs', color: 'text-orange-400 border-orange-500/50 bg-orange-500/10', icon: '*' },
  oscillator: { label: 'Oscillators', color: 'text-purple-400 border-purple-500/50 bg-purple-500/10', icon: 'o' },
};

// Small preview canvas for patterns
const PatternPreview: React.FC<{ pattern: [number, number][]; color: string }> = ({ pattern, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = 40; // 40x40 preview canvas

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pattern.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pattern) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const patternWidth = maxX - minX + 1;
    const patternHeight = maxY - minY + 1;

    // Calculate cell size to fit pattern in canvas with padding
    const padding = 2;
    const availableSize = size - padding * 2;
    const cellSize = Math.min(availableSize / patternWidth, availableSize / patternHeight, 6);

    // Center the pattern
    const offsetX = (size - patternWidth * cellSize) / 2;
    const offsetY = (size - patternHeight * cellSize) / 2;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);

    // Draw cells
    ctx.fillStyle = color;
    const gap = cellSize > 3 ? 1 : 0;
    for (const [x, y] of pattern) {
      const px = offsetX + (x - minX) * cellSize;
      const py = offsetY + (y - minY) * cellSize;
      ctx.fillRect(px, py, cellSize - gap, cellSize - gap);
    }

    // Draw border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }, [pattern, color]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded"
      style={{ width: size, height: size }}
    />
  );
};

// Local Game of Life simulation - mirrors backend rules exactly
const stepLocalGeneration = (cells: Cell[]): Cell[] => {
  const newCells: Cell[] = new Array(GRID_WIDTH * GRID_HEIGHT);

  for (let row = 0; row < GRID_HEIGHT; row++) {
    for (let col = 0; col < GRID_WIDTH; col++) {
      const idx = row * GRID_WIDTH + col;
      const current = cells[idx];

      // Count neighbors and track owner counts
      let neighborCount = 0;
      const ownerCounts: number[] = new Array(11).fill(0); // 0-10 players

      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (di === 0 && dj === 0) continue;

          // Toroidal wrap
          const nRow = (row + di + GRID_HEIGHT) % GRID_HEIGHT;
          const nCol = (col + dj + GRID_WIDTH) % GRID_WIDTH;
          const neighbor = cells[nRow * GRID_WIDTH + nCol];

          if (neighbor.alive) {
            neighborCount++;
            if (neighbor.owner > 0 && neighbor.owner <= 10) {
              ownerCounts[neighbor.owner]++;
            }
          }
        }
      }

      // Apply Conway's rules
      let newAlive = false;
      let newOwner = current.owner;

      if (current.alive) {
        // Living cell survives with 2-3 neighbors
        newAlive = neighborCount === 2 || neighborCount === 3;
      } else {
        // Dead cell born with exactly 3 neighbors
        if (neighborCount === 3) {
          newAlive = true;
          // New owner = majority owner among parents
          let maxCount = 0;
          let majorityOwner = 1;
          for (let o = 1; o <= 10; o++) {
            if (ownerCounts[o] > maxCount) {
              maxCount = ownerCounts[o];
              majorityOwner = o;
            }
          }
          newOwner = majorityOwner;
        }
      }

      // Preserve owner (territory) and points - they persist even when cells die
      newCells[idx] = {
        owner: newOwner,
        points: current.points,  // Points stay in cell
        alive: newAlive,
      };
    }
  }

  return newCells;
};

export const Life: React.FC = () => {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  // Pattern state
  const [selectedPattern, setSelectedPattern] = useState<PatternInfo>(PATTERNS[0]);
  const [selectedCategory, setSelectedCategory] = useState<PatternCategory | 'all'>('all');
  const [parsedPattern, setParsedPattern] = useState<[number, number][]>([]);

  // Quadrant-based view state
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [viewX, setViewX] = useState(0);     // 0, 128, 256, or 384
  const [viewY, setViewY] = useState(0);     // 0, 128, 256, or 384

  // Touch handling for swipe navigation
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Derived: current quadrant number (0-15)
  const currentQuadrant = (viewY / QUADRANT_SIZE) * QUADRANTS_PER_ROW + (viewX / QUADRANT_SIZE);

  // Auth state
  const [authClient, setAuthClient] = useState<AuthClient | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [actor, setActor] = useState<ActorSubclass<_SERVICE> | null>(null);
  const [myPrincipal, setMyPrincipal] = useState<Principal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Game state from backend - now uses unified GameState with Cell array
  const [gameState, setGameState] = useState<GameState | null>(null);
  // Local cells for optimistic simulation (runs independently, synced from backend periodically)
  const [localCells, setLocalCells] = useState<Cell[]>([]);
  // Track last checkpoint to detect when backend state actually changed (new placements)
  const lastCheckpointRef = useRef<bigint>(BigInt(0));
  const [myPlayerNum, setMyPlayerNum] = useState<number | null>(null);
  const [myBalance, setMyBalance] = useState(1000);
  const [placementError, setPlacementError] = useState<string | null>(null);

  // Pending placements - accumulate patterns before confirming
  const [pendingPlacements, setPendingPlacements] = useState<PendingPlacement[]>([]);
  const nextPlacementIdRef = useRef(0);
  const [isConfirmingPlacement, setIsConfirmingPlacement] = useState(false);
  const [previewPulse, setPreviewPulse] = useState(0); // For animation

  // Pattern rotation: 0=0°, 1=90°, 2=180°, 3=270° clockwise
  const [rotation, setRotation] = useState(0);

  // Game management state
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(BigInt(0));
  const [mode, setMode] = useState<'lobby' | 'game'>('game');
  const [games, setGames] = useState<any[]>([]);
  const [newGameName, setNewGameName] = useState('');

  // Simulation control - always running
  const [isRunning, setIsRunning] = useState(true);
  const [, forceRender] = useState(0);

  // Sidebar collapsed state with localStorage persistence
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('life-sidebar-collapsed');
    return saved === 'true';
  });

  // Mobile bottom bar expanded state
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('life-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Parse pattern on selection change (reset rotation too)
  useEffect(() => {
    setParsedPattern(parseRLE(selectedPattern.rle));
    setRotation(0);
  }, [selectedPattern]);

  // Rotate pattern coordinates: 0=0°, 1=90°, 2=180°, 3=270° clockwise
  const rotatePattern = useCallback((coords: [number, number][], rot: number): [number, number][] => {
    if (rot === 0) return coords;
    return coords.map(([x, y]) => {
      switch (rot) {
        case 1: return [y, -x];      // 90° clockwise
        case 2: return [-x, -y];     // 180°
        case 3: return [-y, x];      // 270° clockwise
        default: return [x, y];
      }
    });
  }, []);

  // Get rotated pattern
  const rotatedPattern = useMemo(() =>
    rotatePattern(parsedPattern, rotation),
    [parsedPattern, rotation, rotatePattern]
  );

  // Cycle rotation
  const cycleRotation = useCallback(() => {
    setRotation(r => (r + 1) % 4);
  }, []);

  // Pulse animation for pending placements
  useEffect(() => {
    if (pendingPlacements.length === 0) return;
    const interval = setInterval(() => {
      setPreviewPulse(p => (p + 1) % 60); // 60 frames per cycle at ~16ms
    }, 16);
    return () => clearInterval(interval);
  }, [pendingPlacements.length]);

  // Navigate to adjacent quadrant with toroidal wrapping
  const navigateQuadrant = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const step = QUADRANT_SIZE;
    const maxPos = GRID_SIZE - QUADRANT_SIZE; // 384

    switch (direction) {
      case 'up':
        setViewY(y => y === 0 ? maxPos : y - step);
        break;
      case 'down':
        setViewY(y => y === maxPos ? 0 : y + step);
        break;
      case 'left':
        setViewX(x => x === 0 ? maxPos : x - step);
        break;
      case 'right':
        setViewX(x => x === maxPos ? 0 : x + step);
        break;
    }
  }, []);

  // Jump to specific quadrant (0-15)
  const jumpToQuadrant = useCallback((quadrant: number) => {
    const qRow = Math.floor(quadrant / QUADRANTS_PER_ROW);
    const qCol = quadrant % QUADRANTS_PER_ROW;
    setViewX(qCol * QUADRANT_SIZE);
    setViewY(qRow * QUADRANT_SIZE);
    setViewMode('quadrant');
  }, []);

  // Toggle between overview and quadrant view
  const toggleViewMode = useCallback(() => {
    setViewMode(mode => mode === 'overview' ? 'quadrant' : 'overview');
  }, []);

  // Touch/Swipe navigation for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || viewMode !== 'quadrant') return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Determine swipe direction (if significant)
    if (Math.abs(deltaX) > SWIPE_THRESHOLD || Math.abs(deltaY) > SWIPE_THRESHOLD) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe - swipe left means go right (reveal content to the right)
        navigateQuadrant(deltaX < 0 ? 'right' : 'left');
      } else {
        // Vertical swipe - swipe up means go down
        navigateQuadrant(deltaY < 0 ? 'down' : 'up');
      }
    }

    touchStartRef.current = null;
  }, [viewMode, navigateQuadrant]);

  // Auth initialization
  useEffect(() => {
    AuthClient.create().then(client => {
      setAuthClient(client);
      if (client.isAuthenticated()) setupActor(client);
    });
  }, []);

  const handleLogin = async () => {
    if (!authClient) return;
    setIsLoading(true);
    try {
      await authClient.login({
        identityProvider: 'https://identity.ic0.app',
        onSuccess: () => setupActor(authClient),
        onError: (err) => { setError(`Login failed: ${err}`); setIsLoading(false); }
      });
    } catch (err) {
      setError(`Login failed: ${err}`);
      setIsLoading(false);
    }
  };

  const setupActor = (client: AuthClient) => {
    const identity = client.getIdentity();
    const agent = new HttpAgent({ identity, host: 'https://icp-api.io' });
    const newActor = Actor.createActor<_SERVICE>(idlFactory, { agent, canisterId: LIFE1_CANISTER_ID });
    setActor(newActor);
    setMyPrincipal(identity.getPrincipal());
    setIsAuthenticated(true);
    setIsLoading(false);
  };

  // Fetch games for lobby
  const fetchGames = useCallback(async () => {
    if (!actor) return;
    setIsLoading(true);
    try {
      const gamesList = await actor.list_games();
      setGames(gamesList);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch games: ${err}`);
    }
    setIsLoading(false);
  }, [actor]);

  useEffect(() => {
    if (isAuthenticated && actor) fetchGames();
  }, [isAuthenticated, actor, fetchGames]);

  // Simulation runs locally - backend handles its own tick rate

  // Create game
  const handleCreateGame = async () => {
    if (!actor || !newGameName.trim()) return;
    const trimmedName = newGameName.trim();
    if (trimmedName.length > 50 || !/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
      setError('Invalid game name');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await actor.create_game(trimmedName, {
        width: GRID_WIDTH, height: GRID_HEIGHT, max_players: 10, generations_limit: []
      });
      if ('Ok' in result) {
        const gameId = result.Ok;
        await actor.start_game(gameId);
        setCurrentGameId(gameId);
        setMyPlayerNum(1);
        setMode('game');
        setNewGameName('');
      } else {
        setError(`Failed: ${result.Err}`);
      }
    } catch (err) {
      setError(`Failed: ${err}`);
    }
    setIsLoading(false);
  };

  // Join game
  const handleJoinGame = async (gameId: bigint) => {
    if (!actor) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await actor.join_game(gameId);
      if ('Ok' in result) {
        setCurrentGameId(gameId);
        setMyPlayerNum(result.Ok);
        // Fetch initial state
        const stateResult = await actor.get_state(gameId);
        if ('Ok' in stateResult) {
          setGameState(stateResult.Ok);
          // Update my balance
          const myIdx = stateResult.Ok.players.findIndex(
            p => p.toText() === myPrincipal?.toText()
          );
          if (myIdx >= 0) {
            setMyBalance(Number(stateResult.Ok.balances[myIdx]));
          }
        }
        setMode('game');
      } else {
        setError(`Failed: ${result.Err}`);
      }
    } catch (err) {
      setError(`Failed: ${err}`);
    }
    setIsLoading(false);
  };

  const handleLeaveGame = () => {
    setMode('lobby');
    setCurrentGameId(null);
    setGameState(null);
    setIsRunning(false);
    fetchGames();
  };

  // Canvas sizing
  useEffect(() => {
    if (!isAuthenticated) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      if (width === 0 || height === 0) return;
      if (canvasSizeRef.current.width === width && canvasSizeRef.current.height === height) return;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvasSizeRef.current = { width, height };
      forceRender(n => n + 1);
    };

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();
    const t1 = setTimeout(updateSize, 50);
    const t2 = setTimeout(updateSize, 200);

    return () => {
      observer.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isAuthenticated]);

  // Backend sync - use lightweight get_metadata() for fast checks
  // Only fetch full state when checkpoint actually changes
  useEffect(() => {
    if (!actor || !isAuthenticated) return;

    let cancelled = false;

    const syncFromBackend = async () => {
      if (cancelled) return;

      const isFirstLoad = lastCheckpointRef.current === BigInt(0);

      try {
        if (isFirstLoad) {
          // First load: fetch full state with cells
          const stateResult = await actor.get_state(currentGameId);

          if ('Ok' in stateResult && !cancelled) {
            const backendState = stateResult.Ok;
            setGameState(backendState);
            setLocalCells(backendState.cells);
            lastCheckpointRef.current = backendState.checkpoint_timestamp_ns;

            const myIdx = backendState.players.findIndex(
              p => p.toText() === myPrincipal?.toText()
            );
            if (myIdx >= 0) {
              setMyPlayerNum(myIdx + 1);
              setMyBalance(Number(backendState.balances[myIdx]));
            }
          }
        } else {
          // Subsequent syncs: use lightweight metadata check
          const metaResult = await actor.get_metadata(currentGameId);

          if ('Ok' in metaResult && !cancelled) {
            const meta = metaResult.Ok;
            const checkpointChanged = meta.checkpoint_timestamp_ns !== lastCheckpointRef.current;

            // Update player info from metadata
            const myIdx = meta.players.findIndex(
              p => p.toText() === myPrincipal?.toText()
            );
            if (myIdx >= 0) {
              setMyPlayerNum(myIdx + 1);
              setMyBalance(Number(meta.balances[myIdx]));
            }

            if (checkpointChanged) {
              // Checkpoint changed - need to fetch full state
              const stateResult = await actor.get_state(currentGameId);

              if ('Ok' in stateResult && !cancelled) {
                const backendState = stateResult.Ok;
                setGameState(backendState);
                setLocalCells(backendState.cells);
                lastCheckpointRef.current = backendState.checkpoint_timestamp_ns;
              }
            } else {
              // No change - just update generation display
              setGameState(prev => prev ? {
                ...prev,
                generation: meta.generation,
                players: meta.players,
                balances: Array.from(meta.balances),
                is_running: meta.is_running,
              } : prev);
            }
          }
        }
      } catch (err) {
        console.error('Backend sync error:', err);
      }
    };

    // Initial sync
    syncFromBackend();

    // Periodic sync every 5 seconds
    const syncInterval = setInterval(syncFromBackend, BACKEND_SYNC_MS);

    return () => {
      cancelled = true;
      clearInterval(syncInterval);
    };
  }, [actor, currentGameId, myPrincipal, isAuthenticated]);

  // Track if we have cells (stable reference to avoid unnecessary effect reruns)
  const hasCells = localCells.length > 0;

  // Local simulation - runs every 100ms for smooth visuals
  useEffect(() => {
    if (!isRunning || !hasCells) return;

    const localTick = setInterval(() => {
      setLocalCells(cells => stepLocalGeneration(cells));
    }, LOCAL_TICK_MS);

    return () => clearInterval(localTick);
  }, [isRunning, hasCells]);

  // Helper to draw cells within a region
  const drawCells = useCallback((
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    width: number,
    height: number,
    cellSize: number
  ) => {
    const cells = localCells;

    // Draw territory (owner > 0, regardless of alive)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const gridRow = startY + row;
        const gridCol = startX + col;
        const idx = gridRow * GRID_SIZE + gridCol;
        const cell = cells[idx];

        if (cell && cell.owner > 0) {
          ctx.fillStyle = TERRITORY_COLORS[cell.owner] || 'rgba(255,255,255,0.1)';
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    // Draw living cells
    const gap = cellSize > 2 ? 1 : 0;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const gridRow = startY + row;
        const gridCol = startX + col;
        const idx = gridRow * GRID_SIZE + gridCol;
        const cell = cells[idx];

        if (cell && cell.alive && cell.owner > 0) {
          ctx.fillStyle = PLAYER_COLORS[cell.owner] || '#FFFFFF';
          ctx.fillRect(
            col * cellSize,
            row * cellSize,
            cellSize - gap,
            cellSize - gap
          );
        }
      }
    }

    // Draw gold borders for cells with points (only in quadrant view where cells are large enough)
    if (cellSize > 3) {
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const gridRow = startY + row;
          const gridCol = startX + col;
          const idx = gridRow * GRID_SIZE + gridCol;
          const cell = cells[idx];

          if (cell && cell.points > 0) {
            const opacity = Math.min(
              GOLD_BORDER_MAX_OPACITY,
              GOLD_BORDER_MIN_OPACITY + (cell.points / 10) * 0.1
            );
            ctx.strokeStyle = `rgba(255, 215, 0, ${opacity})`;
            ctx.lineWidth = Math.min(3, 1 + Math.floor(cell.points / 5));
            ctx.strokeRect(
              col * cellSize + 1,
              row * cellSize + 1,
              cellSize - 2,
              cellSize - 2
            );
          }
        }
      }
    }
  }, [localCells]);

  // Draw 4x4 quadrant grid lines (overview mode)
  const drawQuadrantGrid = useCallback((ctx: CanvasRenderingContext2D, cellSize: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;

    for (let i = 1; i < QUADRANTS_PER_ROW; i++) {
      const pos = i * QUADRANT_SIZE * cellSize;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, GRID_SIZE * cellSize);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(GRID_SIZE * cellSize, pos);
      ctx.stroke();
    }
  }, []);

  // Draw cell grid lines (quadrant mode only)
  const drawGridLines = useCallback((ctx: CanvasRenderingContext2D, cellSize: number, gridWidth: number, gridHeight: number) => {
    if (cellSize < 4) return; // Skip grid lines when cells are too small

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    for (let i = 0; i <= gridWidth; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, gridHeight * cellSize);
      ctx.stroke();
    }
    for (let i = 0; i <= gridHeight; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(gridWidth * cellSize, i * cellSize);
      ctx.stroke();
    }
  }, []);

  // Draw preview cells with pulsing animation (handles both single mode and batch mode)
  const drawPreviewCells = useCallback((
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    cellSize: number,
    pulse: number
  ) => {
    const cells = localCells;
    const pulseAlpha = 0.4 + 0.4 * Math.sin((pulse / 60) * Math.PI * 2); // Pulse between 0.4 and 0.8
    // Use white when player number is not yet known from backend
    const playerColor = myPlayerNum !== null ? (PLAYER_COLORS[myPlayerNum] || '#FFFFFF') : '#FFFFFF';

    // Collect all pending cell positions for overlap detection between placements
    const allPendingCells: Set<string> = new Set();
    for (const placement of pendingPlacements) {
      for (const [gridCol, gridRow] of placement.cells) {
        allPendingCells.add(`${gridCol},${gridRow}`);
      }
    }

    // Count occurrences of each cell position to detect internal overlaps
    const cellCounts: Map<string, number> = new Map();
    for (const placement of pendingPlacements) {
      for (const [gridCol, gridRow] of placement.cells) {
        const key = `${gridCol},${gridRow}`;
        cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
      }
    }

    // Draw all pending placements
    for (const placement of pendingPlacements) {
      for (const [gridCol, gridRow] of placement.cells) {
        const localCol = gridCol - startX;
        const localRow = gridRow - startY;

        // Skip if outside current view
        if (localCol < 0 || localCol >= QUADRANT_SIZE || localRow < 0 || localRow >= QUADRANT_SIZE) continue;

        const idx = gridRow * GRID_SIZE + gridCol;
        const existingCell = cells[idx];
        const cellKey = `${gridCol},${gridRow}`;

        // Check for conflicts: alive cells OR duplicate pending cells
        const hasAliveConflict = existingCell && existingCell.alive;
        const hasDuplicateConflict = (cellCounts.get(cellKey) || 0) > 1;
        const hasConflict = hasAliveConflict || hasDuplicateConflict;

        if (hasConflict) {
          ctx.fillStyle = `rgba(255, 60, 60, ${pulseAlpha})`;
        } else {
          const rgb = playerColor.match(/\w\w/g)?.map(x => parseInt(x, 16)) || [57, 255, 20];
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${pulseAlpha})`;
        }

        const gap = cellSize > 2 ? 1 : 0;
        ctx.fillRect(localCol * cellSize, localRow * cellSize, cellSize - gap, cellSize - gap);

        ctx.strokeStyle = hasConflict ? '#FF3C3C' : '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(localCol * cellSize + 1, localRow * cellSize + 1, cellSize - 2, cellSize - 2);
        ctx.setLineDash([]);
      }
    }
  }, [localCells, myPlayerNum, pendingPlacements]);


  // Main draw function - simplified for quadrant-based navigation
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const { width: displayWidth, height: displayHeight } = canvasSizeRef.current;
    if (!canvas || displayWidth === 0 || displayHeight === 0 || localCells.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear canvas
    ctx.fillStyle = DEAD_COLOR;
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    // Use the smaller dimension to ensure square cells
    const canvasSize = Math.min(displayWidth, displayHeight);

    if (viewMode === 'overview') {
      // Overview: show all 512×512, each cell is tiny
      const cellSize = canvasSize / GRID_SIZE;

      // Center the grid if canvas is not square
      const offsetX = (displayWidth - canvasSize) / 2;
      const offsetY = (displayHeight - canvasSize) / 2;
      ctx.save();
      ctx.translate(offsetX, offsetY);

      drawCells(ctx, 0, 0, GRID_SIZE, GRID_SIZE, cellSize);
      drawQuadrantGrid(ctx, cellSize);

      // Highlight current quadrant position
      const qRow = viewY / QUADRANT_SIZE;
      const qCol = viewX / QUADRANT_SIZE;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        qCol * QUADRANT_SIZE * cellSize,
        qRow * QUADRANT_SIZE * cellSize,
        QUADRANT_SIZE * cellSize,
        QUADRANT_SIZE * cellSize
      );

      // Boundary
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, GRID_SIZE * cellSize, GRID_SIZE * cellSize);

      ctx.restore();
    } else {
      // Quadrant: show 128×128, cells are larger
      const cellSize = canvasSize / QUADRANT_SIZE;

      // Center the grid if canvas is not square
      const offsetX = (displayWidth - canvasSize) / 2;
      const offsetY = (displayHeight - canvasSize) / 2;
      ctx.save();
      ctx.translate(offsetX, offsetY);

      drawCells(ctx, viewX, viewY, QUADRANT_SIZE, QUADRANT_SIZE, cellSize);
      drawGridLines(ctx, cellSize, QUADRANT_SIZE, QUADRANT_SIZE);

      // Draw preview cells on top
      drawPreviewCells(ctx, viewX, viewY, cellSize, previewPulse);

      // Boundary
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize);

      ctx.restore();
    }
  }, [viewMode, viewX, viewY, localCells, drawCells, drawQuadrantGrid, drawGridLines, drawPreviewCells, previewPulse]);

  useEffect(() => { draw(); }, [draw]);

  // Click handler for quadrant-based navigation and preview placement
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!actor) return;
    if (isConfirmingPlacement) return; // Don't allow new clicks while confirming

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const { width: displayWidth, height: displayHeight } = canvasSizeRef.current;
    const canvasSize = Math.min(displayWidth, displayHeight);
    const offsetX = (displayWidth - canvasSize) / 2;
    const offsetY = (displayHeight - canvasSize) / 2;

    const x = e.clientX - rect.left - offsetX;
    const y = e.clientY - rect.top - offsetY;

    // Ignore clicks outside the grid
    if (x < 0 || y < 0 || x >= canvasSize || y >= canvasSize) return;

    if (viewMode === 'overview') {
      // Click in overview = jump to that quadrant
      const cellSize = canvasSize / GRID_SIZE;
      const gridCol = Math.floor(x / cellSize);
      const gridRow = Math.floor(y / cellSize);
      const quadrant = Math.floor(gridRow / QUADRANT_SIZE) * QUADRANTS_PER_ROW
                     + Math.floor(gridCol / QUADRANT_SIZE);
      jumpToQuadrant(quadrant);
    } else {
      // Click in quadrant = set preview or add to batch
      const cellSize = canvasSize / QUADRANT_SIZE;
      const localCol = Math.floor(x / cellSize);
      const localRow = Math.floor(y / cellSize);
      const gridCol = viewX + localCol;
      const gridRow = viewY + localRow;

      // Validate coordinates
      if (gridCol < 0 || gridCol >= GRID_SIZE || gridRow < 0 || gridRow >= GRID_SIZE) return;

      // Convert rotated pattern to absolute coordinates with toroidal wrapping
      const cellsToPlace: [number, number][] = rotatedPattern.map(([dx, dy]) => [
        (gridCol + dx + GRID_SIZE) % GRID_SIZE,
        (gridRow + dy + GRID_SIZE) % GRID_SIZE
      ]);

      // Add pattern to pending placements
      const newPlacement: PendingPlacement = {
        id: `placement-${nextPlacementIdRef.current++}`,
        cells: cellsToPlace,
        patternName: selectedPattern.name,
        centroid: [gridCol, gridRow],
      };
      setPendingPlacements(prev => [...prev, newPlacement]);
      setPlacementError(null);
    }
  };

  // Confirm placement - send all pending placements to backend
  // Uses event-driven architecture: sends expected_generation for optimistic concurrency
  const confirmPlacement = useCallback(async () => {
    const cellsToPlace: [number, number][] = pendingPlacements.flatMap(p => p.cells);

    if (!actor || cellsToPlace.length === 0 || isConfirmingPlacement) return;

    const cost = cellsToPlace.length;

    // Check if player has enough points
    if (myBalance < cost) {
      setPlacementError(`Not enough points. Need ${cost}, have ${myBalance}`);
      return;
    }

    // Check for conflicts with current local state
    const conflicts = cellsToPlace.filter(([col, row]) => {
      const idx = row * GRID_SIZE + col;
      return localCells[idx]?.alive;
    });

    if (conflicts.length > 0) {
      setPlacementError(`${conflicts.length} cell(s) overlap with existing alive cells. Reposition or wait for cells to die.`);
      return;
    }

    // Check for internal overlaps between placements
    if (pendingPlacements.length > 1) {
      const seen = new Set<string>();
      let duplicates = 0;
      for (const [col, row] of cellsToPlace) {
        const key = `${col},${row}`;
        if (seen.has(key)) duplicates++;
        seen.add(key);
      }
      if (duplicates > 0) {
        setPlacementError(`${duplicates} cell(s) overlap between placements. Remove overlapping patterns.`);
        return;
      }
    }

    // Calculate expected generation from checkpoint
    const now = Date.now();
    const checkpointTimeMs = gameState?.checkpoint_timestamp_ns
      ? Number(gameState.checkpoint_timestamp_ns) / 1_000_000
      : now;
    const elapsedSecs = (now - checkpointTimeMs) / 1000;
    const checkpointGen = gameState?.generation ? Number(gameState.generation) : 0;
    const expectedGeneration = BigInt(Math.floor(checkpointGen + elapsedSecs * 10));

    setIsConfirmingPlacement(true);
    setPlacementError(null);

    try {
      const result = await actor.place_cells(currentGameId, cellsToPlace, expectedGeneration);

      if ('Err' in result) {
        let errorMsg = result.Err;
        if (errorMsg.includes('alive cells')) {
          errorMsg = 'Placement failed: Another player placed cells there, or the game evolved. Try a different position.';
        } else if (errorMsg.includes('Insufficient')) {
          errorMsg = 'Not enough points. Your balance may have changed.';
        } else if (errorMsg.includes('Generation mismatch')) {
          errorMsg = 'Game state changed. Refreshing... Please try again.';
        }
        setPlacementError(errorMsg);
      } else {
        const { placed_count, new_generation, new_timestamp_ns } = result.Ok;

        // Immediately fetch state to get our actual player number
        // This is critical for new players who don't have a player number yet
        let actualOwner = myPlayerNum ?? 1;
        try {
          const stateResult = await actor.get_state(currentGameId);
          if ('Ok' in stateResult) {
            const backendState = stateResult.Ok;
            const myIdx = backendState.players.findIndex(
              p => p.toText() === myPrincipal?.toText()
            );
            if (myIdx >= 0) {
              actualOwner = myIdx + 1;
              setMyPlayerNum(actualOwner);
              setMyBalance(Number(backendState.balances[myIdx]));
            }
            // Sync cells from backend to ensure correct ownership
            setLocalCells(backendState.cells);
            lastCheckpointRef.current = backendState.checkpoint_timestamp_ns;
            setGameState(backendState);
          }
        } catch (syncErr) {
          console.error('Failed to sync after placement:', syncErr);
          // Fall back to local update if sync fails
          setGameState(prev => prev ? {
            ...prev,
            generation: new_generation,
            checkpoint_timestamp_ns: new_timestamp_ns,
          } : prev);
          lastCheckpointRef.current = new_timestamp_ns;
          setLocalCells(cells => {
            const newCells = [...cells];
            for (const [cx, cy] of cellsToPlace) {
              const idx = cy * GRID_SIZE + cx;
              if (idx >= 0 && idx < newCells.length) {
                newCells[idx] = {
                  ...newCells[idx],
                  alive: true,
                  owner: actualOwner,
                };
              }
            }
            return newCells;
          });
          setMyBalance(prev => prev - cost);
        }

        // Clear pending placements
        setPendingPlacements([]);
        setPlacementError(null);

        console.log(`Placed ${placed_count} cells, new generation: ${new_generation}`);
      }
    } catch (err) {
      console.error('Place error:', err);
      setPlacementError(`Network error: ${err}. Please try again.`);
    } finally {
      setIsConfirmingPlacement(false);
    }
  }, [actor, pendingPlacements, isConfirmingPlacement, myBalance, localCells, currentGameId, myPlayerNum, gameState]);

  // Clear all pending placements
  const cancelPreview = useCallback(() => {
    setPendingPlacements([]);
    setPlacementError(null);
  }, []);

  // Remove a specific placement from batch (by ID)
  const removePlacement = useCallback((placementId: string) => {
    setPendingPlacements(prev => prev.filter(p => p.id !== placementId));
  }, []);

  // Keyboard navigation and preview shortcuts
  // NOTE: This useEffect must come AFTER confirmPlacement and cancelPreview are defined
  // to avoid temporal dead zone issues in the minified bundle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in input
      if (e.target instanceof HTMLInputElement) return;

      const hasPendingPlacements = pendingPlacements.length > 0;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          if (viewMode === 'quadrant' && !hasPendingPlacements) navigateQuadrant('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          if (viewMode === 'quadrant' && !hasPendingPlacements) navigateQuadrant('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          if (viewMode === 'quadrant' && !hasPendingPlacements) navigateQuadrant('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          if (viewMode === 'quadrant' && !hasPendingPlacements) navigateQuadrant('right');
          break;
        case ' ':  // Space to toggle view mode
        case 'Tab':
          e.preventDefault();
          if (!hasPendingPlacements) toggleViewMode();
          break;
        case 'Enter':
          // Confirm all pending placements
          if (hasPendingPlacements && !isConfirmingPlacement) {
            e.preventDefault();
            confirmPlacement();
          }
          break;
        case 'Escape':
          // Clear all pending placements
          if (hasPendingPlacements) {
            e.preventDefault();
            cancelPreview();
          }
          break;
        case 'r':
        case 'R':
          // Rotate pattern 90° clockwise
          if (viewMode === 'quadrant') {
            e.preventDefault();
            cycleRotation();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, navigateQuadrant, toggleViewMode, pendingPlacements.length, isConfirmingPlacement, confirmPlacement, cancelPreview, cycleRotation]);

  // Controls - local simulation only
  const handlePlayPause = () => {
    setIsRunning(!isRunning);
  };

  const handleStep = () => {
    // Manually advance local simulation by one generation
    if (localCells.length > 0) {
      setLocalCells(cells => stepLocalGeneration(cells));
    }
  };

  const handleClear = () => {
    // Clear local cells only (backend state persists)
    setIsRunning(false);
    setLocalCells(cells => cells.map(() => ({ owner: 0, points: 0, alive: false })));
  };

  // Cell counts - uses localCells for live updates
  const cellCounts = localCells.reduce((acc, cell) => {
    if (cell.alive && cell.owner > 0) acc[cell.owner] = (acc[cell.owner] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const territoryCounts = localCells.reduce((acc, cell) => {
    if (cell.owner > 0) acc[cell.owner] = (acc[cell.owner] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  // Points stored in territory (sum of cell.points per player)
  const pointsInTerritory = localCells.reduce((acc, cell) => {
    if (cell.owner > 0 && cell.points > 0) acc[cell.owner] = (acc[cell.owner] || 0) + cell.points;
    return acc;
  }, {} as Record<number, number>);

  // Total points in game (for conservation check)
  const totalPointsInCells = Object.values(pointsInTerritory).reduce((a, b) => a + b, 0);
  // Convert BigUint64Array/bigint[] to regular number array for safe iteration
  const balancesArray = gameState?.balances ? Array.from(gameState.balances).map(b => Number(b)) : [];
  const totalPointsInWallets = balancesArray.reduce((a, b) => a + b, 0);
  const totalPoints = totalPointsInCells + totalPointsInWallets;

  const filteredPatterns = selectedCategory === 'all'
    ? PATTERNS : PATTERNS.filter(p => p.category === selectedCategory);

  // Memoized Minimap - renders quadrant heatmap
  const minimapRef = useRef<HTMLCanvasElement>(null);

  // Draw minimap when localCells or currentQuadrant changes
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas || localCells.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const quadSize = size / QUADRANTS_PER_ROW;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);

    // Draw cell density per quadrant (heatmap)
    for (let q = 0; q < TOTAL_QUADRANTS; q++) {
      const qRow = Math.floor(q / QUADRANTS_PER_ROW);
      const qCol = q % QUADRANTS_PER_ROW;

      // Calculate density for this quadrant
      const startY = qRow * QUADRANT_SIZE;
      const startX = qCol * QUADRANT_SIZE;
      let livingCells = 0;
      for (let row = startY; row < startY + QUADRANT_SIZE; row++) {
        for (let col = startX; col < startX + QUADRANT_SIZE; col++) {
          const cell = localCells[row * GRID_SIZE + col];
          if (cell && cell.alive && cell.owner > 0) livingCells++;
        }
      }
      const density = livingCells / (QUADRANT_SIZE * QUADRANT_SIZE);

      // Color based on density
      const alpha = Math.min(0.8, density * 2);
      ctx.fillStyle = `rgba(57, 255, 20, ${alpha})`;
      ctx.fillRect(qCol * quadSize + 1, qRow * quadSize + 1, quadSize - 2, quadSize - 2);
    }

    // Highlight current quadrant
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    const curRow = Math.floor(currentQuadrant / QUADRANTS_PER_ROW);
    const curCol = currentQuadrant % QUADRANTS_PER_ROW;
    ctx.strokeRect(curCol * quadSize, curRow * quadSize, quadSize, quadSize);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= QUADRANTS_PER_ROW; i++) {
      const pos = i * quadSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }
  }, [localCells, currentQuadrant]);

  const handleMinimapClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = minimapRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const quadSize = canvas.width / QUADRANTS_PER_ROW;

    const qCol = Math.floor(x / quadSize);
    const qRow = Math.floor(y / quadSize);
    const quadrant = qRow * QUADRANTS_PER_ROW + qCol;

    jumpToQuadrant(quadrant);
  }, [jumpToQuadrant]);

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Conway's Game of Life</h1>
          <p className="text-gray-400">{GRID_WIDTH}x{GRID_HEIGHT} Persistent World</p>
          <p className="text-gray-500 text-sm mt-2">10 players max - your cells, your territory</p>
        </div>
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="px-6 py-3 rounded-lg font-mono text-lg bg-dfinity-turquoise/20 text-dfinity-turquoise border border-dfinity-turquoise/50 hover:bg-dfinity-turquoise/30 transition-all disabled:opacity-50"
        >
          {isLoading ? 'Connecting...' : 'Login with Internet Identity'}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    );
  }

  // Game view - fullscreen with collapsible sidebar
  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Error display - keep at top */}
      {error && (
        <div className="p-2 bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar - inline to prevent remounting */}
        <div className={`
          hidden lg:flex flex-col
          ${sidebarCollapsed ? 'w-12' : 'w-72'}
          transition-all duration-300 ease-in-out
          bg-black border-r border-white/20
          overflow-hidden flex-shrink-0
        `}>
          {/* Toggle button */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-3 hover:bg-white/10 flex items-center justify-center border-b border-white/20"
          >
            <span className="text-gray-400 text-lg">{sidebarCollapsed ? '»' : '«'}</span>
          </button>

          {/* Content - hidden when collapsed */}
          <div className={`${sidebarCollapsed ? 'hidden' : 'flex flex-col'} flex-1 overflow-y-auto p-3`}>
            {/* Info Section */}
            <div className="mb-4">
              <h1 className="text-lg font-bold text-white">Game of Life</h1>
              <p className="text-gray-500 text-xs">
                {myPlayerNum ? (
                  <>You are Player {myPlayerNum} <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: PLAYER_COLORS[myPlayerNum] }}></span></>
                ) : (
                  'Place cells to join'
                )}
              </p>
              <div className="mt-2 text-sm font-mono space-y-1">
                <div className="text-gray-400">
                  Gen: <span className="text-dfinity-turquoise">{gameState?.generation.toString() || 0}</span>
                </div>
                <div className="text-gray-400">Players: {gameState?.players.length || 0}/10</div>
              </div>
              {/* Player stats table */}
              <div className="mt-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-normal pb-1"></th>
                      <th className="text-right font-normal pb-1 px-1">Terr</th>
                      <th className="text-right font-normal pb-1 px-1">Cells</th>
                      <th className="text-right font-normal pb-1 px-1">Pts</th>
                      <th className="text-right font-normal pb-1 px-1">Wallet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balancesArray.map((wallet, idx) => {
                      const playerNum = idx + 1;
                      const territory = territoryCounts[playerNum] || 0;
                      const cells = cellCounts[playerNum] || 0;
                      const pts = pointsInTerritory[playerNum] || 0;
                      return (
                        <tr key={playerNum} className="border-t border-gray-800">
                          <td className="py-0.5">
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: PLAYER_COLORS[playerNum] }} />
                              <span className="text-gray-400">P{playerNum}</span>
                            </div>
                          </td>
                          <td className="text-right px-1" style={{ color: PLAYER_COLORS[playerNum], opacity: 0.6 }}>
                            {territory.toLocaleString()}
                          </td>
                          <td className="text-right px-1" style={{ color: PLAYER_COLORS[playerNum] }}>
                            {cells.toLocaleString()}
                          </td>
                          <td className="text-right px-1 text-yellow-500">
                            {pts}
                          </td>
                          <td className="text-right px-1 text-green-400">
                            {wallet.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="text-xs text-gray-600 mt-2 border-t border-gray-700 pt-2">
                  Total: <span className="text-yellow-500">{totalPoints.toLocaleString()}</span> pts
                  <span className="text-gray-600 ml-1">({totalPointsInCells} + {totalPointsInWallets})</span>
                </div>
              </div>
            </div>

            {/* Minimap - inline canvas */}
            <div className="minimap-container mb-4">
              <div className="text-xs text-gray-400 mb-1">World Map</div>
              <canvas
                ref={minimapRef}
                width={120}
                height={120}
                className="cursor-pointer border border-gray-700 rounded"
                onClick={handleMinimapClick}
              />
              <div className="text-xs text-gray-500 mt-1">
                Q{currentQuadrant} ({viewX}, {viewY})
              </div>
            </div>

            {/* Navigation Controls - inline */}
            <div className="navigation-controls mb-4">
              <button
                onClick={toggleViewMode}
                className="w-full mb-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-mono"
              >
                {viewMode === 'overview' ? 'Enter Quadrant' : 'View Overview'}
              </button>

              {viewMode === 'quadrant' && (
                <div className="grid grid-cols-3 gap-1 mt-2">
                  <div />
                  <button onClick={() => navigateQuadrant('up')} className="p-2 bg-white/10 hover:bg-white/20 rounded text-white text-center">^</button>
                  <div />
                  <button onClick={() => navigateQuadrant('left')} className="p-2 bg-white/10 hover:bg-white/20 rounded text-white text-center">&lt;</button>
                  <div className="p-2 bg-gray-800 rounded text-gray-600 text-center">o</div>
                  <button onClick={() => navigateQuadrant('right')} className="p-2 bg-white/10 hover:bg-white/20 rounded text-white text-center">&gt;</button>
                  <div />
                  <button onClick={() => navigateQuadrant('down')} className="p-2 bg-white/10 hover:bg-white/20 rounded text-white text-center">v</button>
                  <div />
                </div>
              )}

              <div className="text-xs text-gray-500 mt-2">
                {viewMode === 'quadrant'
                  ? 'Arrow keys / WASD to navigate'
                  : 'Click quadrant to enter'}
              </div>
            </div>

            {/* Pattern Section */}
            <div className="flex-1">
              <div className="text-xs text-gray-400 mb-2">Patterns</div>
              {/* Category filter buttons - vertical stack */}
              <div className="flex flex-col gap-1 mb-3">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded text-xs font-mono transition-all text-left ${
                    selectedCategory === 'all'
                      ? 'bg-white/20 text-white border border-white/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  All Patterns
                </button>
                {(Object.keys(CATEGORY_INFO) as PatternCategory[]).map((cat) => {
                  const info = CATEGORY_INFO[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded text-xs font-mono transition-all border text-left ${
                        selectedCategory === cat ? info.color : 'text-gray-400 border-transparent hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {info.icon} {info.label}
                    </button>
                  );
                })}
              </div>
              {/* Pattern buttons - grid layout */}
              <div className="grid grid-cols-2 gap-1">
                {filteredPatterns.map((pattern) => {
                  const catInfo = CATEGORY_INFO[pattern.category];
                  const isSelected = selectedPattern.name === pattern.name;
                  return (
                    <button
                      key={pattern.name}
                      onClick={() => setSelectedPattern(pattern)}
                      className={`px-2 py-1.5 rounded text-xs font-mono transition-all border ${
                        isSelected
                          ? catInfo.color + ' ring-1 ring-white/30'
                          : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                      }`}
                      title={pattern.description}
                    >
                      {pattern.name}
                    </button>
                  );
                })}
              </div>
              {/* Selected pattern info */}
              <div className="mt-3 pt-3 border-t border-white/10 text-xs">
                <div className={`font-mono ${CATEGORY_INFO[selectedPattern.category].color.split(' ')[0]}`}>
                  {selectedPattern.name} ({parsedPattern.length} cells)
                </div>
                <div className="text-gray-500 mt-1">{selectedPattern.description}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-400">Rotation:</span>
                  <button
                    onClick={cycleRotation}
                    className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-white font-mono"
                  >
                    {['0°', '90°', '180°', '270°'][rotation]}
                  </button>
                  <span className="text-gray-500 text-[10px]">(R key)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Collapsed indicators - shown when collapsed */}
          <div className={`${sidebarCollapsed ? 'flex flex-col items-center py-4 gap-2' : 'hidden'}`}>
            <div className="text-xs text-gray-400">G</div>
            <div className="text-dfinity-turquoise text-xs font-mono">{gameState?.generation.toString() || 0}</div>
            <div className="text-xs text-gray-400 mt-2">P</div>
            <div className="text-white text-xs font-mono">{gameState?.players.length || 0}</div>
            {myPlayerNum && (
              <>
                <div className="text-xs text-gray-400 mt-2">You</div>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PLAYER_COLORS[myPlayerNum] }} />
              </>
            )}
          </div>
        </div>

        {/* Canvas Container */}
        <div className="flex-1 flex flex-col relative bg-black">
          {/* View mode toggle - top right overlay */}
          <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-black/70 rounded-lg p-2">
            <button onClick={toggleViewMode}
              className="px-3 h-8 flex items-center justify-center rounded bg-white/10 text-white hover:bg-white/20 text-xs font-mono">
              {viewMode === 'overview' ? 'Enter Quadrant' : 'Overview'}
            </button>
            <span className="text-white text-xs font-mono px-2">
              Q{currentQuadrant}
            </span>
          </div>

          {/* Help text overlay - bottom left */}
          <div className="absolute bottom-2 left-2 z-10 bg-black/70 rounded px-2 py-1 text-xs text-gray-400 font-mono">
            {viewMode === 'overview'
              ? `${GRID_SIZE}x${GRID_SIZE} | Click quadrant to enter | Space to toggle`
              : pendingPlacements.length > 0
              ? `${pendingPlacements.length} pattern${pendingPlacements.length > 1 ? 's' : ''} pending | Enter=Confirm | Esc=Clear | R=Rotate`
              : `Q${currentQuadrant} | Click to place | R=Rotate (${['0°', '90°', '180°', '270°'][rotation]})`}
          </div>

          {/* Pending placements panel */}
          {pendingPlacements.length > 0 && viewMode === 'quadrant' && (
            <div className="absolute top-12 left-2 z-10 bg-black/90 border border-white/30 text-white px-4 py-3 rounded-lg text-sm max-w-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-dfinity-turquoise">
                  {pendingPlacements.length} pattern{pendingPlacements.length > 1 ? 's' : ''}
                </span>
                <span className="text-gray-400">
                  Cost: <span className={myBalance >= pendingPlacements.reduce((sum, p) => sum + p.cells.length, 0) ? 'text-green-400' : 'text-red-400'}>
                    {pendingPlacements.reduce((sum, p) => sum + p.cells.length, 0)}
                  </span> / {myBalance} pts
                </span>
              </div>

              {/* List of pending placements */}
              <div className="max-h-32 overflow-y-auto mb-2 space-y-1">
                {pendingPlacements.map((placement, idx) => (
                  <div key={placement.id} className="flex items-center justify-between bg-white/5 px-2 py-1 rounded text-xs">
                    <span className="text-gray-300">
                      {idx + 1}. {placement.patternName} ({placement.cells.length} cells)
                    </span>
                    <button
                      onClick={() => removePlacement(placement.id)}
                      className="text-red-400 hover:text-red-300 px-1"
                      title="Remove this placement"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>

              {/* Next pattern preview with rotation */}
              <div className="flex items-center gap-3 mb-2 p-2 bg-white/5 rounded">
                <div className="flex-shrink-0">
                  <PatternPreview pattern={rotatedPattern} color={myPlayerNum !== null ? PLAYER_COLORS[myPlayerNum] : '#FFFFFF'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400">Next: {selectedPattern.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={cycleRotation}
                      className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-white font-mono text-xs"
                    >
                      {['0°', '90°', '180°', '270°'][rotation]}
                    </button>
                    <span className="text-gray-500 text-[10px]">R to rotate</span>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {placementError && (
                <div className="text-red-400 text-xs mb-2 bg-red-500/20 px-2 py-1 rounded">
                  {placementError}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={confirmPlacement}
                  disabled={isConfirmingPlacement || myBalance < pendingPlacements.reduce((sum, p) => sum + p.cells.length, 0)}
                  className={`px-4 py-1.5 rounded font-mono text-sm transition-all ${
                    isConfirmingPlacement
                      ? 'bg-gray-600 text-gray-400 cursor-wait'
                      : myBalance < pendingPlacements.reduce((sum, p) => sum + p.cells.length, 0)
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-500 text-white'
                  }`}
                >
                  {isConfirmingPlacement ? 'Placing...' : pendingPlacements.length > 1 ? 'Confirm All' : 'Confirm'}
                </button>
                <button
                  onClick={cancelPreview}
                  disabled={isConfirmingPlacement}
                  className="px-4 py-1.5 rounded font-mono text-sm bg-gray-700 hover:bg-gray-600 text-white transition-all disabled:opacity-50"
                >
                  {pendingPlacements.length > 1 ? 'Clear All' : 'Cancel'}
                </button>
              </div>

              <div className="text-xs text-gray-500 mt-2">
                Click grid to add more patterns
              </div>
            </div>
          )}

          {/* Placement error toast (when no placements pending) */}
          {placementError && pendingPlacements.length === 0 && (
            <div className="absolute top-12 left-2 z-10 bg-red-500/80 text-white px-3 py-2 rounded text-sm flex items-center gap-2">
              {placementError}
              <button onClick={() => setPlacementError(null)} className="font-bold hover:text-red-200">x</button>
            </div>
          )}

          {/* Canvas */}
          <div ref={containerRef} className="flex-1 w-full h-full min-h-0">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onContextMenu={(e) => e.preventDefault()}
              className={`w-full h-full ${viewMode === 'quadrant' ? 'cursor-crosshair' : 'cursor-pointer'}`}
              style={{ display: 'block' }}
            />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar - inline to prevent remounting */}
      <div className="lg:hidden bg-black border-t border-white/20">
        {/* Collapsed view */}
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-gray-400">Q{currentQuadrant}</span>
            <span className="text-gray-400">Gen: <span className="text-dfinity-turquoise">{gameState?.generation.toString() || 0}</span></span>
            {myPlayerNum && (
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: PLAYER_COLORS[myPlayerNum] }} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleViewMode}
              className="px-2 py-1 text-xs bg-white/10 rounded text-white"
            >
              {viewMode === 'overview' ? 'Enter' : 'Map'}
            </button>
            <button
              onClick={() => setMobileExpanded(!mobileExpanded)}
              className="p-2 text-gray-400 hover:text-white"
            >
              {mobileExpanded ? 'v' : '^'}
            </button>
          </div>
        </div>

        {/* Expanded view */}
        {mobileExpanded && (
          <div className="p-3 border-t border-white/10 max-h-64 overflow-y-auto">
            {/* Navigation d-pad for mobile (quadrant mode only) */}
            {viewMode === 'quadrant' && (
              <div className="flex items-center gap-4 mb-3">
                <div className="grid grid-cols-3 gap-1">
                  <div />
                  <button onClick={() => navigateQuadrant('up')} className="w-8 h-8 bg-white/10 rounded text-white text-center">^</button>
                  <div />
                  <button onClick={() => navigateQuadrant('left')} className="w-8 h-8 bg-white/10 rounded text-white text-center">&lt;</button>
                  <div className="w-8 h-8 bg-gray-800 rounded text-gray-600 text-center leading-8">o</div>
                  <button onClick={() => navigateQuadrant('right')} className="w-8 h-8 bg-white/10 rounded text-white text-center">&gt;</button>
                  <div />
                  <button onClick={() => navigateQuadrant('down')} className="w-8 h-8 bg-white/10 rounded text-white text-center">v</button>
                  <div />
                </div>
                <div className="text-xs text-gray-500">
                  Q{currentQuadrant}<br/>
                  ({viewX}, {viewY})
                </div>
              </div>
            )}

            {/* Territory/cell stats in row */}
            <div className="flex gap-4 mb-3 text-xs overflow-x-auto">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Territory:</span>
                {Object.entries(territoryCounts).slice(0, 4).map(([player, count]) => (
                  <div key={player} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm opacity-50" style={{ backgroundColor: PLAYER_COLORS[parseInt(player)] }} />
                    <span style={{ color: PLAYER_COLORS[parseInt(player)] }}>{count}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Cells:</span>
                {Object.entries(cellCounts).slice(0, 4).map(([player, count]) => (
                  <div key={`cell-${player}`} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: PLAYER_COLORS[parseInt(player)] }} />
                    <span style={{ color: PLAYER_COLORS[parseInt(player)] }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Category filters */}
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-1 rounded text-xs font-mono whitespace-nowrap ${
                  selectedCategory === 'all' ? 'bg-white/20 text-white' : 'text-gray-400'
                }`}
              >
                All
              </button>
              {(Object.keys(CATEGORY_INFO) as PatternCategory[]).map((cat) => {
                const info = CATEGORY_INFO[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-1 rounded text-xs font-mono whitespace-nowrap border ${
                      selectedCategory === cat ? info.color : 'text-gray-400 border-transparent'
                    }`}
                  >
                    {info.icon} {info.label}
                  </button>
                );
              })}
            </div>
            {/* Horizontal scrolling pattern selector */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {filteredPatterns.map((pattern) => {
                const catInfo = CATEGORY_INFO[pattern.category];
                const isSelected = selectedPattern.name === pattern.name;
                return (
                  <button
                    key={pattern.name}
                    onClick={() => setSelectedPattern(pattern)}
                    className={`px-3 py-1.5 rounded text-xs font-mono whitespace-nowrap border ${
                      isSelected
                        ? catInfo.color + ' ring-1 ring-white/30'
                        : 'bg-white/5 text-gray-300 border-white/10'
                    }`}
                  >
                    {pattern.name}
                  </button>
                );
              })}
            </div>
            {/* Selected pattern info */}
            <div className="text-xs text-gray-400 mt-2 flex items-center gap-2 flex-wrap">
              <span>
                Selected: <span className={CATEGORY_INFO[selectedPattern.category].color.split(' ')[0]}>{selectedPattern.name}</span> ({parsedPattern.length} cells)
              </span>
              <button
                onClick={cycleRotation}
                className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-white font-mono text-[10px]"
              >
                {['0°', '90°', '180°', '270°'][rotation]}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
