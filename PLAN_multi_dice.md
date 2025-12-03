# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-multi-dice"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-multi-dice`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ./deploy.sh --dice-only
   ```
4. **Verify deployment**:
   ```bash
   dfx canister --network ic status dice_backend
   # Test multi-dice
   dfx canister --network ic call dice_backend play_multi_dice '(2 : nat8, 100000 : nat64, 50 : nat8, variant { Over }, "test")'
   ```
5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat(dice): add multi-dice support (up to 3 dice per roll)"
   git push -u origin feature/multi-dice
   gh pr create --title "feat(dice): Multi-dice support" --body "$(cat <<'EOF'
   Implements PLAN_multi_dice.md

   ## Summary
   - Add `play_multi_dice` endpoint allowing 1-3 dice per call
   - Each dice is an independent bet (can win some, lose others)
   - All dice share same target/direction
   - Single VRF call generates all rolls uniformly
   - Net settlement via existing `settle_bet()` infrastructure

   ## Changes
   - `dice_backend/src/types.rs` - New types
   - `dice_backend/src/seed.rs` - Multi-roll VRF derivation
   - `dice_backend/src/game.rs` - Core game logic
   - `dice_backend/src/lib.rs` - API endpoints
   - `dice_backend/dice_backend.did` - Candid interface

   Deployed to mainnet:
   - Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai

   Generated with Claude Code
   EOF
   )"
   ```
6. **Iterate autonomously**: Fix P0 issues from review, push, repeat until approved

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/multi-dice`
**Worktree:** `/home/theseus/alexandria/openhouse-multi-dice`

---

# Implementation Plan: Multi-Dice Feature

## Summary

Add `play_multi_dice` endpoint allowing 1-3 dice per call, each as an independent bet sharing the same target/direction. Single VRF call generates all rolls uniformly.

## Game Design

- **Dice count**: 1-3 per call
- **Bet model**: Independent bets (each dice wins/loses separately)
- **Parameters**: All dice share same `target_number` and `direction`
- **VRF**: Single `raw_rand()` call, derive N rolls via index-based hashing
- **Accounting**: Net settlement via existing `settle_bet(total_bet, total_payout)`

---

## File Changes

### 1. `dice_backend/src/types.rs` - Add new types

Add after existing types:

```rust
/// Maximum number of dice per multi-dice game
pub const MAX_DICE_COUNT: u8 = 3;

/// Result for a single dice roll within a multi-dice game
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct SingleDiceResult {
    pub rolled_number: u8,
    pub is_win: bool,
    pub payout: u64,
}

/// Complete result for multi-dice game
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MultiDiceGameResult {
    /// Individual results for each dice
    pub dice_results: Vec<SingleDiceResult>,
    /// Number of dice rolled
    pub dice_count: u8,
    /// Number of winning dice
    pub total_wins: u8,
    /// Sum of all individual payouts
    pub total_payout: u64,
    /// Total bet amount (dice_count * bet_per_dice)
    pub total_bet: u64,
    /// Net profit/loss (total_payout - total_bet)
    pub net_result: i64,
    // Provably fair verification data
    pub server_seed: [u8; 32],
    pub server_seed_hash: String,
    pub nonce: u64,
    pub client_seed: String,
}
```

---

### 2. `dice_backend/src/seed.rs` - Multi-roll VRF derivation

Add new functions:

```rust
/// Derive a single roll from server_seed + client_seed + nonce + dice_index
/// This is deterministic and verifiable by players
fn derive_single_roll(
    server_seed: &[u8; 32],
    client_seed: &str,
    nonce: u64,
    dice_index: u8,
) -> u8 {
    let mut hasher = Sha256::new();
    hasher.update(server_seed);
    hasher.update(client_seed.as_bytes());
    hasher.update(nonce.to_be_bytes());
    hasher.update([dice_index]); // Critical: include dice index for independence
    let hash = hasher.finalize();

    let rand_u64 = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    (rand_u64 % (MAX_NUMBER as u64 + 1)) as u8
}

/// Generate multiple dice rolls using per-game VRF with deterministic derivation
/// Single raw_rand() call, derive N independent rolls
pub async fn generate_multi_dice_roll_vrf(
    dice_count: u8,
    client_seed: &str,
) -> Result<(Vec<u8>, [u8; 32], u64), String> {
    use crate::types::MAX_DICE_COUNT;

    if dice_count == 0 || dice_count > MAX_DICE_COUNT {
        return Err(format!("Dice count must be 1-{}", MAX_DICE_COUNT));
    }

    // Get fresh VRF randomness (single async call to IC consensus)
    let random_bytes = raw_rand().await
        .map_err(|e| format!("VRF unavailable: {:?}. Please retry.", e))?;

    let server_seed: [u8; 32] = random_bytes.0[0..32]
        .try_into()
        .map_err(|_| "Insufficient randomness")?;

    let nonce = ic_cdk::api::time();

    // Derive each dice roll independently using index-based hashing
    let mut rolls = Vec::with_capacity(dice_count as usize);
    for i in 0..dice_count {
        let roll = derive_single_roll(&server_seed, client_seed, nonce, i);
        rolls.push(roll);
    }

    Ok((rolls, server_seed, nonce))
}

/// Verify multi-dice game result for provable fairness
pub fn verify_multi_dice_result(
    server_seed: [u8; 32],
    client_seed: String,
    nonce: u64,
    expected_rolls: Vec<u8>,
) -> Result<bool, String> {
    for (i, &expected_roll) in expected_rolls.iter().enumerate() {
        let calculated_roll = derive_single_roll(&server_seed, &client_seed, nonce, i as u8);
        if calculated_roll != expected_roll {
            return Ok(false);
        }
    }
    Ok(true)
}
```

---

### 3. `dice_backend/src/game.rs` - Core game logic

Add new functions:

```rust
use crate::types::{MultiDiceGameResult, SingleDiceResult, MAX_DICE_COUNT};

/// Play multiple dice in a single call
/// - dice_count: 1-3 dice
/// - bet_per_dice: amount to bet on each individual dice
/// - All dice share same target_number and direction
pub async fn play_multi_dice(
    dice_count: u8,
    bet_per_dice: u64,
    target_number: u8,
    direction: RollDirection,
    client_seed: String,
    caller: Principal,
) -> Result<MultiDiceGameResult, String> {
    // VALIDATION
    if dice_count == 0 || dice_count > MAX_DICE_COUNT {
        return Err(format!("Dice count must be 1-{}", MAX_DICE_COUNT));
    }

    let total_bet = (dice_count as u64)
        .checked_mul(bet_per_dice)
        .ok_or("Bet calculation overflow")?;

    // Check user balance
    let user_balance = accounting::get_balance(caller);
    if user_balance < total_bet {
        return Err(format!(
            "INSUFFICIENT_BALANCE|Your dice balance: {:.4} USDT|Total bet: {:.4} USDT ({} dice x {:.4} USDT)",
            user_balance as f64 / DECIMALS_PER_CKUSDT as f64,
            total_bet as f64 / DECIMALS_PER_CKUSDT as f64,
            dice_count,
            bet_per_dice as f64 / DECIMALS_PER_CKUSDT as f64
        ));
    }

    // Validate per-dice bet
    if bet_per_dice < MIN_BET {
        return Err(format!("Minimum bet per dice is {} USDT", MIN_BET as f64 / DECIMALS_PER_CKUSDT as f64));
    }

    // Validate target number (same logic as single dice)
    match direction {
        RollDirection::Over => {
            if target_number >= MAX_NUMBER { return Err(format!("Target must be < {} for Over", MAX_NUMBER)); }
            if target_number < 1 { return Err("Target must be >= 1 for Over".to_string()); }
        }
        RollDirection::Under => {
            if target_number == 0 { return Err("Target must be > 0 for Under".to_string()); }
            if target_number > MAX_NUMBER { return Err(format!("Target must be <= {} for Under", MAX_NUMBER)); }
        }
    }

    // Calculate multiplier (same for all dice)
    let multiplier = calculate_multiplier_direct(target_number, &direction);

    // AGGREGATE MAX PAYOUT CHECK (worst case: all dice win)
    let max_payout_per_dice = (bet_per_dice as f64 * multiplier) as u64;
    let max_aggregate_payout = max_payout_per_dice
        .checked_mul(dice_count as u64)
        .ok_or("Max payout calculation overflow")?;

    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("House balance not initialized".to_string());
    }
    if max_aggregate_payout > max_allowed {
        return Err(format!(
            "Max potential payout {} USDT exceeds house limit {} USDT. Reduce bet or dice count.",
            max_aggregate_payout as f64 / DECIMALS_PER_CKUSDT as f64,
            max_allowed as f64 / DECIMALS_PER_CKUSDT as f64
        ));
    }

    if client_seed.len() > 256 {
        return Err("Client seed too long (max 256 chars)".to_string());
    }

    // VRF GENERATION (single call for all dice)
    let (rolled_numbers, server_seed, nonce) =
        crate::seed::generate_multi_dice_roll_vrf(dice_count, &client_seed).await?;
    let server_seed_hash = crate::seed::hash_server_seed(&server_seed);

    // DEDUCT TOTAL BET
    let balance_after_bet = user_balance.checked_sub(total_bet).ok_or("Balance underflow")?;
    accounting::update_balance(caller, balance_after_bet)?;

    crate::defi_accounting::record_bet_volume(total_bet);

    // PROCESS EACH DICE
    let mut dice_results = Vec::with_capacity(dice_count as usize);
    let mut total_wins: u8 = 0;
    let mut total_payout: u64 = 0;

    for rolled_number in rolled_numbers.iter().copied() {
        let is_house_hit = rolled_number == target_number;
        let is_win = if is_house_hit {
            false
        } else {
            match direction {
                RollDirection::Over => rolled_number > target_number,
                RollDirection::Under => rolled_number < target_number,
            }
        };

        let payout = if is_win {
            (bet_per_dice as f64 * multiplier) as u64
        } else {
            0
        };

        if is_win { total_wins += 1; }
        total_payout += payout;

        dice_results.push(SingleDiceResult {
            rolled_number,
            is_win,
            payout,
        });
    }

    // CREDIT TOTAL PAYOUT
    let current_balance = accounting::get_balance(caller);
    let new_balance = current_balance.checked_add(total_payout).ok_or("Balance overflow")?;
    accounting::update_balance(caller, new_balance)?;

    // SETTLE WITH POOL
    if let Err(e) = liquidity_pool::settle_bet(total_bet, total_payout) {
        // Rollback on pool failure
        let refund_balance = current_balance.checked_add(total_bet).ok_or("Refund overflow")?;
        accounting::update_balance(caller, refund_balance)?;
        return Err(format!("House cannot afford payout. Bet refunded. {}", e));
    }

    let net_result = (total_payout as i64) - (total_bet as i64);

    Ok(MultiDiceGameResult {
        dice_results,
        dice_count,
        total_wins,
        total_payout,
        total_bet,
        net_result,
        server_seed,
        server_seed_hash,
        nonce,
        client_seed,
    })
}

/// Calculate max bet per dice considering aggregate payout
pub fn calculate_max_bet_per_dice(
    dice_count: u8,
    target_number: u8,
    direction: &RollDirection,
) -> Result<u64, String> {
    if dice_count == 0 || dice_count > MAX_DICE_COUNT {
        return Err(format!("Dice count must be 1-{}", MAX_DICE_COUNT));
    }

    let multiplier = calculate_multiplier_direct(target_number, direction);
    if multiplier <= 0.0 {
        return Err("Invalid multiplier".to_string());
    }

    let max_allowed = accounting::get_max_allowed_payout();
    if max_allowed == 0 {
        return Err("House not initialized".to_string());
    }

    // max_allowed / (dice_count * multiplier)
    let max_bet_per_dice = (max_allowed as f64) / (dice_count as f64 * multiplier);
    Ok(max_bet_per_dice as u64)
}
```

---

### 4. `dice_backend/src/lib.rs` - Expose endpoints

Add new endpoints:

```rust
// Re-export new types
pub use types::{MultiDiceGameResult, SingleDiceResult};

#[update]
async fn play_multi_dice(
    dice_count: u8,
    bet_per_dice: u64,
    target_number: u8,
    direction: RollDirection,
    client_seed: String,
) -> Result<MultiDiceGameResult, String> {
    game::play_multi_dice(
        dice_count,
        bet_per_dice,
        target_number,
        direction,
        client_seed,
        ic_cdk::api::caller(),
    ).await
}

#[query]
fn verify_multi_dice_result(
    server_seed: [u8; 32],
    client_seed: String,
    nonce: u64,
    expected_rolls: Vec<u8>,
) -> Result<bool, String> {
    seed::verify_multi_dice_result(server_seed, client_seed, nonce, expected_rolls)
}

#[query]
fn get_max_bet_per_dice(
    dice_count: u8,
    target_number: u8,
    direction: RollDirection,
) -> Result<u64, String> {
    game::calculate_max_bet_per_dice(dice_count, target_number, &direction)
}
```

---

### 5. `dice_backend/dice_backend.did` - Candid interface

Add new types and service methods:

```candid
type SingleDiceResult = record {
  rolled_number: nat8;
  is_win: bool;
  payout: nat64;
};

type MultiDiceGameResult = record {
  dice_results: vec SingleDiceResult;
  dice_count: nat8;
  total_wins: nat8;
  total_payout: nat64;
  total_bet: nat64;
  net_result: int64;
  server_seed: blob;
  server_seed_hash: text;
  nonce: nat64;
  client_seed: text;
};

// Add to service block:
play_multi_dice: (nat8, nat64, nat8, RollDirection, text) -> (variant { Ok: MultiDiceGameResult; Err: text });
verify_multi_dice_result: (blob, text, nat64, vec nat8) -> (variant { Ok: bool; Err: text }) query;
get_max_bet_per_dice: (nat8, nat8, RollDirection) -> (variant { Ok: nat64; Err: text }) query;
```

---

## Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| VRF calls | Single `raw_rand()` | Minimize IC consensus calls |
| Roll derivation | `hash(seed + client + nonce + index)` | Cryptographic independence, verifiable |
| Max payout check | Worst-case aggregate | Prevents pool insolvency |
| Accounting | Net `settle_bet()` | Reuses existing infrastructure |
| Backwards compat | Keep `play_dice()` | No breaking changes |

---

## Testing Commands

```bash
# After deployment, test with 2 dice
dfx canister --network ic call dice_backend play_multi_dice \
  '(2 : nat8, 100000 : nat64, 50 : nat8, variant { Over }, "test123")'

# Check max bet for 3 dice at 50 Over
dfx canister --network ic call dice_backend get_max_bet_per_dice \
  '(3 : nat8, 50 : nat8, variant { Over })'

# Verify a result
dfx canister --network ic call dice_backend verify_multi_dice_result \
  '(blob "...", "client_seed", 1234567890 : nat64, vec { 42; 67 })'
```
