import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { Actor, HttpAgent, ActorSubclass } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory } from '../declarations/life1_backend';
import type { _SERVICE, GameState, GameInfo, GameStatus } from '../declarations/life1_backend/life1_backend.did.d';

const LIFE1_CANISTER_ID = 'pijnb-7yaaa-aaaae-qgcuq-cai';

// Rendering constants
const BASE_CELL_SIZE = 10;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const DEAD_COLOR = '#000000';

// Player colors
const PLAYER_COLORS: Record<number, string> = {
  1: '#39FF14', // Green
  2: '#FF3939', // Red
  3: '#3939FF', // Blue
  4: '#FFD700', // Gold
};

const TERRITORY_COLORS: Record<number, string> = {
  1: 'rgba(57, 255, 20, 0.15)',
  2: 'rgba(255, 57, 57, 0.15)',
  3: 'rgba(57, 57, 255, 0.15)',
  4: 'rgba(255, 215, 0, 0.15)',
};

// Pattern types
type PatternCategory = 'gun' | 'spaceship' | 'defense' | 'bomb' | 'oscillator';

interface PatternInfo {
  name: string;
  rle: string;
  category: PatternCategory;
  description: string;
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

// Pattern library (simplified)
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

export const Life: React.FC = () => {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  // Pattern state
  const [selectedPattern, setSelectedPattern] = useState<PatternInfo>(PATTERNS[0]);
  const [selectedCategory, setSelectedCategory] = useState<PatternCategory | 'all'>('all');
  const [parsedPattern, setParsedPattern] = useState<[number, number][]>([]);

  // View state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Auth state
  const [mode, setMode] = useState<'lobby' | 'game'>('lobby');
  const [authClient, setAuthClient] = useState<AuthClient | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [actor, setActor] = useState<ActorSubclass<_SERVICE> | null>(null);
  const [myPrincipal, setMyPrincipal] = useState<Principal | null>(null);

  // Lobby state
  const [games, setGames] = useState<GameInfo[]>([]);
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(null);
  const [newGameName, setNewGameName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Game state from backend
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayerNum, setMyPlayerNum] = useState(1);
  const [gridSize, setGridSize] = useState({ rows: 150, cols: 200 });

  // Simulation control
  const [isRunning, setIsRunning] = useState(false);
  const [, forceRender] = useState(0);

  // Parse pattern on selection change
  useEffect(() => {
    setParsedPattern(parseRLE(selectedPattern.rle));
  }, [selectedPattern]);

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
        width: 200, height: 150, max_players: 4, generations_limit: []
      });
      if ('Ok' in result) {
        const gameId = result.Ok;
        await actor.start_game(gameId);
        setCurrentGameId(gameId);
        setMyPlayerNum(1);
        setGridSize({ rows: 150, cols: 200 });
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
          setGridSize({ rows: stateResult.Ok.grid.length, cols: stateResult.Ok.grid[0]?.length || 200 });
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
    if (mode !== 'game') return;
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
  }, [mode]);

  // Single coordinated loop - either step (when running) or poll (when paused)
  // Steps 5 generations at a time for ~10 gen/sec with IC latency
  useEffect(() => {
    if (!actor || currentGameId === null || mode !== 'game') return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;

      try {
        if (isRunning) {
          // Step 5 generations at a time for faster playback
          const result = await actor.step(currentGameId, 5);
          if ('Ok' in result && !cancelled) {
            setGameState(result.Ok);
          }
        } else {
          // Just poll for state (to see other players' placements)
          const result = await actor.get_state(currentGameId);
          if ('Ok' in result && !cancelled) {
            setGameState(result.Ok);
            // Sync running state from backend (another player might have started)
            if (result.Ok.is_running !== isRunning) {
              setIsRunning(result.Ok.is_running);
            }
          }
        }
      } catch (err) {
        console.error('Tick error:', err);
      }

      // Schedule next tick after this one completes
      // Minimal delay when running - IC latency will naturally throttle to ~2 calls/sec
      // 5 gens × 2 calls/sec = ~10 gen/sec
      if (!cancelled) {
        timeoutId = setTimeout(tick, isRunning ? 50 : 1000);
      }
    };

    // Start the loop
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [actor, currentGameId, mode, isRunning]);

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const { width: displayWidth, height: displayHeight } = canvasSizeRef.current;
    if (!canvas || displayWidth === 0 || displayHeight === 0 || !gameState) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { grid, territory } = gameState;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DEAD_COLOR;
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);

    const cellSize = BASE_CELL_SIZE * zoom;
    const startCol = Math.max(0, Math.floor(-panOffset.x / cellSize));
    const endCol = Math.min(gridSize.cols, Math.ceil((displayWidth - panOffset.x) / cellSize));
    const startRow = Math.max(0, Math.floor(-panOffset.y / cellSize));
    const endRow = Math.min(gridSize.rows, Math.ceil((displayHeight - panOffset.y) / cellSize));

    // Draw territory
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const owner = territory[row]?.[col];
        if (owner > 0) {
          ctx.fillStyle = TERRITORY_COLORS[owner] || 'rgba(255,255,255,0.1)';
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    // Draw grid lines
    if (zoom >= 0.5) {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      for (let i = startCol; i <= endCol; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, startRow * cellSize);
        ctx.lineTo(i * cellSize, endRow * cellSize);
        ctx.stroke();
      }
      for (let i = startRow; i <= endRow; i++) {
        ctx.beginPath();
        ctx.moveTo(startCol * cellSize, i * cellSize);
        ctx.lineTo(endCol * cellSize, i * cellSize);
        ctx.stroke();
      }
    }

    // Draw cells
    const cellPadding = Math.max(1, zoom * 0.5);
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const owner = grid[row]?.[col];
        if (owner > 0) {
          ctx.fillStyle = PLAYER_COLORS[owner] || '#FFFFFF';
          ctx.fillRect(
            col * cellSize + cellPadding,
            row * cellSize + cellPadding,
            cellSize - cellPadding * 2,
            cellSize - cellPadding * 2
          );
        }
      }
    }

    // Boundary
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, gridSize.cols * cellSize, gridSize.rows * cellSize);

    ctx.restore();
  }, [gameState, gridSize, zoom, panOffset]);

  useEffect(() => { draw(); }, [draw]);

  // Zoom/pan handlers
  const handleZoomIn = () => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  const handleZoomOut = () => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  const handleResetView = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }); };
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const handleMouseUp = () => setIsPanning(false);
  const handleMouseLeave = () => setIsPanning(false);

  // Place cells on click
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning || !actor || currentGameId === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cellSize = BASE_CELL_SIZE * zoom;
    const col = Math.floor((x - panOffset.x) / cellSize);
    const row = Math.floor((y - panOffset.y) / cellSize);

    if (col < 0 || col >= gridSize.cols || row < 0 || row >= gridSize.rows) return;

    // Convert pattern to absolute coordinates
    const cells: [number, number][] = parsedPattern.map(([dx, dy]) => [col + dx, row + dy]);

    try {
      await actor.place_cells(currentGameId, cells);
    } catch (err) {
      console.error('Place error:', err);
    }
  };

  // Controls
  const handlePlayPause = async () => {
    if (!actor || currentGameId === null) return;
    try {
      await actor.set_running(currentGameId, !isRunning);
      setIsRunning(!isRunning);
    } catch (err) {
      console.error('Set running error:', err);
    }
  };

  const handleStep = async () => {
    if (!actor || currentGameId === null) return;
    try {
      const result = await actor.step(currentGameId, 1);
      if ('Ok' in result) {
        setGameState(result.Ok);
      }
    } catch (err) {
      console.error('Step error:', err);
    }
  };

  const handleClear = async () => {
    if (!actor || currentGameId === null) return;
    try {
      await actor.clear_grid(currentGameId);
      setIsRunning(false);
    } catch (err) {
      console.error('Clear error:', err);
    }
  };

  // Cell counts
  const cellCounts = gameState?.grid.reduce((acc, row) => {
    row.forEach(cell => { if (cell > 0) acc[cell] = (acc[cell] || 0) + 1; });
    return acc;
  }, {} as Record<number, number>) || {};

  const territoryCounts = gameState?.territory.reduce((acc, row) => {
    row.forEach(owner => { if (owner > 0) acc[owner] = (acc[owner] || 0) + 1; });
    return acc;
  }, {} as Record<number, number>) || {};

  const filteredPatterns = selectedCategory === 'all'
    ? PATTERNS : PATTERNS.filter(p => p.category === selectedCategory);

  const formatStatus = (status: GameStatus): string => {
    if ('Active' in status) return 'Active';
    if ('Waiting' in status) return 'Waiting';
    if ('Finished' in status) return 'Finished';
    return 'Unknown';
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Conway's Game of Life</h1>
          <p className="text-gray-400">Multiplayer Territory Mode</p>
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

  // Lobby
  if (mode === 'lobby') {
    return (
      <div className="flex flex-col h-[calc(100vh-120px)] p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Game Lobby</h1>
          <p className="text-gray-500 text-sm font-mono">
            Principal: {myPrincipal?.toText().slice(0, 15)}...
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="mb-6 p-4 bg-white/5 rounded-lg">
          <h2 className="text-lg font-semibold text-white mb-3">Create New Game</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newGameName}
              onChange={(e) => setNewGameName(e.target.value)}
              placeholder="Enter game name..."
              maxLength={50}
              className="flex-1 px-4 py-2 rounded-lg bg-black border border-white/20 text-white placeholder-gray-500 focus:border-dfinity-turquoise/50 focus:outline-none"
            />
            <button
              onClick={handleCreateGame}
              disabled={isLoading || !newGameName.trim()}
              className="px-6 py-2 rounded-lg font-mono bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Create Game'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Available Games</h2>
            <button
              onClick={fetchGames}
              disabled={isLoading}
              className="px-4 py-1.5 rounded font-mono text-sm bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-all disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {games.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No games available. Create one to start playing!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {games.map((game) => (
                <div
                  key={game.id.toString()}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="font-semibold text-white">{game.name}</h3>
                      <p className="text-gray-500 text-sm font-mono">
                        Game #{game.id.toString()} | {game.player_count}/4 players | Gen {game.generation.toString()}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                      'Active' in game.status ? 'bg-green-500/20 text-green-400' :
                      'Waiting' in game.status ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {formatStatus(game.status)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleJoinGame(game.id)}
                    disabled={isLoading || 'Finished' in game.status}
                    className="px-4 py-2 rounded font-mono text-sm bg-dfinity-turquoise/20 text-dfinity-turquoise border border-dfinity-turquoise/50 hover:bg-dfinity-turquoise/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Game view
  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <button
            onClick={handleLeaveGame}
            className="px-3 py-1 rounded font-mono text-xs bg-white/10 text-gray-400 border border-white/20 hover:bg-white/20 hover:text-white transition-all"
          >
            Leave
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Game of Life</h1>
            <p className="text-gray-500 text-xs">
              Game #{currentGameId?.toString()} | You are Player {myPlayerNum}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm font-mono">
          <div className="text-gray-400">
            Gen: <span className="text-dfinity-turquoise">{gameState?.generation.toString() || 0}</span>
          </div>
          <div className="text-gray-600">|</div>
          <div className="text-gray-400 text-xs">Territory:</div>
          {Object.entries(territoryCounts).map(([player, count]) => (
            <div key={player} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm opacity-50" style={{ backgroundColor: PLAYER_COLORS[parseInt(player)] }} />
              <span style={{ color: PLAYER_COLORS[parseInt(player)] }}>{count}</span>
            </div>
          ))}
          <div className="text-gray-600">|</div>
          <div className="text-gray-400 text-xs">Cells:</div>
          {Object.entries(cellCounts).map(([player, count]) => (
            <div key={`cell-${player}`} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: PLAYER_COLORS[parseInt(player)] }} />
              <span className="text-xs" style={{ color: PLAYER_COLORS[parseInt(player)] }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-3 p-3 bg-white/5 rounded-lg">
        <button
          onClick={handlePlayPause}
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
          className="px-3 py-1.5 rounded font-mono text-sm bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-30 transition-all"
        >
          STEP
        </button>

        <button
          onClick={handleClear}
          className="px-3 py-1.5 rounded font-mono text-sm bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-all"
        >
          CLEAR
        </button>

        <div className="flex items-center gap-2 ml-4 pl-4 border-l border-white/10">
          <span className="text-gray-500 text-xs">Your color:</span>
          <div
            className="w-6 h-6 rounded ring-2 ring-white ring-offset-2 ring-offset-black"
            style={{ backgroundColor: PLAYER_COLORS[myPlayerNum] }}
          />
        </div>

        <div className="ml-auto text-gray-500 text-xs">
          Backend-sync (~10 gen/sec)
        </div>
      </div>

      {/* Pattern Selector */}
      <div className="mb-3 p-3 bg-white/5 rounded-lg">
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded text-xs font-mono transition-all ${
              selectedCategory === 'all'
                ? 'bg-white/20 text-white border border-white/30'
                : 'text-gray-400 hover:text-white'
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
                className={`px-3 py-1 rounded text-xs font-mono transition-all border ${
                  selectedCategory === cat ? info.color : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {info.icon} {info.label}
              </button>
            );
          })}
        </div>

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
                    : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                }`}
                title={pattern.description}
              >
                {pattern.name}
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">Selected: </span>
            <span className={`font-mono text-sm ${CATEGORY_INFO[selectedPattern.category].color.split(' ')[0]}`}>
              {selectedPattern.name}
            </span>
            <span className="text-gray-500 text-xs">({parsedPattern.length} cells)</span>
          </div>
          <p className="text-gray-500 text-xs">{selectedPattern.description}</p>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col border border-white/20 rounded-lg overflow-hidden bg-black relative">
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-black/70 rounded-lg p-2">
          <button onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM}
            className="w-8 h-8 flex items-center justify-center rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 font-bold">-</button>
          <span className="text-white text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM}
            className="w-8 h-8 flex items-center justify-center rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 font-bold">+</button>
          <button onClick={handleResetView}
            className="px-2 h-8 flex items-center justify-center rounded bg-white/10 text-white hover:bg-white/20 text-xs font-mono">Reset</button>
        </div>

        <div className="absolute bottom-2 left-2 z-10 bg-black/70 rounded px-2 py-1 text-xs text-gray-400 font-mono">
          {gridSize.cols}x{gridSize.rows} | Shift+drag to pan
        </div>

        <div ref={containerRef} className="flex-1 w-full h-full min-h-0">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className={`w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            style={{ display: 'block' }}
          />
        </div>
      </div>
    </div>
  );
};
