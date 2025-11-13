# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-instant-dice"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-instant-dice`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build affected backend(s)
     cargo build --target wasm32-unknown-unknown --release

     # Deploy to mainnet (deploys all canisters - simplest approach)
     ./deploy.sh
     ```
   - Frontend changes:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh
     ```
   - Both backend + frontend:
     ```bash
     cargo build --target wasm32-unknown-unknown --release
     cd openhouse_frontend && npm run build && cd ..
     ./deploy.sh
     ```

4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend

   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: implement instant dice randomness with seed+nonce pattern"
   git push -u origin feature/instant-dice-randomness
   gh pr create --title "feat: Instant Dice Randomness - Eliminate 3s VRF Delay" --body "Implements instant dice randomness using seed+nonce pattern

Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai

## Changes
- Replaced per-game VRF calls with seed+nonce pattern
- Reduced game latency from ~3s to <100ms
- Added client seed for provable fairness
- Background seed rotation every 5 minutes
- 30x performance improvement for rapid gameplay"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view [NUM] --json comments`
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

**Branch:** `feature/instant-dice-randomness`
**Worktree:** `/home/theseus/alexandria/openhouse-instant-dice`

---

# Implementation Plan

## Task Classification: REFACTORING
Improving existing dice game backend to eliminate 3-second VRF delay while maintaining security

## Current State Documentation

### Files to Modify
- `dice_backend/src/lib.rs` (lines 119-138: generate_dice_roll function, line 180: async call)
- Canister: `whchi-hyaaa-aaaao-a4ruq-cai`

### Current Implementation Problem
```rust
// Line 119-138: Current slow implementation
async fn generate_dice_roll() -> u8 {
    let random_bytes = match raw_rand().await {  // ⏱️ 3-SECOND DELAY HERE
        Ok((bytes,)) => bytes,
        // ...
    };
    // ...
}

// Line 180: Async call during gameplay
let rolled_number = generate_dice_roll().await;  // ⏱️ User waits here
```

### Performance Impact
- Current: ~3000ms per game (VRF call)
- Target: <100ms per game (hashing only)
- Improvement: 30x faster

## Implementation in PSEUDOCODE

### Backend: `dice_backend/src/lib.rs` (MODIFY)

#### Add new imports and structures (after line 9)
```rust
// PSEUDOCODE - Add after existing imports
use std::sync::Mutex;

// Seed management structure
struct RandomnessSeed {
    current_seed: [u8; 32],
    creation_time: u64,
    games_used: u64,
    max_games: u64,  // Rotate after N games
    nonce: u64,       // Increments per game
}

// Global seed state (thread_local)
thread_local! {
    static SEED_STATE: RefCell<Option<RandomnessSeed>> = RefCell::new(None);
    static LAST_SEED_ROTATION: RefCell<u64> = RefCell::new(0);
}

const SEED_ROTATION_INTERVAL_NS: u64 = 300_000_000_000; // 5 minutes in nanoseconds
const MAX_GAMES_PER_SEED: u64 = 10_000; // Rotate after 10k games
```

#### Add seed initialization (in init function, after line 79)
```rust
// PSEUDOCODE - Add to init() function
#[init]
async fn init() {
    ic_cdk::println!("Dice Game Backend Initialized");

    // Initialize with first VRF seed
    initialize_seed().await;
}

// New function to initialize seed
async fn initialize_seed() {
    let random_bytes = raw_rand().await.unwrap().0;
    let mut hasher = Sha256::new();
    hasher.update(&random_bytes);
    let seed = hasher.finalize().to_vec();

    SEED_STATE.with(|s| {
        *s.borrow_mut() = Some(RandomnessSeed {
            current_seed: seed[0..32].try_into().unwrap(),
            creation_time: ic_cdk::api::time(),
            games_used: 0,
            max_games: MAX_GAMES_PER_SEED,
            nonce: 0,
        });
    });

    LAST_SEED_ROTATION.with(|t| {
        *t.borrow_mut() = ic_cdk::api::time();
    });
}
```

#### Replace generate_dice_roll function (lines 119-138)
```rust
// PSEUDOCODE - Replace entire generate_dice_roll function
fn generate_dice_roll_instant(client_seed: &str) -> Result<u8, String> {
    // Get current seed state
    let (server_seed, nonce) = SEED_STATE.with(|s| {
        let mut state = s.borrow_mut();
        let seed_state = state.as_mut().ok_or("Seed not initialized")?;

        // Increment nonce for this game
        seed_state.nonce += 1;
        seed_state.games_used += 1;

        Ok((seed_state.current_seed, seed_state.nonce))
    })?;

    // Combine server seed + client seed + nonce for unique result
    let mut hasher = Sha256::new();
    hasher.update(&server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    let hash = hasher.finalize();

    // Convert to 0-100 range
    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    Ok((rand_u64 % (MAX_NUMBER as u64 + 1)) as u8)
}
```

#### Modify play_dice function (line 141)
```rust
// PSEUDOCODE - Modify play_dice function signature and implementation
#[update]  // Note: NO async anymore!
fn play_dice(
    bet_amount: u64,
    target_number: u8,
    direction: RollDirection,
    client_seed: String  // NEW: Client provides seed
) -> Result<DiceResult, String> {
    // Input validation (keep existing validation logic)
    // ...existing validation code...

    // Check if seed needs rotation
    maybe_schedule_seed_rotation();

    // Generate roll INSTANTLY (no await!)
    let rolled_number = generate_dice_roll_instant(&client_seed)?;

    // Rest of game logic remains the same
    // ...existing win/loss calculation...

    // Return result
    Ok(result)
}
```

#### Add background seed rotation
```rust
// PSEUDOCODE - Add new functions for seed management
fn maybe_schedule_seed_rotation() {
    let should_rotate = SEED_STATE.with(|s| {
        let state = s.borrow();
        if let Some(seed_state) = state.as_ref() {
            let now = ic_cdk::api::time();
            let time_elapsed = now - seed_state.creation_time;

            // Rotate if: too many games OR too much time
            seed_state.games_used >= seed_state.max_games ||
            time_elapsed >= SEED_ROTATION_INTERVAL_NS
        } else {
            true // Need initialization
        }
    });

    if should_rotate {
        // Schedule async rotation (non-blocking)
        ic_cdk::spawn(async {
            rotate_seed_async().await;
        });
    }
}

async fn rotate_seed_async() {
    // Check if we already rotated recently (prevent double rotation)
    let last_rotation = LAST_SEED_ROTATION.with(|t| *t.borrow());
    let now = ic_cdk::api::time();

    if now - last_rotation < 10_000_000_000 { // 10 seconds minimum between rotations
        return;
    }

    // Get new VRF seed
    if let Ok((random_bytes,)) = raw_rand().await {
        let mut hasher = Sha256::new();
        hasher.update(&random_bytes);
        let new_seed = hasher.finalize().to_vec();

        // Update seed state
        SEED_STATE.with(|s| {
            *s.borrow_mut() = Some(RandomnessSeed {
                current_seed: new_seed[0..32].try_into().unwrap(),
                creation_time: now,
                games_used: 0,
                max_games: MAX_GAMES_PER_SEED,
                nonce: 0,
            });
        });

        LAST_SEED_ROTATION.with(|t| {
            *t.borrow_mut() = now;
        });

        ic_cdk::println!("Seed rotated successfully at {}", now);
    }
}
```

#### Add verification endpoints for provable fairness
```rust
// PSEUDOCODE - Add new query methods for transparency
#[query]
fn get_current_seed_hash() -> String {
    SEED_STATE.with(|s| {
        s.borrow().as_ref().map(|seed_state| {
            let mut hasher = Sha256::new();
            hasher.update(&seed_state.current_seed);
            format!("{:x}", hasher.finalize())
        }).unwrap_or_else(|| "No seed initialized".to_string())
    })
}

#[query]
fn verify_game_result(
    server_seed_hash: String,
    client_seed: String,
    nonce: u64,
    expected_roll: u8
) -> Result<bool, String> {
    // This would be called after seed rotation to verify past games
    // Implementation would check if hash(server_seed + client_seed + nonce) == expected_roll
    // PSEUDOCODE: Verification logic
    Ok(true)
}

#[query]
fn get_seed_info() -> (String, u64, u64) {
    SEED_STATE.with(|s| {
        s.borrow().as_ref().map(|seed_state| {
            let hash = {
                let mut hasher = Sha256::new();
                hasher.update(&seed_state.current_seed);
                format!("{:x}", hasher.finalize())
            };
            (hash, seed_state.games_used, seed_state.creation_time)
        }).unwrap_or(("Not initialized".to_string(), 0, 0))
    })
}
```

#### Update .did file (dice_backend/dice_backend.did)
```candid
// PSEUDOCODE - Update method signatures
service : {
    // Modified play_dice - now includes client_seed, no longer async
    play_dice : (nat64, nat8, RollDirection, text) -> (Result);

    // New verification methods
    get_current_seed_hash : () -> (text) query;
    verify_game_result : (text, text, nat64, nat8) -> (Result_1) query;
    get_seed_info : () -> (text, nat64, nat64) query;

    // Existing methods remain unchanged
    get_stats : () -> (GameStats) query;
    get_recent_games : (nat32) -> (vec DiceResult) query;
    // ...
}
```

### Frontend Updates: `openhouse_frontend/src/pages/Dice.tsx` (MODIFY)

```typescript
// PSEUDOCODE - Update dice play logic to include client seed
const playDice = async () => {
    // Generate client seed (timestamp + random)
    const clientSeed = `${Date.now()}_${Math.random().toString(36).substring(2)}`;

    // Call modified backend method with client seed
    const result = await diceBackend.play_dice(
        betAmount,
        targetNumber,
        direction,
        clientSeed  // NEW: Pass client seed
    );

    // Display result (instant!)
    // No more 3-second loading spinner needed
}

// Add provable fairness display
const FairnessInfo = () => {
    // Show current seed hash
    // Show how to verify after seed rotation
    // Link to verification endpoint
}
```

## Deployment Notes

### Affected Canisters
- **dice_backend**: `whchi-hyaaa-aaaao-a4ruq-cai` (primary changes)
- **openhouse_frontend**: `pezw3-laaaa-aaaal-qssoa-cai` (UI updates)

### Testing on Mainnet
```bash
# After deployment, test instant gameplay
dfx canister --network ic call dice_backend play_dice \
  '(100_000_000 : nat64, 50 : nat8, variant { Over }, "test_seed_123")'

# Check seed info
dfx canister --network ic call dice_backend get_seed_info

# Verify instant response time (should be <100ms)
time dfx canister --network ic call dice_backend play_dice \
  '(100_000_000 : nat64, 50 : nat8, variant { Under }, "speed_test")'
```

## Security Considerations

1. **Server Seed**: Never exposed until after rotation
2. **Client Seed**: User-provided, prevents server manipulation
3. **Nonce**: Prevents replay attacks, ensures uniqueness
4. **Hash Commitment**: Seed hash published before games
5. **Rotation**: Automatic after time/game limits
6. **Verification**: Users can verify all past games after rotation

## Benefits

- ⚡ **30x faster**: <100ms vs 3000ms per game
- 🎮 **Rapid gameplay**: Click-click-click instant results
- 🔒 **Provably fair**: Verifiable with seed+client+nonce
- 📈 **Scalable**: Same pattern works for Plinko, Mines, Crash
- ⏱️ **No user waiting**: Instant feedback on every click

## Future Replication

This pattern can be applied to:
1. **Plinko**: Each ball drop uses Hash(seed + client + ballNumber)
2. **Mines**: Each tile reveal uses Hash(seed + client + tileIndex)
3. **Crash**: Generate crash point at round start with Hash(seed + roundId)

---

**END OF PLAN - Ready for autonomous implementation**