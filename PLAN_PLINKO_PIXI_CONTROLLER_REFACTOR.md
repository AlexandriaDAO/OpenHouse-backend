# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-refactor"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-refactor`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cd openhouse_frontend
   npm install
   npm run build
   cd ..
   ./deploy.sh --frontend-only
   ```

4. **Verify deployment**:
   ```bash
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "refactor(plinko): migrate to controller-based Pixi architecture

   - Replace 5 competing useEffects with single PlinkoController
   - Move all animation state from React into Pixi ticker loop
   - Add @pixi/react for declarative stage management
   - Fix memory leaks (setTimeout tracking, event listener cleanup)
   - Reduce PlinkoGame.tsx from 597 to ~250 lines
   - Delete PlinkoCanvas.tsx bridge layer (170 lines)
   - Net ~25% LOC reduction with cleaner architecture"
   git push -u origin feature/plinko-pixi-controller-refactor
   gh pr create --title "Refactor: Plinko Pixi Controller Architecture" --body "$(cat <<'EOF'
## Summary
- Migrates Plinko frontend from React-driven animation to controller-based Pixi architecture
- All animation state now lives in PlinkoController, eliminating React<->Pixi sync issues
- Fixes identified memory leaks and race conditions
- Establishes pattern for future games (Blackjack, Crash, Roulette)

## Changes
- **New**: `PlinkoController.ts` - Single state machine for all game animation
- **New**: `PlinkoStage.tsx` - @pixi/react Stage wrapper
- **Modified**: `PlinkoGame.tsx` - Simplified to UI-only concerns (~250 lines)
- **Deleted**: `PlinkoCanvas.tsx` - No longer needed (was bridge layer)
- **Deleted**: `PlinkoPixiApp.ts` - Merged into controller
- **Deleted**: `ResultOverlay.tsx` - Was dead code (unused)

## Test plan
- [ ] Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
- [ ] Single ball drop works with animation
- [ ] Multi-ball (10+ balls) works without visual glitches
- [ ] Rapid clicking doesn't cause animation pile-up
- [ ] Result display shows correct multiplier/profit
- [ ] Balance updates after game completion

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- After sleep: IMMEDIATELY continue (no pause)
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/plinko-pixi-controller-refactor`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-refactor`

---

# Implementation Plan: Plinko Pixi Controller Refactor

## Task Classification
**REFACTORING**: Improve existing code with subtractive + targeted fixes approach.

## Problem Statement

The current Plinko frontend has architectural issues that make it hard to maintain and will multiply if copied for future games:

1. **Two sources of truth**: React state and Pixi state are constantly synced via 5 competing `useEffect` hooks
2. **Memory leaks**: Untracked `setTimeout` IDs in `BucketRenderer.fillBucket()` pile up on rapid plays
3. **Stale closure workarounds**: Refs used to work around React dependency tracking issues
4. **16 useState calls**: Complex state that should be consolidated
5. **Dead code**: `ResultOverlay.tsx` is exported but never imported/used

## Solution: Controller-Based Architecture

Move all animation state into a single `PlinkoController` class that runs in the Pixi ticker loop. React only handles:
- UI chrome (betting panel, balance display, error messages)
- Backend API calls
- Passing config to controller and receiving completion events

## Current State (BEFORE)

### File Structure
```
openhouse_frontend/src/
├── pages/plinko/
│   ├── PlinkoGame.tsx              # 597 lines - Main game + ALL state
│   ├── PlinkoLayout.tsx            # 14 lines - Router wrapper
│   └── PlinkoLiquidity.tsx         # 5 lines - Liquidity provider
├── components/game-specific/plinko/
│   ├── PlinkoCanvas.tsx            # 170 lines - React→Pixi bridge (DELETE)
│   ├── index.ts                    # 3 lines
│   ├── pixi/
│   │   ├── PlinkoPixiApp.ts        # 182 lines - Orchestrator (MERGE INTO CONTROLLER)
│   │   ├── BallRenderer.ts         # 134 lines - Keep, fix cleanup
│   │   ├── BucketRenderer.ts       # 258 lines - Keep, fix memory leak
│   │   ├── SlotRenderer.ts         # 181 lines - Keep
│   │   ├── PegRenderer.ts          # 54 lines - Keep
│   │   ├── LayoutConfig.ts         # 88 lines - Keep
│   │   └── index.ts                # 4 lines
│   └── ui/
│       ├── ResultOverlay.tsx       # 140 lines - DEAD CODE (DELETE)
│       └── index.ts                # 1 line
```

**Total current LOC: ~1,831 lines**

### Current Architecture Problems

```
PlinkoGame.tsx (16 useState, 4 useEffect)
    │
    ├── gamePhase state ──────────────┐
    ├── fillProgress state ───────────┤
    ├── doorOpen state ───────────────┤ DUPLICATE STATE
    ├── pendingPaths state ───────────┤
    ├── isPlaying state ──────────────┘
    │
    └── PlinkoCanvas.tsx (5 useEffect hooks)
        │
        ├── Effect 1: Sync refs with props (workaround)
        ├── Effect 2: Initialize Pixi app
        ├── Effect 3: Update multipliers
        ├── Effect 4: Handle game phase (30+ lines)
        └── Effect 5: Handle door state (COMPETES with Effect 4)
            │
            └── PlinkoPixiApp.ts
                └── setGamePhase() called from BOTH effects!
```

## Target State (AFTER)

### File Structure
```
openhouse_frontend/src/
├── pages/plinko/
│   ├── PlinkoGame.tsx              # ~250 lines - UI only
│   ├── PlinkoLayout.tsx            # 14 lines - unchanged
│   └── PlinkoLiquidity.tsx         # 5 lines - unchanged
├── components/game-specific/plinko/
│   ├── PlinkoStage.tsx             # ~100 lines - NEW: @pixi/react wrapper
│   ├── PlinkoController.ts         # ~350 lines - NEW: All animation state
│   ├── index.ts                    # 2 lines - updated exports
│   └── pixi/
│       ├── BallRenderer.ts         # ~130 lines - minor cleanup
│       ├── BucketRenderer.ts       # ~240 lines - fix memory leak
│       ├── SlotRenderer.ts         # ~175 lines - minor cleanup
│       ├── PegRenderer.ts          # ~50 lines - unchanged
│       ├── LayoutConfig.ts         # ~88 lines - unchanged
│       └── index.ts                # 3 lines - updated exports
```

**Total target LOC: ~1,404 lines (23% reduction)**

### Files to DELETE
- `PlinkoCanvas.tsx` (170 lines) - replaced by PlinkoStage
- `PlinkoPixiApp.ts` (182 lines) - merged into PlinkoController
- `ResultOverlay.tsx` (140 lines) - dead code, never used
- `ui/index.ts` (1 line) - no longer needed

### New Architecture

```
PlinkoGame.tsx (5 useState, 1 useEffect)
    │
    ├── betAmount, ballCount, error, result (UI state only)
    │
    └── PlinkoStage.tsx (1 useEffect for controller lifecycle)
        │
        └── PlinkoController.ts (ALL animation state)
            │
            ├── phase: 'idle' | 'filling' | 'releasing' | 'animating' | 'complete'
            ├── fillProgress, doorOpen, paths (internal, not React state)
            │
            ├── startGame(paths, onComplete) ← Single entry point
            ├── update(delta) ← Ticker loop handles ALL transitions
            │
            └── Renderers (unchanged)
                ├── PegRenderer
                ├── SlotRenderer
                ├── BallRenderer
                └── BucketRenderer
```

## Implementation Steps

### Step 1: Install @pixi/react

```bash
cd openhouse_frontend
npm install @pixi/react
```

### Step 2: Create PlinkoController.ts

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoController.ts` (NEW)

```typescript
// PSEUDOCODE - Full implementation

import { Application, Container, Ticker } from 'pixi.js';
import { LAYOUT, getCenterX } from './pixi/LayoutConfig';
import { PegRenderer } from './pixi/PegRenderer';
import { SlotRenderer } from './pixi/SlotRenderer';
import { BallRenderer } from './pixi/BallRenderer';
import { BucketRenderer } from './pixi/BucketRenderer';

export type GamePhase = 'idle' | 'filling' | 'releasing' | 'animating' | 'complete';

export interface GameResult {
  finalPositions: number[];
  completed: boolean;
}

export interface PlinkoControllerConfig {
  rows: number;
  multipliers: number[];
  onDropClick?: () => void;
}

export class PlinkoController {
  private app: Application;
  private config: PlinkoControllerConfig;
  private centerX: number;
  private isInitialized = false;

  // Containers
  private mainContainer: Container;

  // Renderers
  private pegRenderer: PegRenderer;
  private slotRenderer: SlotRenderer;
  private ballRenderer: BallRenderer;
  private bucketRenderer: BucketRenderer;

  // Animation state (ALL state lives here, not in React)
  private phase: GamePhase = 'idle';
  private fillProgress = 0;
  private targetBallCount = 0;
  private fillTimer = 0;
  private pendingPaths: boolean[][] = [];
  private droppedBallCount = 0;
  private dropTimer = 0;

  // Completion callback (set per-game)
  private onGameComplete?: (result: GameResult) => void;

  // Timeout tracking for cleanup
  private pendingTimeouts: NodeJS.Timeout[] = [];

  constructor(app: Application, config: PlinkoControllerConfig) {
    this.app = app;
    this.config = config;
    this.centerX = getCenterX();
    this.mainContainer = new Container();

    // Initialize renderers
    this.pegRenderer = new PegRenderer(config.rows);
    this.slotRenderer = new SlotRenderer(config.rows, config.multipliers);
    this.ballRenderer = new BallRenderer(config.rows, this.handleBallLanded.bind(this));
    this.bucketRenderer = new BucketRenderer();
  }

  async init(): Promise<void> {
    // Add main container to stage
    this.app.stage.addChild(this.mainContainer);

    // Initialize all renderers
    await this.pegRenderer.init(this.mainContainer, this.centerX);
    await this.slotRenderer.init(this.mainContainer, this.centerX, this.config.rows);
    await this.ballRenderer.init(this.mainContainer, this.centerX);
    await this.bucketRenderer.init(this.mainContainer, this.centerX);

    // Set up bucket click handler
    if (this.config.onDropClick) {
      this.bucketRenderer.setOnClick(() => {
        if (this.phase === 'idle') {
          this.config.onDropClick?.();
        }
      });
    }

    // Enable bucket interaction
    this.bucketRenderer.setInteractive(true);

    // Start ticker
    this.app.ticker.add(this.update, this);

    this.isInitialized = true;
  }

  // ============================================
  // PUBLIC API - React calls these methods
  // ============================================

  /**
   * Start a new game. React calls this ONCE with paths from backend.
   * Controller handles entire animation sequence autonomously.
   */
  startGame(paths: boolean[][], ballCount: number, onComplete: (result: GameResult) => void): void {
    if (this.phase !== 'idle') {
      console.warn('Cannot start game while another is in progress');
      return;
    }

    // Store completion callback
    this.onGameComplete = onComplete;

    // Store game config
    this.pendingPaths = paths;
    this.targetBallCount = ballCount;

    // Reset animation state
    this.fillProgress = 0;
    this.fillTimer = 0;
    this.droppedBallCount = 0;
    this.dropTimer = 0;

    // Clear any pending timeouts from previous games
    this.clearPendingTimeouts();

    // Transition to filling phase
    this.phase = 'filling';
    this.bucketRenderer.setInteractive(false);

    // Start bucket fill animation
    this.bucketRenderer.fillBucket(ballCount);
  }

  /**
   * Update multipliers (called when backend returns different values)
   */
  updateMultipliers(multipliers: number[]): void {
    this.config.multipliers = multipliers;
    this.slotRenderer.updateMultipliers(multipliers);
  }

  /**
   * Set interactive state of drop bucket
   */
  setDropEnabled(enabled: boolean): void {
    if (this.phase === 'idle') {
      this.bucketRenderer.setInteractive(enabled);
    }
  }

  // ============================================
  // TICKER UPDATE - All animation logic here
  // ============================================

  private update(ticker: Ticker): void {
    const delta = ticker.deltaMS;

    // Update renderers (they have their own animations)
    this.ballRenderer.update(delta);
    this.bucketRenderer.update(delta);

    // Phase-specific updates
    switch (this.phase) {
      case 'filling':
        this.updateFilling(delta);
        break;
      case 'releasing':
        this.updateReleasing(delta);
        break;
      case 'animating':
        this.updateAnimating(delta);
        break;
      case 'complete':
        this.updateComplete();
        break;
    }
  }

  private updateFilling(delta: number): void {
    // Fill bucket with balls over ~1.2 seconds
    const intervalTime = Math.max(40, 1200 / this.targetBallCount);
    this.fillTimer += delta;

    if (this.fillTimer >= intervalTime) {
      this.fillTimer -= intervalTime;
      this.fillProgress++;

      // Check if fill complete
      if (this.fillProgress >= this.targetBallCount) {
        // Transition to releasing
        this.phase = 'releasing';
        this.bucketRenderer.openDoor();
      }
    }
  }

  private updateReleasing(delta: number): void {
    // Wait for door to open (300ms)
    // BucketRenderer.update() handles door animation
    // Check if door is fully open
    if (this.bucketRenderer.isDoorFullyOpen()) {
      // Transition to animating - start dropping balls
      this.phase = 'animating';
      this.droppedBallCount = 0;
      this.dropTimer = 0;
    }
  }

  private updateAnimating(delta: number): void {
    // Drop balls with stagger
    if (this.droppedBallCount < this.pendingPaths.length) {
      this.dropTimer += delta;

      if (this.dropTimer >= LAYOUT.BALL_STAGGER_MS || this.droppedBallCount === 0) {
        this.dropTimer = 0;
        const path = this.pendingPaths[this.droppedBallCount];
        this.ballRenderer.dropBall(this.droppedBallCount, path);
        this.droppedBallCount++;
      }
    }

    // Check if all balls have landed
    if (this.ballRenderer.areAllLanded() && this.ballRenderer.getBallCount() > 0) {
      // Highlight landing slots
      const positions = this.pendingPaths.map(path => path.filter(v => v).length);
      this.slotRenderer.highlightSlots(positions);

      // Transition to complete
      this.phase = 'complete';
    }
  }

  private updateComplete(): void {
    // Fire completion callback once
    if (this.onGameComplete) {
      const positions = this.pendingPaths.map(path => path.filter(v => v).length);
      this.onGameComplete({
        finalPositions: positions,
        completed: true
      });
      this.onGameComplete = undefined;
    }

    // Schedule reset to idle
    const timeoutId = setTimeout(() => {
      this.reset();
    }, 500);
    this.pendingTimeouts.push(timeoutId);

    // Prevent multiple completions
    this.phase = 'idle'; // Will be properly reset by timeout
  }

  private handleBallLanded(ballId: number, slot: number): void {
    // Individual ball landed - can add effects here if needed
  }

  private reset(): void {
    this.phase = 'idle';
    this.ballRenderer.clear();
    this.bucketRenderer.reset();
    this.slotRenderer.clearHighlights();
    this.bucketRenderer.setInteractive(true);
    this.pendingPaths = [];
    this.fillProgress = 0;
    this.targetBallCount = 0;
  }

  private clearPendingTimeouts(): void {
    this.pendingTimeouts.forEach(id => clearTimeout(id));
    this.pendingTimeouts = [];
  }

  // ============================================
  // CLEANUP
  // ============================================

  destroy(): void {
    this.clearPendingTimeouts();
    this.app.ticker.remove(this.update, this);
    this.pegRenderer.destroy();
    this.slotRenderer.destroy();
    this.ballRenderer.destroy();
    this.bucketRenderer.destroy();
    this.mainContainer.removeFromParent();
    this.mainContainer.destroy({ children: true });
  }
}
```

### Step 3: Create PlinkoStage.tsx

**File:** `openhouse_frontend/src/components/game-specific/plinko/PlinkoStage.tsx` (NEW)

```typescript
// PSEUDOCODE

import React, { useRef, useEffect, useCallback } from 'react';
import { Application } from 'pixi.js';
import { LAYOUT } from './pixi/LayoutConfig';
import { PlinkoController, GameResult } from './PlinkoController';

interface PlinkoStageProps {
  rows: number;
  multipliers: number[];
  onControllerReady: (controller: PlinkoController) => void;
  onDropClick: () => void;
  disabled: boolean;
}

export const PlinkoStage: React.FC<PlinkoStageProps> = ({
  rows,
  multipliers,
  onControllerReady,
  onDropClick,
  disabled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const controllerRef = useRef<PlinkoController | null>(null);

  // Initialize Pixi application and controller
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const initApp = async () => {
      // Create Pixi application
      const app = new Application();

      try {
        await app.init({
          width: LAYOUT.CANVAS_WIDTH,
          height: LAYOUT.CANVAS_HEIGHT,
          backgroundColor: 0x0a0a14,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          preference: 'webgl',
          powerPreference: 'default',
        });
      } catch (err) {
        console.error('WebGL init failed, trying fallback:', err);
        await app.init({
          width: LAYOUT.CANVAS_WIDTH,
          height: LAYOUT.CANVAS_HEIGHT,
          backgroundColor: 0x0a0a14,
          antialias: false,
          resolution: 1,
          autoDensity: false,
          preference: 'webgl',
        });
      }

      // Configure canvas
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      // Handle WebGL context loss
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('WebGL context lost');
      });
      canvas.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored');
      });

      appRef.current = app;

      // Create controller
      const controller = new PlinkoController(app, {
        rows,
        multipliers,
        onDropClick,
      });

      await controller.init();
      controllerRef.current = controller;

      // Notify parent that controller is ready
      onControllerReady(controller);
    };

    initApp().catch(console.error);

    // Cleanup
    return () => {
      if (controllerRef.current) {
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
    };
  }, [rows]); // Only re-init if rows change

  // Update multipliers when they change
  useEffect(() => {
    if (controllerRef.current && multipliers.length > 0) {
      controllerRef.current.updateMultipliers(multipliers);
    }
  }, [multipliers]);

  // Update interactive state when disabled changes
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setDropEnabled(!disabled);
    }
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
};
```

### Step 4: Simplify PlinkoGame.tsx

**File:** `openhouse_frontend/src/pages/plinko/PlinkoGame.tsx` (MODIFY)

```typescript
// PSEUDOCODE - Key changes highlighted

import React, { useEffect, useState, useCallback, useRef } from 'react';
import usePlinkoActor from '../../hooks/actors/usePlinkoActor';
import { GameLayout } from '../../components/game-ui';
import { PlinkoStage } from '../../components/game-specific/plinko/PlinkoStage';
import { PlinkoController, GameResult } from '../../components/game-specific/plinko/PlinkoController';
// ... other imports unchanged

const ROWS = 8;
const PLINKO_BACKEND_CANISTER_ID = 'weupr-2qaaa-aaaap-abl3q-cai';

export const Plinko: React.FC = () => {
  const { actor } = usePlinkoActor();
  const { actor: ledgerActor } = useLedgerActor();
  const { isAuthenticated } = useAuth();
  const { balance: walletBalance, refreshBalance: refreshWalletBalance } = useBalance();
  const gameBalanceContext = useGameBalance('plinko');
  const { refresh: refreshGameBalance } = gameBalanceContext;
  const balance = gameBalanceContext.balance;

  // REDUCED STATE - Only UI concerns
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameError, setGameError] = useState('');
  const [ballCount, setBallCount] = useState<number>(1);
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [currentResult, setCurrentResult] = useState<PlinkoGameResult | null>(null);
  const [multiBallResult, setMultiBallResult] = useState<MultiBallBackendResult | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [betAmount, setBetAmount] = useState(0.01);
  const [maxBet, setMaxBet] = useState(100);

  // Controller ref - accessed imperatively
  const controllerRef = useRef<PlinkoController | null>(null);

  // Load game data on mount (unchanged)
  useEffect(() => {
    const loadGameData = async () => {
      if (!actor) return;
      try {
        const [multsBp, formulaText, ev] = await Promise.all([
          actor.get_multipliers_bp(),
          actor.get_formula(),
          actor.get_expected_value()
        ]);
        const finalMults = Array.from(multsBp).map((bp) => Number(bp) / 10000);
        setMultipliers(finalMults);
        // ... rest unchanged
      } catch (err) {
        console.error('Failed to load game data:', err);
      }
    };
    loadGameData();
  }, [actor]);

  // Max bet calculation (unchanged)
  useEffect(() => {
    // ... same as before
  }, [actor, ballCount]);

  // Handle controller ready
  const handleControllerReady = useCallback((controller: PlinkoController) => {
    controllerRef.current = controller;
  }, []);

  // SIMPLIFIED dropBalls - no animation state management
  const dropBalls = async () => {
    if (!actor || isPlaying || !controllerRef.current) return;

    // Validation checks (unchanged)
    if (!isAuthenticated) {
      setGameError('Please log in to play.');
      return;
    }
    if (balance.game === 0n) {
      setGameError('No chips! Use the + button below to deposit.');
      return;
    }

    // Calculate bet
    const betPerBallE8s = BigInt(Math.round(betAmount * DECIMALS_PER_CKUSDT));
    const totalBetE8s = betPerBallE8s * BigInt(ballCount);

    if (totalBetE8s > balance.game) {
      setGameError(`Insufficient balance.`);
      return;
    }

    // Set playing state (UI only)
    setIsPlaying(true);
    setGameError('');
    setCurrentResult(null);
    setMultiBallResult(null);

    try {
      // Call backend
      const result = ballCount === 1
        ? await actor.play_plinko(betPerBallE8s)
        : await actor.play_multi_plinko(ballCount, betPerBallE8s);

      // Extract paths from result
      let extractedPaths: boolean[][] = [];

      if (ballCount === 1) {
        if ('Ok' in result) {
          const gameResult = {
            path: result.Ok.path,
            final_position: result.Ok.final_position,
            multiplier: result.Ok.multiplier,
            win: result.Ok.is_win,
            timestamp: Date.now(),
            bet_amount: Number(result.Ok.bet_amount) / DECIMALS_PER_CKUSDT,
            payout: Number(result.Ok.payout) / DECIMALS_PER_CKUSDT,
            profit: Number(result.Ok.profit) / DECIMALS_PER_CKUSDT,
          };
          setCurrentResult(gameResult);
          extractedPaths = [gameResult.path];
          refreshGameBalance().catch(console.error);
        } else {
          setGameError(result.Err);
          setIsPlaying(false);
          return;
        }
      } else {
        if ('Ok' in result) {
          // ... same multi-ball handling
          extractedPaths = result.Ok.results.map(r => r.path);
          refreshGameBalance().catch(console.error);
        } else {
          setGameError(result.Err);
          setIsPlaying(false);
          return;
        }
      }

      // START GAME ON CONTROLLER - single call, controller handles everything
      controllerRef.current.startGame(extractedPaths, ballCount, (gameResult) => {
        // Called when animation completes
        setIsPlaying(false);
      });

    } catch (err) {
      console.error('Failed to play plinko:', err);
      setGameError(err instanceof Error ? err.message : 'Failed to play');
      setIsPlaying(false);
    }
  };

  // Render (mostly unchanged, replace PlinkoCanvas with PlinkoStage)
  return (
    <GameLayout hideFooter noScroll>
      <div className="flex-1 flex flex-col items-center justify-center px-2 pb-40 overflow-hidden">
        <div className="flex items-stretch gap-0 w-full max-w-3xl">

          {/* LEFT PANEL - unchanged */}

          {/* CENTER - Replace PlinkoCanvas with PlinkoStage */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="w-full bg-[#0a0a14]" style={{ aspectRatio: '400/440' }}>
              <PlinkoStage
                rows={ROWS}
                multipliers={multipliers}
                onControllerReady={handleControllerReady}
                onDropClick={dropBalls}
                disabled={!actor || isPlaying}
              />
            </div>

            {/* Result bar - unchanged */}
            <div className="h-10 bg-[#0a0a14] flex items-center justify-center border-t border-gray-800/30">
              {/* ... same result display logic */}
            </div>
          </div>

          {/* RIGHT PANEL - unchanged */}

        </div>

        {/* Mobile controls - unchanged */}
      </div>

      {/* BettingRail - unchanged */}

      {/* Info Modal - unchanged */}
    </GameLayout>
  );
};
```

### Step 5: Fix BucketRenderer Memory Leak

**File:** `openhouse_frontend/src/components/game-specific/plinko/pixi/BucketRenderer.ts` (MODIFY)

```typescript
// PSEUDOCODE - Add timeout tracking

export class BucketRenderer {
  // ... existing properties ...

  // ADD: Track pending timeouts
  private pendingTimeouts: NodeJS.Timeout[] = [];

  // ADD: Track hover event handlers for cleanup
  private pointerOverHandler = () => {
    if (this.container.eventMode === 'static') {
      this.container.scale.set(1.05);
      this.bucketBody.tint = 0xddddff;
    }
  };

  private pointerOutHandler = () => {
    this.container.scale.set(1);
    this.bucketBody.tint = 0xffffff;
  };

  async init(parent: Container, centerX: number): Promise<void> {
    // ... existing init code ...

    // MODIFY: Use named handlers instead of anonymous
    this.container.on('pointerover', this.pointerOverHandler);
    this.container.on('pointerout', this.pointerOutHandler);
  }

  fillBucket(count: number): void {
    // ADD: Clear any pending timeouts from previous fill
    this.clearPendingTimeouts();
    this.clearBalls();

    const ballRadius = 8;

    for (let i = 0; i < Math.min(count, 30); i++) {
      // MODIFY: Track timeout IDs
      const timeoutId = setTimeout(() => {
        const ball = new Graphics();
        ball.circle(0, 0, ballRadius);
        ball.fill({ color: LAYOUT.BALL_COLOR });

        const x = (Math.random() - 0.5) * (this.INTERIOR_WIDTH - ballRadius * 2);
        const y = -ballRadius;

        ball.position.set(x, y);
        this.ballContainer.addChild(ball);

        this.balls.push({
          graphics: ball,
          x,
          y,
          vy: 0,
        });

        // Remove from pending list
        this.pendingTimeouts = this.pendingTimeouts.filter(id => id !== timeoutId);
      }, i * 40);

      this.pendingTimeouts.push(timeoutId);
    }
  }

  // ADD: Helper to check if door is fully open (for controller)
  isDoorFullyOpen(): boolean {
    return this.doorOpen && this.doorProgress >= 1;
  }

  // ADD: Clear pending timeouts helper
  private clearPendingTimeouts(): void {
    this.pendingTimeouts.forEach(id => clearTimeout(id));
    this.pendingTimeouts = [];
  }

  destroy(): void {
    // ADD: Clear pending timeouts
    this.clearPendingTimeouts();

    // ADD: Remove hover handlers
    this.container.off('pointerover', this.pointerOverHandler);
    this.container.off('pointerout', this.pointerOutHandler);

    if (this.clickCallback) {
      this.container.off('pointerdown', this.clickCallback);
    }
    this.clearBalls();
    this.container.removeFromParent();
    this.container.destroy({ children: true });
  }
}
```

### Step 6: Update Exports

**File:** `openhouse_frontend/src/components/game-specific/plinko/index.ts` (MODIFY)

```typescript
export { PlinkoStage } from './PlinkoStage';
export { PlinkoController } from './PlinkoController';
export type { GameResult, PlinkoControllerConfig } from './PlinkoController';
```

**File:** `openhouse_frontend/src/components/game-specific/plinko/pixi/index.ts` (MODIFY)

```typescript
export { LAYOUT, getCenterX, easeInOutQuad, calculateBallX, calculateBallY } from './LayoutConfig';
export { PegRenderer } from './PegRenderer';
export { SlotRenderer } from './SlotRenderer';
export { BallRenderer } from './BallRenderer';
export { BucketRenderer } from './BucketRenderer';
```

### Step 7: Delete Dead Code

**Files to DELETE:**
```bash
rm openhouse_frontend/src/components/game-specific/plinko/PlinkoCanvas.tsx
rm openhouse_frontend/src/components/game-specific/plinko/pixi/PlinkoPixiApp.ts
rm openhouse_frontend/src/components/game-specific/plinko/ui/ResultOverlay.tsx
rm openhouse_frontend/src/components/game-specific/plinko/ui/index.ts
rmdir openhouse_frontend/src/components/game-specific/plinko/ui
```

## Summary of Changes

| File | Action | Before LOC | After LOC | Delta |
|------|--------|-----------|-----------|-------|
| PlinkoGame.tsx | Modify | 597 | ~250 | -347 |
| PlinkoCanvas.tsx | Delete | 170 | 0 | -170 |
| PlinkoStage.tsx | Create | 0 | ~100 | +100 |
| PlinkoController.ts | Create | 0 | ~350 | +350 |
| PlinkoPixiApp.ts | Delete | 182 | 0 | -182 |
| BucketRenderer.ts | Modify | 258 | ~260 | +2 |
| ResultOverlay.tsx | Delete | 140 | 0 | -140 |
| ui/index.ts | Delete | 1 | 0 | -1 |
| index.ts (plinko) | Modify | 3 | 4 | +1 |
| index.ts (pixi) | Modify | 4 | 6 | +2 |
| **Total** | | **1,355** | **~970** | **-385** |

**Net reduction: ~28% fewer lines with cleaner architecture**

## Key Benefits

1. **Single source of truth**: All animation state in PlinkoController
2. **No React re-renders during animation**: Ticker loop handles everything
3. **Memory leak fixed**: Timeout IDs tracked and cleared
4. **Event handlers cleaned up**: Named functions removed on destroy
5. **Simpler mental model**: React calls `startGame()`, receives `onComplete()`
6. **Reusable pattern**: Controller pattern can be applied to future games

## Deployment

- **Affected canister**: Frontend only (`pezw3-laaaa-aaaal-qssoa-cai`)
- **Backend unchanged**: No changes to plinko_backend
- **Test URL**: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
