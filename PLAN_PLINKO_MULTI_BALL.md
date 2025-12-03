# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-plinko-multi-ball"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-plinko-multi-ball`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   # Build plinko backend
   cargo build --target wasm32-unknown-unknown --release

   # Build frontend
   cd openhouse_frontend && npm run build && cd ..

   # Deploy everything to mainnet
   ./deploy.sh
   ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status plinko_backend

   # Test multi-ball drop
   dfx canister --network ic call plinko_backend drop_multiple_balls '(5 : nat8)'

   # Visit the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(plinko): add multi-ball drop (1-30 balls)"
   git push -u origin feature/plinko-multi-ball
   gh pr create --title "Feature: Plinko Multi-Ball Drop (1-30)" --body "Implements PLAN_PLINKO_MULTI_BALL.md

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
- Affected canisters: plinko_backend, openhouse_frontend

## Changes
- Backend: Added drop_multiple_balls(count) method for batch drops
- Frontend: Added ball count selector (1-30 balls)
- UI: Enhanced to show aggregate stats for multi-ball drops"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- ❌ NO questions ("should I?", "want me to?", "is it done?")
- ❌ NO skipping PR creation - it's MANDATORY
- ❌ NO stopping after implementation - create PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/plinko-multi-ball`
**Worktree:** `/home/theseus/alexandria/openhouse-plinko-multi-ball`

---

# Implementation Plan: Plinko Multi-Ball Drop (1-30 Balls)

## Task Classification
**NEW FEATURE** - Adding multi-ball drop capability to existing Plinko game

## Current State

### Affected Files
```
plinko_backend/
├── src/
│   └── lib.rs                           # Main game logic (MODIFY)
└── plinko_backend.did                   # Candid interface (MODIFY)

openhouse_frontend/
├── src/
│   ├── pages/
│   │   └── Plinko.tsx                   # Main game page (MODIFY)
│   └── components/game-specific/plinko/
│       └── PlinkoBoard.tsx              # Animation component (MODIFY - optional)
└── src/declarations/plinko_backend/     # Auto-generated (UPDATE after backend deploy)
```

### Current Implementation

#### Backend: `plinko_backend/src/lib.rs`
```rust
// Lines 54-88: Current single ball implementation
#[update]
async fn drop_ball() -> Result<PlinkoResult, String> {
    const ROWS: u8 = 8;

    // Get randomness from IC VRF
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

    // Use first byte for 8 coin flips
    let random_byte = random_bytes.get(0)
        .ok_or("Insufficient randomness")?;

    // Generate path and calculate result
    let path: Vec<bool> = (0..ROWS)
        .map(|i| (random_byte >> i) & 1 == 1)
        .collect();

    let final_position = path.iter().filter(|&&d| d).count() as u8;
    let multiplier = calculate_multiplier(final_position);
    let win = multiplier >= 1.0;

    Ok(PlinkoResult { path, final_position, multiplier, win })
}
```

**Key Insight:** Each ball needs 1 byte of randomness (8 bits for 8 rows). VRF returns 32 bytes, so we can efficiently drop up to 32 balls per VRF call.

#### Frontend: `openhouse_frontend/src/pages/Plinko.tsx`
```tsx
// Lines 54-80: Current single ball drop
const dropBall = async () => {
    if (!actor) return;

    setIsPlaying(true);
    const result = await actor.drop_ball();

    if ('Ok' in result) {
        setCurrentResult({ ...result.Ok, timestamp: Date.now() });
    } else {
        setGameError(result.Err);
    }
};

// Lines 132-139: Current UI
<GameButton
    onClick={dropBall}
    disabled={!actor}
    loading={isPlaying}
    label="DROP BALL"
/>
```

### Candid Interface: `plinko_backend.did`
```candid
// Lines 8-10: Current interface
service : {
  drop_ball: () -> (variant { Ok: PlinkoResult; Err: text });
  // ... other methods
}
```

## Implementation Plan

### 1. Backend Changes

#### File: `plinko_backend/src/lib.rs`

**Add new type for multi-ball results:**
```rust
// PSEUDOCODE - Add after PlinkoResult struct (line 32)
#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct MultiBallResult {
    pub results: Vec<PlinkoResult>,
    pub total_balls: u8,
    pub total_wins: u8,
    pub average_multiplier: f64,
}
```

**Add new update function:**
```rust
// PSEUDOCODE - Add after drop_ball function (line 88)
/// Drop multiple balls at once (1-30 balls)
/// Efficient: uses single VRF call for up to 32 balls
#[update]
async fn drop_multiple_balls(count: u8) -> Result<MultiBallResult, String> {
    const ROWS: u8 = 8;
    const MAX_BALLS: u8 = 30;

    // Validation
    if count < 1 {
        return Err("Must drop at least 1 ball".to_string());
    }
    if count > MAX_BALLS {
        return Err(format!("Maximum {} balls allowed", MAX_BALLS));
    }

    // Get randomness - one VRF call gives us 32 bytes
    let random_bytes = raw_rand().await
        .map_err(|e| format!("Randomness unavailable: {:?}", e))?;

    if random_bytes.len() < count as usize {
        return Err("Insufficient randomness".to_string());
    }

    // Process each ball using sequential bytes
    let mut results = Vec::with_capacity(count as usize);

    for i in 0..count {
        let random_byte = random_bytes[i as usize];

        // Generate path for this ball
        let path: Vec<bool> = (0..ROWS)
            .map(|bit| (random_byte >> bit) & 1 == 1)
            .collect();

        // Calculate result
        let final_position = path.iter().filter(|&&d| d).count() as u8;
        let multiplier = calculate_multiplier(final_position);
        let win = multiplier >= 1.0;

        results.push(PlinkoResult {
            path,
            final_position,
            multiplier,
            win,
        });
    }

    // Calculate aggregate stats
    let total_wins = results.iter().filter(|r| r.win).count() as u8;
    let sum_multipliers: f64 = results.iter().map(|r| r.multiplier).sum();
    let average_multiplier = sum_multipliers / (count as f64);

    Ok(MultiBallResult {
        results,
        total_balls: count,
        total_wins,
        average_multiplier,
    })
}
```

**Keep existing drop_ball() for backward compatibility** - No changes needed

#### File: `plinko_backend/plinko_backend.did`

**Add new types and method:**
```candid
// PSEUDOCODE - Add after PlinkoResult type
type MultiBallResult = record {
  results: vec PlinkoResult;
  total_balls: nat8;
  total_wins: nat8;
  average_multiplier: float64;
};

// PSEUDOCODE - Add to service methods
service : {
  // Existing methods (unchanged)
  drop_ball: () -> (variant { Ok: PlinkoResult; Err: text });
  get_multipliers: () -> (vec float64) query;
  get_formula: () -> (text) query;
  get_expected_value: () -> (float64) query;
  greet: (text) -> (text) query;

  // NEW METHOD
  drop_multiple_balls: (nat8) -> (variant { Ok: MultiBallResult; Err: text });
}
```

### 2. Frontend Changes

#### File: `openhouse_frontend/src/pages/Plinko.tsx`

**Add state for multi-ball:**
```typescript
// PSEUDOCODE - Add after existing state (around line 22)
const [ballCount, setBallCount] = useState<number>(1);
const [multiBallResult, setMultiBallResult] = useState<MultiBallResult | null>(null);
const [currentBallIndex, setCurrentBallIndex] = useState<number>(0);
```

**Add multi-ball drop handler:**
```typescript
// PSEUDOCODE - Add after dropBall function (around line 80)
const dropMultipleBalls = async () => {
    if (!actor) return;

    setIsPlaying(true);
    setGameError('');
    setMultiBallResult(null);
    setCurrentBallIndex(0);

    try {
        if (ballCount === 1) {
            // Use single ball method for efficiency
            const result = await actor.drop_ball();
            if ('Ok' in result) {
                setCurrentResult({ ...result.Ok, timestamp: Date.now() });
            } else {
                setGameError(result.Err);
            }
        } else {
            // Use multi-ball method
            const result = await actor.drop_multiple_balls(ballCount);

            if ('Ok' in result) {
                setMultiBallResult(result.Ok);
                // Start sequential animation
                animateNextBall(result.Ok.results);
            } else {
                setGameError(result.Err);
                setIsPlaying(false);
            }
        }
    } catch (err) {
        console.error('Failed to drop balls:', err);
        setGameError(err instanceof Error ? err.message : 'Failed to drop balls');
        setIsPlaying(false);
    }
};

const animateNextBall = (results: PlinkoResult[]) => {
    if (currentBallIndex < results.length) {
        setCurrentResult({
            ...results[currentBallIndex],
            timestamp: Date.now(),
        });
    }
};

const handleMultiBallAnimationComplete = useCallback(() => {
    if (multiBallResult && currentBallIndex < multiBallResult.results.length - 1) {
        // Animate next ball
        setCurrentBallIndex(prev => prev + 1);
        // Small delay between balls
        setTimeout(() => {
            animateNextBall(multiBallResult.results);
        }, 100);
    } else {
        // All balls animated
        setIsPlaying(false);
    }
}, [multiBallResult, currentBallIndex]);
```

**Add ball count selector UI:**
```tsx
// PSEUDOCODE - Add before GameButton (around line 131)
<div className="mb-4">
    <label className="block text-sm font-medium mb-2">
        Number of Balls: {ballCount}
    </label>
    <input
        type="range"
        min="1"
        max="30"
        value={ballCount}
        onChange={(e) => setBallCount(parseInt(e.target.value))}
        disabled={isPlaying}
        className="w-full"
    />
    <div className="flex justify-between text-xs text-pure-white/40 mt-1">
        <span>1 ball</span>
        <span>15 balls</span>
        <span>30 balls</span>
    </div>
</div>
```

**Update button to use new handler:**
```tsx
// PSEUDOCODE - Replace existing GameButton (line 132-139)
<GameButton
    onClick={dropMultipleBalls}  // Changed from dropBall
    disabled={!actor}
    loading={isPlaying}
    label={ballCount === 1 ? "DROP BALL" : `DROP ${ballCount} BALLS`}
    loadingLabel={ballCount === 1 ? "Dropping..." : `Dropping ${ballCount} balls...`}
    icon="🎯"
/>
```

**Add multi-ball results display:**
```tsx
// PSEUDOCODE - Add after existing result display (around line 203)
{multiBallResult && !isPlaying && (
    <div className="mt-6 p-4 bg-pure-black/30 rounded-lg">
        <h3 className="text-lg font-bold mb-3 text-center">
            Multi-Ball Results
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
            <div>
                <div className="text-2xl font-bold text-dfinity-turquoise">
                    {multiBallResult.total_balls}
                </div>
                <div className="text-xs text-pure-white/60">Total Balls</div>
            </div>
            <div>
                <div className="text-2xl font-bold text-green-400">
                    {multiBallResult.total_wins}
                </div>
                <div className="text-xs text-pure-white/60">Wins</div>
            </div>
            <div>
                <div className="text-2xl font-bold">
                    {multiBallResult.average_multiplier.toFixed(3)}x
                </div>
                <div className="text-xs text-pure-white/60">Avg Multiplier</div>
            </div>
        </div>

        <div className="mt-3 text-center">
            <div className={`text-lg ${
                multiBallResult.average_multiplier >= 1
                    ? 'text-green-400'
                    : 'text-red-400'
            }`}>
                {multiBallResult.average_multiplier >= 1
                    ? `✨ Net Win: ${((multiBallResult.average_multiplier - 1) * 100).toFixed(1)}%`
                    : `💔 Net Loss: ${((1 - multiBallResult.average_multiplier) * 100).toFixed(1)}%`
                }
            </div>
        </div>

        <details className="mt-4">
            <summary className="cursor-pointer text-sm text-pure-white/60 hover:text-pure-white">
                View Individual Results ({multiBallResult.results.length} balls)
            </summary>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {multiBallResult.results.map((result, idx) => (
                    <div key={idx} className="text-xs font-mono flex justify-between px-2 py-1 bg-pure-black/20 rounded">
                        <span>Ball {idx + 1}:</span>
                        <span className={result.win ? 'text-green-400' : 'text-red-400'}>
                            {result.multiplier.toFixed(3)}x (pos {result.final_position})
                        </span>
                    </div>
                ))}
            </div>
        </details>
    </div>
)}
```

### 3. Update Frontend Declarations

**After deploying backend:**
```bash
# PSEUDOCODE - Run these commands
cd /home/theseus/alexandria/openhouse-plinko-multi-ball

# Copy updated declarations
cp -r src/declarations/plinko_backend/* openhouse_frontend/src/declarations/plinko_backend/

# Rebuild frontend
cd openhouse_frontend
npm run build
```

## Testing Requirements

**Manual Testing on Mainnet (NO automated tests required):**

```bash
# Test single ball (backward compatibility)
dfx canister --network ic call plinko_backend drop_ball

# Test multi-ball with different counts
dfx canister --network ic call plinko_backend drop_multiple_balls '(1 : nat8)'
dfx canister --network ic call plinko_backend drop_multiple_balls '(5 : nat8)'
dfx canister --network ic call plinko_backend drop_multiple_balls '(30 : nat8)'

# Test validation
dfx canister --network ic call plinko_backend drop_multiple_balls '(0 : nat8)'   # Should error
dfx canister --network ic call plinko_backend drop_multiple_balls '(31 : nat8)'  # Should error

# Visit frontend and test UI
# https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io/plinko
```

## Deployment Strategy

### Affected Canisters
- `plinko_backend` (weupr-2qaaa-aaaap-abl3q-cai) - New method added
- `openhouse_frontend` (pezw3-laaaa-aaaal-qssoa-cai) - UI updated

### Deployment Steps
```bash
# 1. Build backend
cargo build --target wasm32-unknown-unknown --release

# 2. Build frontend
cd openhouse_frontend && npm run build && cd ..

# 3. Deploy all (simplest approach)
./deploy.sh

# 4. Verify deployment
dfx canister --network ic status plinko_backend
dfx canister --network ic status openhouse_frontend
```

## Design Decisions

### Why VRF Efficiency Matters
- Each VRF call returns 32 bytes of randomness
- Each ball needs 1 byte (8 bits for 8 rows)
- Single VRF call can handle up to 32 balls
- No performance degradation for batch drops

### Why Keep drop_ball()?
- Backward compatibility for existing integrations
- Slightly more efficient for single ball (less parsing)
- Simple API for users who don't need multi-ball

### Why Sequential Animation?
- Clear visual feedback for each ball
- Prevents UI confusion with 30 simultaneous animations
- Maintains the satisfying "watch it drop" experience
- Can be optimized later with batched animations if needed

### Why Max 30 Balls?
- Reasonable UI/UX limit
- Well within VRF capacity (32 bytes available)
- Prevents excessive canister cycles usage
- Users can run multiple batches if needed

## Success Criteria

✅ Backend compiles without errors
✅ New method callable from command line
✅ Single ball drop still works (backward compatibility)
✅ Multi-ball returns correct aggregate stats
✅ Frontend builds successfully
✅ Ball count selector visible and functional
✅ Button text updates based on ball count
✅ Multi-ball results display correctly
✅ Live deployment on mainnet works
✅ PR created automatically

## Future Enhancements (NOT in this PR)

- Parallel ball animations (show multiple balls dropping at once)
- DeFi integration for batch betting
- Historical stats tracking for multi-ball sessions
- Export results as CSV
- Social sharing of multi-ball wins
