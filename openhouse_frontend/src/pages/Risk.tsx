import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Actor, HttpAgent, ActorSubclass } from '@dfinity/agent';
import { useAuth } from '../providers/AuthProvider';
import { idlFactory } from '../declarations/risk_backend';
import type { _SERVICE, GameState, SlotInfo, BaseInfo, TerritoryExport } from '../declarations/risk_backend/risk_backend.did.d';

// Import constants and types from separate file
import {
  RISK_SERVERS,
  DEFAULT_SERVER_ID,
  GRID_SIZE,
  QUADRANT_SIZE,
  QUADRANTS_PER_ROW,
  TOTAL_QUADRANTS,
  TOTAL_CELLS,
  GRID_WIDTH,
  GRID_HEIGHT,
  LOCAL_TICK_MS,
  BACKEND_SYNC_MS,
  FORCE_SYNC_MS,
  SYNC_TOLERANCE_GENS,
  ENABLE_LOCAL_SIM,
  DEBUG_SYNC,
  GRID_COLOR,
  SWIPE_THRESHOLD,
  DEAD_COLOR,
  PLAYER_COLORS,
  TERRITORY_COLORS,
  CATEGORY_INFO,
  PATTERNS,
  getPatternByName,
  getQuadrant,
  BASE_SIZE,
  BASE_WALL_COLOR,
  BASE_COST,
  isBaseWall,
  isBaseInterior,
  isInBaseZone,
  type ViewMode,
  type PatternCategory,
  type PatternInfo,
  type PendingPlacement,
  type RiskServer,
} from './riskConstants';

// Import utility functions from separate file
import {
  parseRLE,
  rotatePattern,
} from './riskUtils';

// Import tutorial component
import { RiskTutorial } from './risk/tutorial';

// Local cell type for dense grid simulation (v2: no coins on cells)
interface Cell {
  owner: number;  // 0 = neutral, 1-9 = player slots
  alive: boolean;
}

// Coin particle for Mario-style animation when bases lose coins
interface CoinParticle {
  id: number;
  baseX: number;  // Grid position of base
  baseY: number;
  offsetX: number;  // Pixel offset from base center
  offsetY: number;
  velocityX: number;
  velocityY: number;
  opacity: number;
  scale: number;
  rotation: number;
  rotationSpeed: number;
}

// Local Risk simulation - mirrors backend rules exactly
const stepLocalGeneration = (cells: Cell[]): Cell[] => {
  // Guard against empty cells array (can happen during server switch)
  if (cells.length === 0) return cells;

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

      // Preserve owner (territory) - persists even when cells die
      newCells[idx] = {
        owner: newOwner,
        alive: newAlive,
      };
    }
  }

  return newCells;
};

export const Risk: React.FC = () => {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const minimapRef = useRef<HTMLCanvasElement>(null);

  // Pattern state
  const [selectedPattern, setSelectedPattern] = useState<PatternInfo>(getPatternByName('Glider') || PATTERNS[0]);
  const [selectedCategory, setSelectedCategory] = useState<PatternCategory | 'all'>('spaceship');
  const [parsedPattern, setParsedPattern] = useState<[number, number][]>([]);
  const [patternRotation, setPatternRotation] = useState<0 | 1 | 2 | 3>(0); // 0=0°, 1=90°, 2=180°, 3=270°

  // Quadrant-based view state
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [viewX, setViewX] = useState(0);     // 0, 128, 256, or 384
  const [viewY, setViewY] = useState(0);     // 0, 128, 256, or 384

  // Touch handling for swipe navigation
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Derived: current quadrant number (0-15)
  const currentQuadrant = (viewY / QUADRANT_SIZE) * QUADRANTS_PER_ROW + (viewX / QUADRANT_SIZE);

  // Auth from shared provider
  const { identity, isAuthenticated, login, principal } = useAuth();

  // Server selection
  const [selectedServer, setSelectedServer] = useState<RiskServer>(
    RISK_SERVERS.find(s => s.id === DEFAULT_SERVER_ID) || RISK_SERVERS[0]
  );

  // Actor state (created when authenticated)
  const [actor, setActor] = useState<ActorSubclass<_SERVICE> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slot selection state
  const [showSlotSelection, setShowSlotSelection] = useState(false);
  const [slotsInfo, setSlotsInfo] = useState<SlotInfo[]>([]);
  const [isJoiningSlot, setIsJoiningSlot] = useState(false);

  // Game state from backend - sparse format
  const [gameState, setGameState] = useState<GameState | null>(null);
  // Local cells for optimistic simulation (dense grid, runs independently, synced from backend periodically)
  const [localCells, setLocalCells] = useState<Cell[]>([]);
  const [myPlayerNum, setMyPlayerNum] = useState<number | null>(null);
  const [myBalance, setMyBalance] = useState(0);
  const [placementError, setPlacementError] = useState<string | null>(null);
  // Base info for each slot (v2 base-centric system)
  const [bases, setBases] = useState<Map<number, BaseInfo>>(new Map());

  // Pending placements - accumulate patterns before confirming
  const [pendingPlacements, setPendingPlacements] = useState<PendingPlacement[]>([]);
  const [selectedPlacementIds, setSelectedPlacementIds] = useState<Set<string>>(new Set());
  const nextPlacementIdRef = useRef(0);
  const [isConfirmingPlacement, setIsConfirmingPlacement] = useState(false);
  const [isRequestingFaucet, setIsRequestingFaucet] = useState(false);
  const [previewPulse, setPreviewPulse] = useState(0); // For animation

  // Elimination modal state
  const [isEliminated, setIsEliminated] = useState(false);
  const [eliminationStats, setEliminationStats] = useState<{
    generationsSurvived: bigint;
    peakTerritory: number;
    coinsEarned: number;
  } | null>(null);

  // Tutorial modal state
  const [showTutorial, setShowTutorial] = useState(false);

  // Elimination tracking refs
  const joinedAtGeneration = useRef<bigint | null>(null);
  const peakTerritoryRef = useRef<number>(0);
  const initialWalletRef = useRef<number>(0);
  const hadBaseRef = useRef<boolean>(false); // Track if player ever had a base (avoid false positive on join)

  // Simulation control - always running
  const [isRunning, setIsRunning] = useState(true);
  const [, forceRender] = useState(0);

  // Quadrant wipe timer state
  const [wipeInfo, setWipeInfo] = useState<{ quadrant: number; secondsUntil: number } | null>(null);

  // Coin animation state - Mario-style coin particles when bases lose coins
  const [coinParticles, setCoinParticles] = useState<CoinParticle[]>([]);
  const prevBaseCoinsRef = useRef<Map<number, number>>(new Map());
  const nextParticleIdRef = useRef(0);

  // Sync verification state (Part 1 of timer optimization)
  const [localGeneration, setLocalGeneration] = useState<bigint>(0n);
  const [lastSyncedGeneration, setLastSyncedGeneration] = useState<bigint>(0n);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<{
    inSync: boolean;
    driftGens: number;
    lastLocalHash: string;
    lastBackendHash: string;
  }>({ inSync: true, driftGens: 0, lastLocalHash: '', lastBackendHash: '' });

  // Refs to access current values inside async callbacks (avoids stale closure)
  const localCellsRef = useRef<Cell[]>([]);
  const localGenerationRef = useRef<bigint>(0n);
  const lastSyncedGenerationRef = useRef<bigint>(0n);
  const lastSyncTimeRef = useRef<number>(0);

  // Query latency tracking
  const queryLatencyStats = useRef<{ samples: number[] }>({ samples: [] });
  const querySequence = useRef<number>(0);

  // Keep refs in sync with state
  useEffect(() => { localCellsRef.current = localCells; }, [localCells]);
  useEffect(() => { localGenerationRef.current = localGeneration; }, [localGeneration]);
  useEffect(() => { lastSyncedGenerationRef.current = lastSyncedGeneration; }, [lastSyncedGeneration]);
  useEffect(() => { lastSyncTimeRef.current = lastSyncTime; }, [lastSyncTime]);

  // Sidebar collapsed state with localStorage persistence
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('risk-sidebar-collapsed');
    return saved === 'true';
  });

  // Mobile bottom bar expanded state
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Pattern filter: show all patterns by default (essential filter available)
  const [showAdvanced, setShowAdvanced] = useState(true);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('risk-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Parse pattern on selection change (reset rotation when pattern changes)
  useEffect(() => {
    setParsedPattern(rotatePattern(parseRLE(selectedPattern.rle), patternRotation));
  }, [selectedPattern, patternRotation]);

  // Reset rotation when pattern changes
  useEffect(() => {
    setPatternRotation(0);
  }, [selectedPattern]);

  // Pulse animation for pending placements
  useEffect(() => {
    if (pendingPlacements.length === 0) return;
    const interval = setInterval(() => {
      setPreviewPulse(p => (p + 1) % 60); // 60 frames per cycle at ~16ms
    }, 16);
    return () => clearInterval(interval);
  }, [pendingPlacements.length]);

  // Local countdown for wipe timer (smooth decrement between backend syncs)
  useEffect(() => {
    if (!wipeInfo) return;
    const interval = setInterval(() => {
      setWipeInfo(prev => {
        if (!prev) return null;
        const newSeconds = prev.secondsUntil - 1;
        if (newSeconds <= 0) {
          // Move to next quadrant when timer hits 0 (5 minute rotation)
          return { quadrant: (prev.quadrant + 1) % TOTAL_QUADRANTS, secondsUntil: 300 };
        }
        return { ...prev, secondsUntil: newSeconds };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [wipeInfo !== null]);

  // Detect coin loss and spawn Mario-style coin particles
  useEffect(() => {
    if (bases.size === 0) return;

    const newParticles: CoinParticle[] = [];

    for (const [playerNum, baseInfo] of bases) {
      const currentCoins = Number(baseInfo.coins);
      const prevCoins = prevBaseCoinsRef.current.get(playerNum) ?? currentCoins;

      if (prevCoins > currentCoins) {
        // Coins were lost! Spawn particles
        const coinsLost = Math.min(prevCoins - currentCoins, 20); // Cap at 20 particles
        const particleCount = Math.max(3, Math.ceil(coinsLost / 2)); // 3-10 particles based on loss

        for (let i = 0; i < particleCount; i++) {
          const angle = (Math.PI * 0.3) + (Math.random() * Math.PI * 0.4); // Upward arc (50-130 degrees)
          const speed = 2 + Math.random() * 3;

          newParticles.push({
            id: nextParticleIdRef.current++,
            baseX: baseInfo.x,
            baseY: baseInfo.y,
            offsetX: (Math.random() - 0.5) * 20,
            offsetY: -5 - Math.random() * 10,
            velocityX: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
            velocityY: -Math.sin(angle) * speed,
            opacity: 1,
            scale: 0.8 + Math.random() * 0.4,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 20,
          });
        }
      }

      prevBaseCoinsRef.current.set(playerNum, currentCoins);
    }

    if (newParticles.length > 0) {
      setCoinParticles(prev => [...prev, ...newParticles]);
    }
  }, [bases]);

  // Animate coin particles (physics update loop)
  useEffect(() => {
    if (coinParticles.length === 0) return;

    const interval = setInterval(() => {
      setCoinParticles(prev => {
        const updated = prev
          .map(p => ({
            ...p,
            offsetX: p.offsetX + p.velocityX,
            offsetY: p.offsetY + p.velocityY,
            velocityY: p.velocityY + 0.15, // Gravity
            opacity: p.opacity - 0.02,
            rotation: p.rotation + p.rotationSpeed,
          }))
          .filter(p => p.opacity > 0);

        return updated;
      });
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [coinParticles.length > 0]);

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

  // Create actor when authenticated with shared identity or server changes
  useEffect(() => {
    if (!isAuthenticated || !identity) {
      setActor(null);
      return;
    }

    // Reset state when switching servers
    setMyPlayerNum(null);
    setGameState(null);
    setLocalCells([]);
    setMyBalance(0);
    setPendingPlacements([]);
    setSelectedPlacementIds(new Set());
    setBases(new Map());

    const setupActor = async () => {
      setIsLoading(true);
      try {
        const agent = new HttpAgent({ identity, host: 'https://icp-api.io' });
        const newActor = Actor.createActor<_SERVICE>(idlFactory, { agent, canisterId: selectedServer.canisterId });
        setActor(newActor);

        // Fetch balance first
        const balance = await newActor.get_balance();
        setMyBalance(Number(balance));

        // Check slots to see if player already has a base (v2)
        const slots = await newActor.get_slots_info();
        setSlotsInfo(slots);

        // Find if current principal has a base
        let hasBase = false;
        for (let i = 0; i < slots.length; i++) {
          const slotOpt = slots[i];
          if (slotOpt.length > 0) {
            const slotInfo = slotOpt[0];
            if (slotInfo.principal.length > 0 && slotInfo.principal[0].toText() === principal) {
              setMyPlayerNum(i + 1);
              hasBase = true;
              break;
            }
          }
        }

        if (hasBase) {
          setShowSlotSelection(false);
          // Mark that we have a base for elimination detection
          hadBaseRef.current = true;
          // Initialize tracking refs (will be refined on first sync)
          joinedAtGeneration.current = null; // Unknown - joined in previous session
          initialWalletRef.current = Number(balance);
        } else {
          setShowSlotSelection(true);
          // Reset elimination tracking refs
          hadBaseRef.current = false;
          joinedAtGeneration.current = null;
          peakTerritoryRef.current = 0;
        }
      } catch (err) {
        console.error('Failed to setup actor:', err);
        setError(`Failed to connect: ${err}`);
        setShowSlotSelection(true);
      } finally {
        setIsLoading(false);
      }
    };

    setupActor();
  }, [isAuthenticated, identity, selectedServer, principal]);

  // Refresh slot info
  const refreshSlotsInfo = async () => {
    if (!actor) return;
    try {
      const t0 = performance.now();
      const slots = await actor.get_slots_info();
      console.log(`[QUERY LATENCY] get_slots_info: ${(performance.now() - t0).toFixed(1)}ms`);
      setSlotsInfo(slots);
    } catch (err) {
      console.error('Failed to refresh slots:', err);
    }
  };

  // Convert bitmap-based state from backend to dense grid (v2 format)
  const sparseToDense = useCallback((state: GameState): Cell[] => {
    const dense: Cell[] = new Array(TOTAL_CELLS).fill(null).map(() => ({ owner: 0, alive: false }));

    // Decode alive_bitmap - each u64 represents 64 consecutive cells
    const bitmap = Array.from(state.alive_bitmap);
    for (let wordIdx = 0; wordIdx < bitmap.length; wordIdx++) {
      const word = BigInt(bitmap[wordIdx]);
      for (let bit = 0; bit < 64; bit++) {
        if ((word >> BigInt(bit)) & BigInt(1)) {
          const cellIdx = wordIdx * 64 + bit;
          if (cellIdx < TOTAL_CELLS) {
            dense[cellIdx].alive = true;
          }
        }
      }
    }

    // Decode territories for each player slot (index 0 = slot 1, etc.)
    for (let slotIdx = 0; slotIdx < state.territories.length; slotIdx++) {
      const territory = state.territories[slotIdx];
      const playerNum = slotIdx + 1;  // Slots are 1-indexed

      // chunk_mask indicates which 4096-cell chunks have data
      const chunkMask = BigInt(territory.chunk_mask);
      let chunkDataIdx = 0;

      for (let chunkIdx = 0; chunkIdx < 64; chunkIdx++) {  // 64 chunks (8x8 grid of 64x64 chunks)
        if (!((chunkMask >> BigInt(chunkIdx)) & BigInt(1))) continue;

        // This chunk has data
        const chunkData = territory.chunks[chunkDataIdx];
        chunkDataIdx++;

        if (!chunkData) continue;

        // Chunk grid position (8x8 grid of chunks)
        const chunkRow = Math.floor(chunkIdx / 8);  // 0-7
        const chunkCol = chunkIdx % 8;              // 0-7

        // Each chunk has 64 words (one per row of 64 cells)
        const words = Array.from(chunkData);
        for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
          const word = BigInt(words[wordIdx]);
          for (let bit = 0; bit < 64; bit++) {
            if ((word >> BigInt(bit)) & BigInt(1)) {
              // wordIdx is the local row (0-63), bit is the local column (0-63)
              const localY = wordIdx;
              const localX = bit;

              // Global coordinates
              const globalY = chunkRow * 64 + localY;
              const globalX = chunkCol * 64 + localX;

              // Linear cell index (row-major: y * width + x)
              const cellIdx = globalY * GRID_SIZE + globalX;
              if (cellIdx < TOTAL_CELLS) {
                dense[cellIdx].owner = playerNum;
              }
            }
          }
        }
      }
    }

    return dense;
  }, []);

  // Canvas sizing - re-run when slot selection closes (canvas mounts)
  // Uses polling to handle race condition where refs aren't attached yet
  useEffect(() => {
    if (!isAuthenticated || showSlotSelection) return;

    // CRITICAL: Reset canvasSizeRef to force fresh calculation
    // This prevents stale dimensions from causing "zoomed in" rendering
    canvasSizeRef.current = { width: 0, height: 0 };

    let observer: ResizeObserver | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;
    let cancelled = false;

    const setupCanvas = () => {
      if (cancelled) return;
      const container = containerRef.current;
      const canvas = canvasRef.current;

      // If refs not ready yet, retry shortly
      if (!container || !canvas) {
        retryTimeout = setTimeout(setupCanvas, 16);
        return;
      }

      const updateSize = () => {
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);

        // Skip if dimensions are invalid (layout not ready)
        if (width < 100 || height < 100) {
          // Retry after a frame
          requestAnimationFrame(updateSize);
          return;
        }

        // Skip if dimensions unchanged
        if (canvasSizeRef.current.width === width && canvasSizeRef.current.height === height) return;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvasSizeRef.current = { width, height };
        forceRender(n => n + 1);
      };

      observer = new ResizeObserver(updateSize);
      observer.observe(container);

      // Use requestAnimationFrame to ensure layout is complete before first size check
      requestAnimationFrame(() => {
        if (!cancelled) updateSize();
      });
    };

    setupCanvas();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [isAuthenticated, showSlotSelection]);

  // Backend sync - fetch authoritative state every 5 seconds
  useEffect(() => {
    if (!actor || !isAuthenticated) return;

    let cancelled = false;

    const syncFromBackend = async () => {
      if (cancelled) return;
      try {
        const queryId = ++querySequence.current;
        const t0 = performance.now();
        const state = await actor.get_state();
        const latencyMs = performance.now() - t0;

        // Track latency stats (silent - only for debug overlay)
        queryLatencyStats.current.samples.push(latencyMs);
        if (queryLatencyStats.current.samples.length > 20) {
          queryLatencyStats.current.samples.shift();
        }
        if (!cancelled) {
          // Count alive cells in the state
          let aliveCount = 0;
          for (const word of state.alive_bitmap) {
            let w = BigInt(word);
            while (w > 0n) {
              aliveCount += Number(w & 1n);
              w >>= 1n;
            }
          }
          // ========== SYNC DECISION LOGIC ==========
          // Use refs to get current values (avoids stale closure issue)
          const currentLocalGen = localGenerationRef.current;
          const currentLastSyncedGen = lastSyncedGenerationRef.current;
          const currentLastSyncTime = lastSyncTimeRef.current;

          const incomingGen = state.generation;
          const now = Date.now();
          const timeSinceLastSync = now - currentLastSyncTime;
          const genDiff = Number(currentLocalGen - incomingGen);
          // genDiff > 0 means local is AHEAD of backend
          // genDiff < 0 means backend is AHEAD of local (we're behind!)

          // REJECT: True out-of-order (older than what we've already synced to)
          if (incomingGen < currentLastSyncedGen) {
            // Don't log these - they're expected with parallel queries
            return;
          }

          // SYNC STRATEGY:
          // - If backend is AHEAD (genDiff < 0): Always sync (we're behind, need to catch up)
          // - If local is ahead by small amount: Skip (we're just running slightly fast)
          // - If local is ahead by too much OR force sync: Sync to prevent drift
          const backendAhead = genDiff < 0;
          const localTooFarAhead = genDiff > SYNC_TOLERANCE_GENS;
          const needsForceSync = timeSinceLastSync >= FORCE_SYNC_MS;

          // Only sync if: backend ahead OR local way too far ahead OR force sync
          if (!backendAhead && !localTooFarAhead && !needsForceSync) {
            // Local is slightly ahead - skip, let backend catch up
            return;
          }

          // Log the sync event
          const reason = backendAhead ? 'catchup' : (needsForceSync ? 'force' : 'drift');
          console.log('[SYNC]', {
            queryId,
            incoming: incomingGen.toString(),
            localGen: currentLocalGen.toString(),
            correction: genDiff,
            reason,
            latency: `${latencyMs.toFixed(0)}ms`,
          });

          // Update UI indicator
          setSyncStatus({
            inSync: true,
            driftGens: 0,
            lastLocalHash: '',
            lastBackendHash: '',
          });

          // Update generation tracking - hard snap to backend state
          setLastSyncedGeneration(state.generation);
          setLocalGeneration(state.generation);
          setLastSyncTime(Date.now());

          setGameState(state);
          // Convert bitmap to dense for local simulation
          setLocalCells(sparseToDense(state));

          // Extract base info from slots (v2 format)
          const newBases = new Map<number, BaseInfo>();
          for (let i = 0; i < state.slots.length; i++) {
            const slotOpt = state.slots[i];
            if (slotOpt.length > 0) {
              const slotInfo = slotOpt[0];
              if (slotInfo.base.length > 0) {
                newBases.set(i + 1, slotInfo.base[0]);  // Slots are 1-indexed
              }
              // Check if this is our slot
              if (slotInfo.principal.length > 0 && slotInfo.principal[0].toText() === principal) {
                setMyPlayerNum(i + 1);
              }
            }
          }
          setBases(newBases);

          // Elimination detection: Check if player had a base but now doesn't
          // We use a callback to access current myPlayerNum state safely
          setMyPlayerNum(currentPlayerNum => {
            if (currentPlayerNum && hadBaseRef.current && !isEliminated) {
              const myBase = newBases.get(currentPlayerNum);

              // Player was in game but base is now gone = eliminated
              if (!myBase) {
                // Calculate stats for elimination modal
                const gensSurvived = joinedAtGeneration.current !== null
                  ? state.generation - joinedAtGeneration.current
                  : 0n;

                setIsEliminated(true);
                setEliminationStats({
                  generationsSurvived: gensSurvived,
                  peakTerritory: peakTerritoryRef.current,
                  coinsEarned: 0, // Will be updated after balance fetch
                });

                // Clear tracking for potential rejoin
                hadBaseRef.current = false;
              }
            }
            return currentPlayerNum; // Don't change the value
          });

          // Fetch balance
          try {
            const balance = await actor.get_balance();
            setMyBalance(Number(balance));

            // If just eliminated, update coins earned in stats
            if (isEliminated && eliminationStats) {
              setEliminationStats(prev => prev ? {
                ...prev,
                coinsEarned: Number(balance) - initialWalletRef.current
              } : null);
            }
          } catch (err) {
            console.error('Balance fetch error:', err);
          }

          // Update wipe timer from state (v2 includes it directly)
          setWipeInfo({
            quadrant: state.next_wipe_quadrant,
            secondsUntil: Number(state.seconds_until_wipe)
          });
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
  }, [actor, principal, isAuthenticated, sparseToDense]);

  // Local simulation - runs every 100ms for smooth visuals (when enabled)
  // When disabled, we display backend state directly via frequent syncs
  useEffect(() => {
    if (!ENABLE_LOCAL_SIM || !isRunning || localCells.length === 0) return;

    const localTick = setInterval(() => {
      setLocalCells(cells => stepLocalGeneration(cells));
      setLocalGeneration(g => g + 1n);  // Track generation for sync verification
    }, LOCAL_TICK_MS);

    return () => clearInterval(localTick);
  }, [isRunning, localCells.length > 0]);

  // Helper to draw cells within a region (v2: no coins on cells, draw bases)
  const drawCells = useCallback((
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    width: number,
    height: number,
    cellSize: number
  ) => {
    const cells = localCells;
    const gap = cellSize > 2 ? 1 : 0;

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

    // Draw base walls for all players (fortress perimeter)
    for (const [playerNum, baseInfo] of bases) {
      const playerColor = PLAYER_COLORS[playerNum] || '#FFFFFF';

      // Draw 8x8 base walls
      for (let dy = 0; dy < BASE_SIZE; dy++) {
        for (let dx = 0; dx < BASE_SIZE; dx++) {
          // Only wall positions (perimeter)
          if (dx !== 0 && dx !== BASE_SIZE - 1 && dy !== 0 && dy !== BASE_SIZE - 1) continue;

          const gridCol = baseInfo.x + dx;
          const gridRow = baseInfo.y + dy;

          // Check if in view
          const localCol = gridCol - startX;
          const localRow = gridRow - startY;
          if (localCol < 0 || localCol >= width || localRow < 0 || localRow >= height) continue;

          const x = localCol * cellSize;
          const y = localRow * cellSize;

          // Draw fortress wall with gradient for 3D effect
          if (cellSize > 3) {
            const gradient = ctx.createLinearGradient(x, y, x, y + cellSize);
            gradient.addColorStop(0, '#6B6B6B');
            gradient.addColorStop(0.3, '#5A5A5A');
            gradient.addColorStop(0.7, '#4A4A4A');
            gradient.addColorStop(1, '#3A3A3A');
            ctx.fillStyle = gradient;
          } else {
            ctx.fillStyle = BASE_WALL_COLOR;
          }
          ctx.fillRect(x, y, cellSize - gap, cellSize - gap);

          // Add player color border to walls
          ctx.strokeStyle = playerColor;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cellSize - gap - 1, cellSize - gap - 1);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Draw living cells
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

    // Draw coin count on each base (centered in the 8x8 base)
    for (const [playerNum, baseInfo] of bases) {
      const coins = Number(baseInfo.coins);
      const playerColor = PLAYER_COLORS[playerNum] || '#FFFFFF';

      // Calculate center of base in local coordinates
      const baseCenterCol = baseInfo.x + BASE_SIZE / 2;
      const baseCenterRow = baseInfo.y + BASE_SIZE / 2;
      const localCenterCol = baseCenterCol - startX;
      const localCenterRow = baseCenterRow - startY;

      // Skip if base center is outside view
      if (localCenterCol < -2 || localCenterCol >= width + 2 ||
          localCenterRow < -2 || localCenterRow >= height + 2) continue;

      const x = localCenterCol * cellSize;
      const y = localCenterRow * cellSize;

      // Only show coin count if cells are large enough to read text
      if (cellSize >= 3) {
        // Draw coin icon and count
        const coinText = coins >= 1000 ? `${(coins / 1000).toFixed(1)}k` : String(coins);
        const fontSize = Math.max(8, Math.min(14, cellSize * 1.5));

        ctx.save();

        // Background pill for readability
        ctx.font = `bold ${fontSize}px monospace`;
        const textWidth = ctx.measureText(coinText).width;
        const pillWidth = textWidth + fontSize * 1.2;
        const pillHeight = fontSize * 1.4;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.roundRect(x - pillWidth / 2, y - pillHeight / 2, pillWidth, pillHeight, 4);
        ctx.fill();

        // Coin emoji/symbol
        ctx.fillStyle = '#FFD700';
        ctx.font = `${fontSize * 0.9}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u{1FA99}', x - textWidth / 2, y); // Unicode coin symbol

        // Coin count text
        ctx.fillStyle = playerColor;
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(coinText, x - textWidth / 2 + 2, y);

        ctx.restore();
      }
    }

    // Draw coin particles (Mario-style coin spill animation)
    for (const particle of coinParticles) {
      // Calculate particle position in local coordinates
      const baseCenterCol = particle.baseX + BASE_SIZE / 2;
      const baseCenterRow = particle.baseY + BASE_SIZE / 2;
      const localCenterCol = baseCenterCol - startX;
      const localCenterRow = baseCenterRow - startY;

      // Skip if particle origin is way outside view
      if (localCenterCol < -10 || localCenterCol >= width + 10 ||
          localCenterRow < -10 || localCenterRow >= height + 10) continue;

      const x = localCenterCol * cellSize + particle.offsetX;
      const y = localCenterRow * cellSize + particle.offsetY;

      ctx.save();
      ctx.globalAlpha = particle.opacity;
      ctx.translate(x, y);
      ctx.rotate((particle.rotation * Math.PI) / 180);
      ctx.scale(particle.scale, particle.scale);

      // Draw golden coin
      const coinRadius = Math.max(4, cellSize * 0.4);

      // Coin body (golden gradient)
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, coinRadius);
      gradient.addColorStop(0, '#FFF8DC');
      gradient.addColorStop(0.3, '#FFD700');
      gradient.addColorStop(0.7, '#DAA520');
      gradient.addColorStop(1, '#B8860B');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, coinRadius, 0, Math.PI * 2);
      ctx.fill();

      // Coin shine highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(-coinRadius * 0.3, -coinRadius * 0.3, coinRadius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Dollar sign or star in center
      ctx.fillStyle = '#B8860B';
      ctx.font = `bold ${coinRadius}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);

      ctx.restore();
    }
  }, [localCells, bases, coinParticles]);

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

  // Calculate quadrant density for minimap heatmap
  const calculateQuadrantDensity = useCallback((quadrant: number): number => {
    if (localCells.length === 0) return 0;
    const qRow = Math.floor(quadrant / QUADRANTS_PER_ROW);
    const qCol = quadrant % QUADRANTS_PER_ROW;
    const startY = qRow * QUADRANT_SIZE;
    const startX = qCol * QUADRANT_SIZE;

    let livingCells = 0;
    for (let row = startY; row < startY + QUADRANT_SIZE; row++) {
      for (let col = startX; col < startX + QUADRANT_SIZE; col++) {
        const cell = localCells[row * GRID_SIZE + col];
        if (cell && cell.alive && cell.owner > 0) livingCells++;
      }
    }

    return livingCells / (QUADRANT_SIZE * QUADRANT_SIZE);
  }, [localCells]);

  // Draw preview cells with pulsing animation (handles batched placements) - v2 rules
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

    // Get my base for wall checking
    const myBase = myPlayerNum ? bases.get(myPlayerNum) : null;

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

        // v2 conflict checking: own territory only, not on walls
        const hasAliveConflict = existingCell && existingCell.alive;
        const hasDuplicateConflict = (cellCounts.get(cellKey) || 0) > 1;
        const hasWallConflict = myBase && isBaseWall(gridCol, gridRow, myBase.x, myBase.y);
        const hasNeutralConflict = !existingCell || existingCell.owner === 0;
        const hasEnemyConflict = existingCell && existingCell.owner !== 0 && existingCell.owner !== myPlayerNum;
        const hasConflict = hasAliveConflict || hasDuplicateConflict || hasWallConflict || hasNeutralConflict || hasEnemyConflict;

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
  }, [localCells, myPlayerNum, pendingPlacements, bases]);

  // Main draw function - simplified for quadrant-based navigation
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const { width: displayWidth, height: displayHeight } = canvasSizeRef.current;
    // Skip drawing if canvas not ready or dimensions are invalid (prevents zoomed-in glitch)
    if (!canvas || displayWidth < 100 || displayHeight < 100 || localCells.length === 0) return;

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
      // Overview: show all 512x512, each cell is tiny
      const cellSize = canvasSize / GRID_SIZE;

      // Center the grid if canvas is not square
      const offsetX = (displayWidth - canvasSize) / 2;
      const offsetY = (displayHeight - canvasSize) / 2;
      ctx.save();
      ctx.translate(offsetX, offsetY);

      drawCells(ctx, 0, 0, GRID_SIZE, GRID_SIZE, cellSize);
      drawQuadrantGrid(ctx, cellSize);

      // Highlight upcoming wipe quadrants (yellow, orange, red)
      if (wipeInfo) {
        // Third quadrant (+2m) - yellow
        const q3 = (wipeInfo.quadrant + 2) % TOTAL_QUADRANTS;
        const q3Row = Math.floor(q3 / QUADRANTS_PER_ROW);
        const q3Col = q3 % QUADRANTS_PER_ROW;
        ctx.fillStyle = 'rgba(234, 179, 8, 0.08)';
        ctx.fillRect(q3Col * QUADRANT_SIZE * cellSize, q3Row * QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize);
        ctx.strokeStyle = '#EAB308';
        ctx.lineWidth = 1;
        ctx.strokeRect(q3Col * QUADRANT_SIZE * cellSize, q3Row * QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize);

        // Second quadrant (+1m) - orange
        const q2 = (wipeInfo.quadrant + 1) % TOTAL_QUADRANTS;
        const q2Row = Math.floor(q2 / QUADRANTS_PER_ROW);
        const q2Col = q2 % QUADRANTS_PER_ROW;
        ctx.fillStyle = 'rgba(249, 115, 22, 0.08)';
        ctx.fillRect(q2Col * QUADRANT_SIZE * cellSize, q2Row * QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize);
        ctx.strokeStyle = '#F97316';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(q2Col * QUADRANT_SIZE * cellSize, q2Row * QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize);

        // Next quadrant (imminent) - red with pulse
        const wipeRow = Math.floor(wipeInfo.quadrant / QUADRANTS_PER_ROW);
        const wipeCol = wipeInfo.quadrant % QUADRANTS_PER_ROW;
        const pulseAlpha = wipeInfo.secondsUntil <= 10 ? 0.15 + 0.1 * Math.sin(Date.now() / 200) : 0.1;
        ctx.fillStyle = `rgba(239, 68, 68, ${pulseAlpha})`;
        ctx.fillRect(wipeCol * QUADRANT_SIZE * cellSize, wipeRow * QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize);
        ctx.strokeStyle = wipeInfo.secondsUntil <= 10 ? '#DC2626' : '#EF4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(wipeCol * QUADRANT_SIZE * cellSize, wipeRow * QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize, QUADRANT_SIZE * cellSize);
      }

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
      // Quadrant: show 128x128, cells are larger
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
  }, [viewMode, viewX, viewY, localCells, drawCells, drawQuadrantGrid, drawGridLines, drawPreviewCells, previewPulse, wipeInfo]);

  useEffect(() => { draw(); }, [draw]);

  // Minimap drawing effect
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
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
      const density = calculateQuadrantDensity(q);

      // Color based on density
      const alpha = Math.min(0.8, density * 2);
      ctx.fillStyle = `rgba(57, 255, 20, ${alpha})`;
      ctx.fillRect(qCol * quadSize + 1, qRow * quadSize + 1, quadSize - 2, quadSize - 2);
    }

    // Highlight upcoming wipe quadrants (yellow, orange, red)
    if (wipeInfo) {
      // Third quadrant (+2m) - yellow
      const q3 = (wipeInfo.quadrant + 2) % TOTAL_QUADRANTS;
      const q3Row = Math.floor(q3 / QUADRANTS_PER_ROW);
      const q3Col = q3 % QUADRANTS_PER_ROW;
      ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
      ctx.fillRect(q3Col * quadSize + 1, q3Row * quadSize + 1, quadSize - 2, quadSize - 2);
      ctx.strokeStyle = '#EAB308';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(q3Col * quadSize, q3Row * quadSize, quadSize, quadSize);

      // Second quadrant (+1m) - orange
      const q2 = (wipeInfo.quadrant + 1) % TOTAL_QUADRANTS;
      const q2Row = Math.floor(q2 / QUADRANTS_PER_ROW);
      const q2Col = q2 % QUADRANTS_PER_ROW;
      ctx.fillStyle = 'rgba(249, 115, 22, 0.15)';
      ctx.fillRect(q2Col * quadSize + 1, q2Row * quadSize + 1, quadSize - 2, quadSize - 2);
      ctx.strokeStyle = '#F97316';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(q2Col * quadSize, q2Row * quadSize, quadSize, quadSize);

      // Next quadrant (imminent) - red with pulse
      const wipeRow = Math.floor(wipeInfo.quadrant / QUADRANTS_PER_ROW);
      const wipeCol = wipeInfo.quadrant % QUADRANTS_PER_ROW;
      const pulseAlpha = wipeInfo.secondsUntil <= 10 ? 0.2 + 0.1 * Math.sin(Date.now() / 200) : 0.15;
      ctx.fillStyle = `rgba(239, 68, 68, ${pulseAlpha})`;
      ctx.fillRect(wipeCol * quadSize + 1, wipeRow * quadSize + 1, quadSize - 2, quadSize - 2);
      ctx.strokeStyle = wipeInfo.secondsUntil <= 10 ? '#DC2626' : '#EF4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(wipeCol * quadSize, wipeRow * quadSize, quadSize, quadSize);
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
  }, [localCells, currentQuadrant, calculateQuadrantDensity, wipeInfo]);

  // Minimap click handler
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
      // Click in quadrant = add to pending placements (batch mode)
      const cellSize = canvasSize / QUADRANT_SIZE;
      const localCol = Math.floor(x / cellSize);
      const localRow = Math.floor(y / cellSize);
      const gridCol = viewX + localCol;
      const gridRow = viewY + localRow;

      // Validate coordinates
      if (gridCol < 0 || gridCol >= GRID_SIZE || gridRow < 0 || gridRow >= GRID_SIZE) return;

      // Convert pattern to absolute coordinates with toroidal wrapping
      const cellsToPlace: [number, number][] = parsedPattern.map(([dx, dy]) => [
        (gridCol + dx + GRID_SIZE) % GRID_SIZE,
        (gridRow + dy + GRID_SIZE) % GRID_SIZE
      ]);

      // Add pattern to pending placements
      const newId = `placement-${nextPlacementIdRef.current++}`;
      const newPlacement: PendingPlacement = {
        id: newId,
        cells: cellsToPlace,
        patternName: selectedPattern.name,
        centroid: [gridCol, gridRow],
      };
      setPendingPlacements(prev => [...prev, newPlacement]);
      // Auto-select new placements
      setSelectedPlacementIds(prev => new Set([...prev, newId]));
      setPlacementError(null);
    }
  };

  // Confirm placement - send all pending placements to backend in one batch (v2 rules)
  const confirmPlacement = useCallback(async () => {
    const cellsToPlace: [number, number][] = pendingPlacements.flatMap(p => p.cells);

    console.log('[PLACE] confirmPlacement called', {
      cellCount: cellsToPlace.length,
      cells: cellsToPlace.slice(0, 10), // First 10 cells
      myPlayerNum,
      myBalance,
      localCellsLength: localCells.length,
    });

    if (!actor || cellsToPlace.length === 0 || isConfirmingPlacement) {
      console.log('[PLACE] Early return:', { hasActor: !!actor, cellCount: cellsToPlace.length, isConfirmingPlacement });
      return;
    }

    const cost = cellsToPlace.length;

    // Check if player has enough coins
    if (myBalance < cost) {
      console.log('[PLACE] Not enough coins:', { cost, myBalance });
      setPlacementError(`Not enough coins. Need ${cost}, have ${myBalance}`);
      return;
    }

    // Get my base info for wall checking
    const myBase = myPlayerNum ? bases.get(myPlayerNum) : null;

    // Only do frontend validation if localCells is populated
    // If localCells is empty (pre-sync), skip validation and let backend handle it
    if (localCells.length > 0) {
      // v2 placement validation: own territory only, not on walls, not on living cells
      const conflicts = cellsToPlace.filter(([col, row]) => {
        const idx = row * GRID_SIZE + col;
        const cell = localCells[idx];

        // Cannot place on living cells
        if (cell && cell.alive) return true;

        // Cannot place on base walls
        if (myBase && isBaseWall(col, row, myBase.x, myBase.y)) return true;

        // Cannot place on neutral territory (owner === 0)
        if (!cell || cell.owner === 0) return true;

        // Cannot place on enemy territory (owner !== myPlayerNum)
        if (cell.owner !== myPlayerNum) return true;

        return false;
      });

      if (conflicts.length > 0) {
        // Log details about the first few conflicts
        const conflictDetails = cellsToPlace.slice(0, 5).map(([col, row]) => {
          const idx = row * GRID_SIZE + col;
          const cell = localCells[idx];
          return { col, row, idx, cell, myPlayerNum };
        });
        console.log('[PLACE] Validation conflicts:', { count: conflicts.length, details: conflictDetails });
        setPlacementError(`${conflicts.length} cell(s) cannot be placed. You can only place on your own territory (not on walls, neutral, or enemy territory).`);
        return;
      }
    }

    console.log('[PLACE] Validation passed, calling backend...');

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

    setIsConfirmingPlacement(true);
    setPlacementError(null);

    // 1. Optimistically apply to local state FIRST (before backend call)
    // This provides immediate visual feedback; next backend sync will correct if rejected
    if (myPlayerNum) {
      setLocalCells(prev => {
        const updated = [...prev];
        for (const [col, row] of cellsToPlace) {
          const idx = row * GRID_SIZE + col;
          if (idx >= 0 && idx < updated.length) {
            updated[idx] = { ...updated[idx], alive: true, owner: myPlayerNum };
          }
        }
        return updated;
      });
    }

    // Clear pending placements immediately for snappy UI
    setPendingPlacements([]);
    setSelectedPlacementIds(new Set());

    // 2. Send to backend
    try {
      console.log('[PLACE] Sending to backend:', { cellCount: cellsToPlace.length });
      const t0 = performance.now();
      const result = await actor.place_cells(cellsToPlace);
      console.log(`[UPDATE LATENCY] place_cells: ${(performance.now() - t0).toFixed(1)}ms`);
      console.log('[PLACE] Backend response:', result);

      if ('Err' in result) {
        // Backend rejected - next sync will correct the optimistic update
        console.warn('[PLACE] Backend rejected:', result.Err);
        setPlacementError(result.Err);
      } else {
        // v2 returns the count of cells placed
        const cellsPlaced = result.Ok;
        console.log('[PLACE] SUCCESS! Cells placed:', cellsPlaced);
        // Deduct cost from balance (placement cost goes to base treasury)
        setMyBalance(prev => prev - cellsPlaced);
        setPlacementError(null);
      }
    } catch (err) {
      // Network error - next sync will correct the optimistic update
      console.error('[PLACE] Network error:', err);
      setPlacementError('Network error. Try again.');
    } finally {
      setIsConfirmingPlacement(false);
    }
  }, [actor, pendingPlacements, isConfirmingPlacement, myBalance, localCells, myPlayerNum, bases]);

  // Clear all pending placements
  const cancelPreview = useCallback(() => {
    setPendingPlacements([]);
    setSelectedPlacementIds(new Set());
    setPlacementError(null);
  }, []);

  // Faucet: request 1000 coins
  const handleFaucet = useCallback(async () => {
    if (!actor || isRequestingFaucet) return;

    setIsRequestingFaucet(true);
    try {
      const result = await actor.faucet();
      if ('Ok' in result) {
        setMyBalance(Number(result.Ok));
      } else if ('Err' in result) {
        console.error('Faucet error:', result.Err);
      }
    } catch (err) {
      console.error('Faucet error:', err);
    } finally {
      setIsRequestingFaucet(false);
    }
  }, [actor, isRequestingFaucet]);

  // Handle spectate action from elimination modal
  const handleSpectate = useCallback(() => {
    setIsEliminated(false);
    setMyPlayerNum(null);  // Clear player association
    hadBaseRef.current = false;
    // Keep watching the game without controls
  }, []);

  // Handle rejoin action from elimination modal
  const handleRejoin = useCallback(() => {
    setIsEliminated(false);
    setMyPlayerNum(null);
    setShowSlotSelection(true);  // Go back to slot selection
    // Reset tracking refs for new session
    joinedAtGeneration.current = null;
    peakTerritoryRef.current = 0;
    initialWalletRef.current = myBalance;
    hadBaseRef.current = false;
  }, [myBalance]);

  // Rotate pattern 90° clockwise - affects future placements AND selected existing placements
  const rotateCurrentPattern = useCallback(() => {
    // Rotate for new placements
    setPatternRotation(prev => ((prev + 1) % 4) as 0 | 1 | 2 | 3);

    // Rotate selected pending placements around their centroids
    if (selectedPlacementIds.size > 0) {
      setPendingPlacements(prev => prev.map(placement => {
        if (!selectedPlacementIds.has(placement.id)) return placement;

        // Rotate cells around the centroid
        const [cx, cy] = placement.centroid;
        const rotatedCells: [number, number][] = placement.cells.map(([x, y]) => {
          // Translate to origin (relative to centroid)
          const dx = x - cx;
          const dy = y - cy;
          // Rotate 90° clockwise: (x, y) -> (y, -x)
          const newDx = dy;
          const newDy = -dx;
          // Translate back and wrap toroidally
          return [
            (cx + newDx + GRID_SIZE) % GRID_SIZE,
            (cy + newDy + GRID_SIZE) % GRID_SIZE
          ] as [number, number];
        });

        return { ...placement, cells: rotatedCells };
      }));
    }
  }, [selectedPlacementIds]);

  // Keyboard navigation and preview shortcuts
  // This useEffect must come AFTER confirmPlacement and cancelPreview are defined
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
          e.preventDefault();
          rotateCurrentPattern();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, navigateQuadrant, toggleViewMode, pendingPlacements.length, isConfirmingPlacement, confirmPlacement, cancelPreview, rotateCurrentPattern]);

  // Remove a specific placement from batch (by ID)
  const removePlacement = useCallback((placementId: string) => {
    setPendingPlacements(prev => prev.filter(p => p.id !== placementId));
    setSelectedPlacementIds(prev => {
      const next = new Set(prev);
      next.delete(placementId);
      return next;
    });
  }, []);

  // Toggle selection of a placement
  const togglePlacementSelection = useCallback((placementId: string) => {
    setSelectedPlacementIds(prev => {
      const next = new Set(prev);
      if (next.has(placementId)) {
        next.delete(placementId);
      } else {
        next.add(placementId);
      }
      return next;
    });
  }, []);

  // Select all placements
  const selectAllPlacements = useCallback(() => {
    setSelectedPlacementIds(new Set(pendingPlacements.map(p => p.id)));
  }, [pendingPlacements]);

  // Deselect all placements
  const deselectAllPlacements = useCallback(() => {
    setSelectedPlacementIds(new Set());
  }, []);

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
    setLocalCells(cells => cells.map(() => ({ owner: 0, alive: false })));
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

  // Track peak territory for elimination stats
  if (myPlayerNum && hadBaseRef.current) {
    const myTerritory = territoryCounts[myPlayerNum] || 0;
    if (myTerritory > peakTerritoryRef.current) {
      peakTerritoryRef.current = myTerritory;
    }
  }

  // Base coins per player (v2: coins are stored in bases, not on cells)
  const baseCoins: Record<number, number> = {};
  for (const [playerNum, baseInfo] of bases) {
    baseCoins[playerNum] = Number(baseInfo.coins);
  }

  // Total base coins in game
  const totalBaseCoins = Object.values(baseCoins).reduce((a, b) => a + b, 0);

  // Check if user is spectating (authenticated but not in game)
  const isSpectating = isAuthenticated && !showSlotSelection && myPlayerNum === null;

  // Filter patterns: first by essential/advanced, then by category
  const basePatterns = showAdvanced ? PATTERNS : PATTERNS.filter(p => p.essential);
  const filteredPatterns = selectedCategory === 'all'
    ? basePatterns : basePatterns.filter(p => p.category === selectedCategory);

  // Get categories that have patterns in current mode (to hide empty categories)
  const categoriesWithPatterns = new Set(basePatterns.map(p => p.category));

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Risk</h1>
          <p className="text-gray-400">{GRID_WIDTH}x{GRID_HEIGHT} Persistent World</p>
          <p className="text-gray-500 text-sm mt-2">Up to 9 players - your cells, your territory</p>
        </div>

        {/* Server selector */}
        <div className="flex gap-2">
          {RISK_SERVERS.map((server) => (
            <button
              key={server.id}
              onClick={() => setSelectedServer(server)}
              className={`px-4 py-2 rounded-lg font-mono text-sm transition-all ${
                selectedServer.id === server.id
                  ? 'bg-white/20 text-white border border-white/50'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {server.name}
            </button>
          ))}
        </div>

        <button
          onClick={login}
          disabled={isLoading}
          className="px-6 py-3 rounded-lg font-mono text-lg bg-dfinity-turquoise/20 text-dfinity-turquoise border border-dfinity-turquoise/50 hover:bg-dfinity-turquoise/30 transition-all disabled:opacity-50"
        >
          {isLoading ? 'Connecting...' : 'Login with Internet Identity'}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    );
  }

  // Base placement screen (v2: player must place a base to join)
  if (showSlotSelection) {
    // Determine which quadrants already have bases
    const occupiedQuadrants = new Set<number>();
    for (const slotOpt of slotsInfo) {
      if (slotOpt.length > 0) {
        const slot = slotOpt[0];
        if (slot.base.length > 0) {
          const base = slot.base[0];
          occupiedQuadrants.add(getQuadrant(base.x, base.y));
        }
      }
    }

    const canAffordBase = myBalance >= BASE_COST;

    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-6 p-4">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold text-white mb-2">Build Your Base</h1>
          <p className="text-gray-400">Choose a quadrant to place your fortress</p>
        </div>

        {/* Server selector */}
        <div className="flex gap-2 mb-2">
          {RISK_SERVERS.map((server) => (
            <button
              key={server.id}
              onClick={() => setSelectedServer(server)}
              className={`px-4 py-2 rounded-lg font-mono text-sm transition-all ${
                selectedServer.id === server.id
                  ? 'bg-white/20 text-white border border-white/50'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {server.name}
            </button>
          ))}
        </div>

        {/* Wallet balance and faucet */}
        <div className="flex items-center gap-4 bg-white/5 px-4 py-3 rounded-lg">
          <div className="text-gray-400">
            Wallet: <span className={canAffordBase ? 'text-green-400' : 'text-red-400'}>{myBalance}</span> coins
          </div>
          <button
            onClick={handleFaucet}
            disabled={isRequestingFaucet}
            className="px-3 py-1 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-wait text-white rounded transition-colors"
          >
            {isRequestingFaucet ? '...' : '+1000 coins'}
          </button>
        </div>

        {!canAffordBase && (
          <div className="text-yellow-400 text-sm">
            You need {BASE_COST} coins to build a base. Use the faucet to get coins!
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Quadrant grid for base placement */}
        <div className="grid grid-cols-4 gap-2 max-w-md">
          {Array.from({ length: TOTAL_QUADRANTS }, (_, q) => {
            const isOccupied = occupiedQuadrants.has(q);
            const qRow = Math.floor(q / QUADRANTS_PER_ROW);
            const qCol = q % QUADRANTS_PER_ROW;
            // Place base in center of quadrant
            const baseX = qCol * QUADRANT_SIZE + Math.floor(QUADRANT_SIZE / 2) - Math.floor(BASE_SIZE / 2);
            const baseY = qRow * QUADRANT_SIZE + Math.floor(QUADRANT_SIZE / 2) - Math.floor(BASE_SIZE / 2);

            return (
              <button
                key={q}
                onClick={async () => {
                  if (!actor || isOccupied || !canAffordBase || isJoiningSlot) return;
                  setIsJoiningSlot(true);
                  setError(null);
                  try {
                    const result = await actor.join_game(baseX, baseY);
                    if ('Ok' in result) {
                      // Backend returns slot index (0-7), but myPlayerNum is 1-indexed (1-8)
                      setMyPlayerNum(result.Ok + 1);

                      // Initialize elimination tracking for this session
                      setIsEliminated(false);
                      setEliminationStats(null);
                      peakTerritoryRef.current = 0;
                      hadBaseRef.current = true; // Mark that we now have a base

                      // Immediately fetch game state so grid renders correctly
                      try {
                        const state = await actor.get_state();
                        setGameState(state);
                        setLocalCells(sparseToDense(state));
                        setLocalGeneration(state.generation);
                        setLastSyncedGeneration(state.generation);

                        // Initialize join tracking with current generation and balance
                        joinedAtGeneration.current = state.generation;

                        // Extract base info
                        const newBases = new Map<number, BaseInfo>();
                        for (let i = 0; i < state.slots.length; i++) {
                          const slotOpt = state.slots[i];
                          if (slotOpt.length > 0 && slotOpt[0].base.length > 0) {
                            newBases.set(i + 1, slotOpt[0].base[0]);
                          }
                        }
                        setBases(newBases);

                        // Update balance and track initial for elimination stats
                        const balance = await actor.get_balance();
                        setMyBalance(Number(balance));
                        initialWalletRef.current = Number(balance);

                        // Update wipe timer
                        setWipeInfo({
                          quadrant: state.next_wipe_quadrant,
                          secondsUntil: Number(state.seconds_until_wipe)
                        });
                      } catch (syncErr) {
                        console.error('Post-join sync error:', syncErr);
                      }

                      // Set view coordinates to the player's quadrant (for highlight in overview)
                      // but stay in overview mode initially to avoid canvas sizing race condition
                      const qRow = Math.floor(q / QUADRANTS_PER_ROW);
                      const qCol = q % QUADRANTS_PER_ROW;
                      setViewX(qCol * QUADRANT_SIZE);
                      setViewY(qRow * QUADRANT_SIZE);
                      // Stay in 'overview' mode - user can click to enter quadrant after canvas is ready
                      setShowSlotSelection(false);
                    } else {
                      setError(result.Err);
                    }
                  } catch (err) {
                    setError(`Failed to place base: ${err}`);
                  } finally {
                    setIsJoiningSlot(false);
                  }
                }}
                disabled={isOccupied || !canAffordBase || isJoiningSlot}
                className={`
                  relative p-4 rounded-lg border-2 transition-all aspect-square flex flex-col items-center justify-center
                  ${isOccupied
                    ? 'bg-red-900/30 border-red-700/50 opacity-50 cursor-not-allowed'
                    : canAffordBase
                      ? 'bg-white/5 border-white/20 hover:border-green-400 hover:bg-green-500/10 cursor-pointer'
                      : 'bg-gray-800 border-gray-700 opacity-50 cursor-not-allowed'
                  }
                `}
              >
                <div className="text-white font-mono text-lg">Q{q}</div>
                {isOccupied ? (
                  <div className="text-red-400 text-xs mt-1">Occupied</div>
                ) : (
                  <div className="text-green-400 text-xs mt-1">Available</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="text-gray-600 text-xs mt-4 max-w-md text-center">
          Cost: {BASE_COST} coins. Your base is an 8x8 fortress with a 6x6 interior territory.
          Defend it from siege attacks or lose when your base reaches 0 coins!
        </div>
      </div>
    );
  }

  // Game view - all JSX inlined to prevent component remounting
  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Error display */}
      {error && (
        <div className="p-2 bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar - INLINED */}
        <div className={`
          hidden lg:flex flex-col
          ${sidebarCollapsed ? 'w-12' : 'w-72'}
          transition-[width] duration-300 ease-in-out
          bg-black border-r border-white/20
          overflow-hidden flex-shrink-0
        `}>
          {/* Toggle button */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-3 hover:bg-white/10 flex items-center justify-center border-b border-white/20"
          >
            <span className="text-gray-400 text-lg">{sidebarCollapsed ? '>>' : '<<'}</span>
          </button>

          {/* Content - hidden when collapsed */}
          <div className={`${sidebarCollapsed ? 'hidden' : 'flex flex-col'} flex-1 overflow-y-auto p-3`} style={{ overscrollBehavior: 'contain' }}>
            {/* Info Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold text-white">Risk</h1>
                <button
                  onClick={() => setShowTutorial(true)}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                  title="How to play"
                >
                  ?
                </button>
              </div>
              {/* Server selector */}
              <div className="flex gap-1 mt-1 mb-2">
                {RISK_SERVERS.map((server) => (
                  <button
                    key={server.id}
                    onClick={() => setSelectedServer(server)}
                    className={`px-2 py-0.5 rounded text-xs font-mono transition-all ${
                      selectedServer.id === server.id
                        ? 'bg-dfinity-turquoise/30 text-dfinity-turquoise border border-dfinity-turquoise/50'
                        : 'bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {server.name}
                  </button>
                ))}
              </div>
              <p className="text-gray-500 text-xs">
                {myPlayerNum ? (
                  <>You are Player {myPlayerNum} <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: PLAYER_COLORS[myPlayerNum] }}></span></>
                ) : isSpectating ? (
                  <span className="text-purple-400">👁 Spectating</span>
                ) : (
                  'Place cells to join'
                )}
              </p>
              {isSpectating && (
                <button
                  onClick={() => setShowSlotSelection(true)}
                  className="mt-2 w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors"
                >
                  Join Game
                </button>
              )}
              <div className="mt-2 text-sm font-mono space-y-1">
                <div className="text-gray-400">
                  Gen: <span className="text-dfinity-turquoise">{gameState?.generation.toString() || 0}</span>
                </div>
                <div className="text-gray-400">Players: {gameState?.slots.filter(s => s.length > 0).length || 0}/8</div>
                <div className="text-gray-400 flex items-center gap-2">
                  Wallet: <span className="text-yellow-400">{myBalance}</span>
                  <button
                    onClick={handleFaucet}
                    disabled={isRequestingFaucet}
                    className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-wait text-white rounded transition-colors"
                    title="Get 1000 free coins"
                  >
                    {isRequestingFaucet ? '...' : '+1000'}
                  </button>
                </div>
                {/* Prominent cell count with action guidance */}
                {myPlayerNum && (
                  <div className={`mt-2 p-2 rounded ${
                    (cellCounts[myPlayerNum] || 0) === 0
                      ? 'bg-blue-500/20 border border-blue-500/50'
                      : (cellCounts[myPlayerNum] || 0) < 10
                        ? 'bg-yellow-500/20 border border-yellow-500/50'
                        : 'bg-white/5 border border-white/10'
                  }`}>
                    <div className="text-xs text-gray-400">Your Cells</div>
                    <div className={`text-xl font-bold ${
                      (cellCounts[myPlayerNum] || 0) === 0
                        ? 'text-blue-400'
                        : (cellCounts[myPlayerNum] || 0) < 10
                          ? 'text-yellow-400'
                          : 'text-white'
                    }`}>
                      {(cellCounts[myPlayerNum] || 0).toLocaleString()}
                    </div>
                    {(cellCounts[myPlayerNum] || 0) === 0 && (
                      <div className="text-blue-300 text-xs mt-1">
                        {viewMode === 'overview'
                          ? 'Click a quadrant to place cells!'
                          : 'Click on the grid to place a pattern!'}
                      </div>
                    )}
                    {(cellCounts[myPlayerNum] || 0) > 0 && (cellCounts[myPlayerNum] || 0) < 10 && (
                      <div className="text-yellow-400 text-xs mt-1">Low cells - place more!</div>
                    )}
                  </div>
                )}
              </div>
              {/* Player stats table (v2: shows base coins instead of cell coins) */}
              <div className="mt-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-normal pb-1"></th>
                      <th className="text-right font-normal pb-1 px-1 cursor-help" title="Territory: Total cells you own (faded color). Expands when your living cells touch neutral ground.">Terr</th>
                      <th className="text-right font-normal pb-1 px-1 cursor-help" title="Living Cells: Active cells following Game of Life rules. Need 2-3 neighbors to survive.">Cells</th>
                      <th className="text-right font-normal pb-1 px-1 cursor-help" title="Base Treasury: Coins stored in your fortress. Drained by 1 each time enemies touch your territory. Reach 0 = eliminated!">Base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(bases.keys()).sort((a, b) => a - b).map((playerNum) => {
                      const territory = territoryCounts[playerNum] || 0;
                      const cells = cellCounts[playerNum] || 0;
                      const coins = baseCoins[playerNum] || 0;
                      const isMe = playerNum === myPlayerNum;
                      return (
                        <tr key={playerNum} className={`border-t border-gray-800 ${isMe ? 'bg-white/5' : ''}`}>
                          <td className="py-0.5">
                            <div className="flex items-center gap-1">
                              {isMe && <span className="text-white text-[10px]">▶</span>}
                              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: PLAYER_COLORS[playerNum] }} />
                              <span className={isMe ? 'text-white font-medium' : 'text-gray-400'}>P{playerNum}</span>
                            </div>
                          </td>
                          <td className="text-right px-1" style={{ color: PLAYER_COLORS[playerNum], opacity: 0.6 }}>
                            {territory.toLocaleString()}
                          </td>
                          <td className="text-right px-1" style={{ color: PLAYER_COLORS[playerNum] }}>
                            {cells.toLocaleString()}
                          </td>
                          <td className="text-right px-1 text-yellow-500">
                            <span className="opacity-70">🪙</span> {coins}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="text-xs mt-2 border-t border-gray-700 pt-2 space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Total base coins:</span>
                    <span className="text-yellow-500">🪙 {totalBaseCoins.toLocaleString()}</span>
                  </div>
                  {myPlayerNum && (
                    <div className="flex justify-between text-gray-500">
                      <span className="cursor-help" title="Your spendable coins. Use these to place patterns. Coins flow: Wallet → Base (when placing) and Enemy Base → Your Wallet (when attacking).">Your wallet:</span>
                      <span className="text-green-400">🪙 {myBalance.toLocaleString()}</span>
                    </div>
                  )}
                  {myPlayerNum && (
                    <div className="flex justify-between text-gray-600 text-[10px] pt-1 border-t border-gray-800">
                      <span>Total (base + wallet):</span>
                      <span className="text-yellow-400">🪙 {((baseCoins[myPlayerNum] || 0) + myBalance).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Minimap - INLINED */}
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

              {/* Wipe Timer Display */}
              {wipeInfo && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="text-xs text-gray-500 mb-2">Quadrant Wipes</div>
                  <div className="flex items-end justify-between gap-1">
                    {/* Next quadrant to wipe (largest) */}
                    <button
                      onClick={() => jumpToQuadrant(wipeInfo.quadrant)}
                      className={`flex-1 flex flex-col items-center justify-center rounded py-2 transition-colors ${
                        wipeInfo.secondsUntil <= 10
                          ? 'bg-red-500/20 border border-red-500/50'
                          : 'bg-red-500/10 border border-red-500/30 hover:bg-red-500/20'
                      }`}
                      title={`Click to view Q${wipeInfo.quadrant}`}
                    >
                      <span className="text-red-400 text-sm font-bold font-mono">Q{wipeInfo.quadrant}</span>
                      <span className={`text-lg font-mono font-bold ${wipeInfo.secondsUntil <= 10 ? 'text-red-500 animate-pulse' : 'text-red-400'}`}>
                        {wipeInfo.secondsUntil}s
                      </span>
                    </button>

                    {/* Second quadrant (medium) - orange */}
                    <button
                      onClick={() => jumpToQuadrant((wipeInfo.quadrant + 1) % TOTAL_QUADRANTS)}
                      className="flex-1 flex flex-col items-center justify-center bg-orange-500/10 border border-orange-500/20 rounded py-1.5 hover:bg-orange-500/20 transition-colors"
                      title={`Click to view Q${(wipeInfo.quadrant + 1) % TOTAL_QUADRANTS}`}
                    >
                      <span className="text-orange-500/70 text-xs font-mono">Q{(wipeInfo.quadrant + 1) % TOTAL_QUADRANTS}</span>
                      <span className="text-orange-600/70 text-sm font-mono">+5m</span>
                    </button>

                    {/* Third quadrant (smallest) - yellow */}
                    <button
                      onClick={() => jumpToQuadrant((wipeInfo.quadrant + 2) % TOTAL_QUADRANTS)}
                      className="flex-1 flex flex-col items-center justify-center bg-yellow-500/10 border border-yellow-500/20 rounded py-1 hover:bg-yellow-500/20 transition-colors"
                      title={`Click to view Q${(wipeInfo.quadrant + 2) % TOTAL_QUADRANTS}`}
                    >
                      <span className="text-yellow-500/70 text-xs font-mono">Q{(wipeInfo.quadrant + 2) % TOTAL_QUADRANTS}</span>
                      <span className="text-yellow-600/70 text-xs">+10m</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pattern Section - hidden when spectating */}
            {!isSpectating && (
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Patterns</span>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className={`text-xs px-2 py-1 rounded font-mono ${
                    showAdvanced
                      ? 'bg-purple-600 text-white border border-purple-400'
                      : 'bg-gray-700 text-gray-200 border border-gray-500 hover:bg-gray-600'
                  }`}
                >
                  {showAdvanced ? 'Show Essential' : 'Show All'}
                </button>
              </div>
              {/* Category filter buttons */}
              <div className="flex flex-col gap-1 mb-3">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded text-xs font-mono text-left ${
                    selectedCategory === 'all'
                      ? 'bg-white/20 text-white border border-white/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  All Patterns
                </button>
                {(Object.keys(CATEGORY_INFO) as PatternCategory[])
                  .filter(cat => categoriesWithPatterns.has(cat))
                  .map((cat) => {
                    const info = CATEGORY_INFO[cat];
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded text-xs font-mono border text-left ${
                          selectedCategory === cat ? info.color : 'text-gray-400 border-transparent hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {info.icon} {info.label}
                      </button>
                    );
                  })}
              </div>
              {/* Pattern buttons */}
              <div className="grid grid-cols-2 gap-1">
                {filteredPatterns.map((pattern) => {
                  const catInfo = CATEGORY_INFO[pattern.category];
                  const isSelected = selectedPattern.name === pattern.name;
                  return (
                    <button
                      key={pattern.name}
                      onClick={() => setSelectedPattern(pattern)}
                      className={`px-2 py-1.5 rounded text-xs font-mono border ${
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
              </div>
            </div>
            )}
          </div>

          {/* Collapsed indicators */}
          <div className={`${sidebarCollapsed ? 'flex flex-col items-center py-4 gap-2' : 'hidden'}`}>
            <div className="text-xs text-gray-400">G</div>
            <div className="text-dfinity-turquoise text-xs font-mono">{gameState?.generation.toString() || 0}</div>
            <div className="text-xs text-gray-400 mt-2">P</div>
            <div className="text-white text-xs font-mono">{gameState?.slots.filter(s => s.length > 0).length || 0}</div>
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
          {/* Pending placements panel */}
          {pendingPlacements.length > 0 && viewMode === 'quadrant' && (
            <div className="absolute top-2 left-2 z-10 bg-black/90 border border-white/30 text-white px-4 py-3 rounded-lg text-sm max-w-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-dfinity-turquoise">
                  {pendingPlacements.length} pattern{pendingPlacements.length > 1 ? 's' : ''}
                </span>
                <span className="text-gray-400">
                  Cost: <span className={myBalance >= pendingPlacements.reduce((sum, p) => sum + p.cells.length, 0) ? 'text-green-400' : 'text-red-400'}>
                    {pendingPlacements.reduce((sum, p) => sum + p.cells.length, 0)}
                  </span> / {myBalance} coins
                </span>
              </div>

              {/* Selection controls */}
              {pendingPlacements.length > 1 && (
                <div className="flex items-center gap-2 mb-2 text-xs">
                  <span className="text-gray-500">Rotate:</span>
                  <button
                    onClick={selectAllPlacements}
                    className={`px-2 py-0.5 rounded ${selectedPlacementIds.size === pendingPlacements.length ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={deselectAllPlacements}
                    className={`px-2 py-0.5 rounded ${selectedPlacementIds.size === 0 ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                  >
                    None
                  </button>
                  <span className="text-gray-500 ml-auto">{selectedPlacementIds.size}/{pendingPlacements.length} selected</span>
                </div>
              )}

              {/* List of pending placements */}
              <div className="max-h-32 overflow-y-auto mb-2 space-y-1">
                {pendingPlacements.map((placement, idx) => {
                  const isSelected = selectedPlacementIds.has(placement.id);
                  return (
                    <div key={placement.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${isSelected ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-white/5'}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePlacementSelection(placement.id)}
                        className="w-3 h-3 accent-blue-500 cursor-pointer"
                        title="Select for rotation"
                      />
                      <span className={`flex-1 ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                        {idx + 1}. {placement.patternName} ({placement.cells.length} cells)
                      </span>
                      <button
                        onClick={() => removePlacement(placement.id)}
                        className="text-red-400 hover:text-red-300 px-1"
                        title="Remove this placement"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Error message */}
              {placementError && (
                <div className="text-red-400 text-xs mb-2 bg-red-500/20 px-2 py-1 rounded">
                  {placementError}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={rotateCurrentPattern}
                  className="px-3 py-1.5 rounded font-mono text-sm bg-blue-600 hover:bg-blue-500 text-white transition-all"
                  title="Rotate selected placements 90° clockwise (R)"
                >
                  ↻ Rotate{selectedPlacementIds.size > 0 ? ` (${selectedPlacementIds.size})` : ''}
                </button>
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
                Click grid to add more • R to rotate • Enter to confirm • Esc to cancel
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


          {/* Canvas Container - fills available space */}
          <div ref={containerRef} className="flex-1 w-full min-h-0 relative">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onContextMenu={(e) => e.preventDefault()}
              className={`w-full h-full ${viewMode === 'quadrant' ? 'cursor-crosshair' : 'cursor-pointer'}`}
              style={{ display: 'block' }}
            />

            {/* Sync Debug Overlay - Optimistic Local Simulation */}
            {DEBUG_SYNC && (
              <div style={{
                position: 'absolute',
                top: 8,
                right: 8,
                padding: '8px 12px',
                background: 'rgba(0, 0, 0, 0.8)',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'monospace',
                color: '#fff',
                zIndex: 1000,
                minWidth: 160,
              }}>
                {ENABLE_LOCAL_SIM ? (
                  <>
                    <div style={{ color: '#4ade80', marginBottom: 4 }}>◉ Local Sim Active</div>
                    <div>Backend: Gen {lastSyncedGeneration.toString()}</div>
                    <div>Local: Gen {localGeneration.toString()}</div>
                    <div style={{ opacity: 0.7, fontSize: 10 }}>
                      +{Number(localGeneration - lastSyncedGeneration)} since snap
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>◉ Backend Mode</div>
                    <div style={{ fontSize: 10, opacity: 0.9 }}>Sync: {BACKEND_SYNC_MS}ms</div>
                    <div style={{ fontSize: 9, opacity: 0.7, marginTop: 4 }}>Displaying backend state</div>
                  </>
                )}
              </div>
            )}

            {/* Navigation arrows - subtle, inside grid */}
            {viewMode === 'quadrant' && (
              <>
                <button
                  onClick={() => navigateQuadrant('up')}
                  className="hidden md:flex absolute top-2 left-1/2 -translate-x-1/2 items-center justify-center w-10 h-5 bg-white/10 hover:bg-white/30 rounded text-gray-500 hover:text-white transition-colors z-10"
                  title="W / ↑"
                >
                  <span className="text-sm">▲</span>
                </button>
                <button
                  onClick={() => navigateQuadrant('down')}
                  className="hidden md:flex absolute bottom-2 left-1/2 -translate-x-1/2 items-center justify-center w-10 h-5 bg-white/10 hover:bg-white/30 rounded text-gray-500 hover:text-white transition-colors z-10"
                  title="S / ↓"
                >
                  <span className="text-sm">▼</span>
                </button>
                <button
                  onClick={() => navigateQuadrant('left')}
                  className="hidden md:flex absolute top-1/2 -translate-y-1/2 items-center justify-center w-5 h-10 bg-white/10 hover:bg-white/30 rounded text-gray-500 hover:text-white transition-colors z-10"
                  style={{ left: '-1.5rem' }}
                  title="A / ←"
                >
                  <span className="text-sm">◀</span>
                </button>
                <button
                  onClick={() => navigateQuadrant('right')}
                  className="hidden md:flex absolute top-1/2 -translate-y-1/2 items-center justify-center w-5 h-10 bg-white/10 hover:bg-white/30 rounded text-gray-500 hover:text-white transition-colors z-10"
                  style={{ right: '-1.5rem' }}
                  title="D / →"
                >
                  <span className="text-sm">▶</span>
                </button>
              </>
            )}

            {/* View Overview button */}
            {viewMode === 'quadrant' && (
              <button
                onClick={toggleViewMode}
                className="absolute top-2 left-2 z-10 px-2 py-1 bg-black/70 hover:bg-black/90 border border-white/20 hover:border-white/40 rounded text-xs text-gray-300 hover:text-white transition-all font-mono flex items-center gap-1"
                title="View Overview (Space)"
              >
                <span>‹</span> Overview
              </button>
            )}

            {/* Keyboard hints */}
            {viewMode === 'quadrant' && (
              <div className="hidden sm:block absolute top-2 left-28 z-10 text-xs text-gray-500 font-mono">
                [Space] • WASD • R rotate
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar - INLINED */}
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
            {/* Compact wipe indicator for mobile */}
            {wipeInfo && (
              <button
                onClick={() => jumpToQuadrant(wipeInfo.quadrant)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                  wipeInfo.secondsUntil <= 10 ? 'bg-red-500/30 animate-pulse' : 'bg-red-500/20'
                }`}
              >
                <span className="text-red-400">Q{wipeInfo.quadrant}</span>
                <span className="text-red-500 font-bold">{wipeInfo.secondsUntil}s</span>
              </button>
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
          <div className="p-3 border-t border-white/10 max-h-64 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
            {/* Swipe hint for mobile quadrant navigation */}
            {viewMode === 'quadrant' && (
              <div className="text-xs text-gray-500 mb-3">
                Swipe on grid to navigate • Q{currentQuadrant} ({viewX}, {viewY})
              </div>
            )}

            {/* Territory/cell stats */}
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
            {/* Pattern controls - hidden when spectating */}
            {!isSpectating && (
            <>
            {/* Essential/Advanced toggle + Category filters */}
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className={`px-2 py-1 rounded text-xs font-mono whitespace-nowrap border ${
                  showAdvanced
                    ? 'bg-purple-600 text-white border-purple-400'
                    : 'bg-gray-700 text-gray-200 border-gray-500'
                }`}
              >
                {showAdvanced ? 'Essential' : 'All'}
              </button>
              <span className="text-gray-600">|</span>
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-1 rounded text-xs font-mono whitespace-nowrap ${
                  selectedCategory === 'all' ? 'bg-white/20 text-white' : 'text-gray-400'
                }`}
              >
                All
              </button>
              {(Object.keys(CATEGORY_INFO) as PatternCategory[])
                .filter(cat => categoriesWithPatterns.has(cat))
                .map((cat) => {
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
            {/* Pattern selector */}
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
            <div className="text-xs text-gray-400 mt-2">
              <span className={CATEGORY_INFO[selectedPattern.category].color.split(' ')[0]}>{selectedPattern.name}</span> ({parsedPattern.length} cells)
            </div>
            </>
            )}
            {/* Spectator mode indicator in mobile */}
            {isSpectating && (
              <div className="py-2">
                <p className="text-purple-400 text-sm mb-2">👁 Spectating</p>
                <button
                  onClick={() => setShowSlotSelection(true)}
                  className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors"
                >
                  Join Game
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Elimination Modal */}
      {isEliminated && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-500/50 rounded-lg p-6 max-w-sm mx-4 text-center">
            <div className="text-4xl mb-2">💀</div>
            <h2 className="text-2xl font-bold text-red-400 mb-2">ELIMINATED</h2>
            <p className="text-gray-400 mb-4">Your base was destroyed!</p>

            {eliminationStats && (
              <div className="bg-black/50 rounded p-3 mb-4 text-sm text-left">
                <div className="flex justify-between text-gray-500">
                  <span>Survived:</span>
                  <span className="text-white">
                    {eliminationStats.generationsSurvived.toLocaleString()} gen
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Peak territory:</span>
                  <span className="text-white">
                    {eliminationStats.peakTerritory.toLocaleString()} cells
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Coins earned:</span>
                  <span className={eliminationStats.coinsEarned >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {eliminationStats.coinsEarned >= 0 ? '+' : ''}{eliminationStats.coinsEarned}
                  </span>
                </div>
              </div>
            )}

            <div className="text-gray-500 text-sm mb-4">
              Wallet: <span className="text-green-400">🪙 {myBalance}</span>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleSpectate}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Spectate
              </button>
              <button
                onClick={handleRejoin}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
              >
                Rejoin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial Modal */}
      <RiskTutorial
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
        playerColor={myPlayerNum ? PLAYER_COLORS[myPlayerNum] : PLAYER_COLORS[1]}
      />
    </div>
  );
};
