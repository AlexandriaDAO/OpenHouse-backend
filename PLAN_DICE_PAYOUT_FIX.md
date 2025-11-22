# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-payout-fix"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-payout-fix`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Backend changes:
     ```bash
     # Build dice backend
     cargo build --target wasm32-unknown-unknown --release -p dice_backend

     # Deploy to mainnet (dice backend only)
     ./deploy.sh --dice-only
     ```
4. **Verify deployment**:
   ```bash
   # Check canister status
   dfx canister --network ic status dice_backend
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix: prevent race condition in dice payout"
   git push -u origin feature/dice-payout-fix-v2
   gh pr create --title "fix: Dice Payout Race Condition" --body "Fixes a race condition where the dice game could accept bets it couldn't afford to pay out if the pool was drained concurrently.

   Implements a graceful refund mechanism instead of trapping when the pool is insolvent at payout time.

   Deployed to mainnet:
   - Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai"
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

**Branch:** `feature/dice-payout-fix-v2`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-payout-fix`

---

# Implementation Plan

## Backend: `dice_backend/src/game.rs`

We need to modify `play_dice` to gracefully handle cases where the liquidity pool becomes insolvent between the initial check and the payout (race condition).

```rust
// PSEUDOCODE for dice_backend/src/game.rs

pub async fn play_dice(...) -> Result<DiceResult, String> {
    // ... existing checks ...
    
    // 1. Keep the initial pre-check (filters out obvious bad bets)
    
    // ... existing game logic (rng, win determination) ...
    
    // 2. Handle Win Case
    if is_win {
        // Calculate payout
        let payout = (bet_amount as f64 * multiplier) as u64;
        
        // NEW: Check if pool can afford it RIGHT NOW
        let pool_reserve = liquidity_pool::get_pool_reserve();
        
        if payout > pool_reserve {
            // CRITICAL: Race condition hit. Pool was drained during game.
            // ACTION: Refund bet, Log error, Return failure.
            
            // Refund
            let current_balance = accounting::get_balance(caller);
            let refund_balance = current_balance.checked_add(bet_amount)
                .ok_or("Balance overflow on refund")?;
            accounting::update_balance(caller, refund_balance)?;
            
            // Log
            ic_cdk::println!("CRITICAL: Payout failure. Refunded {} to {}", bet_amount, caller);
            
            return Err(format!(
                "House cannot afford payout ({} ICP). Your bet of {} ICP has been REFUNDED. Pool was drained by concurrent games. Please try a smaller bet.", 
                payout as f64 / E8S_PER_ICP as f64,
                bet_amount as f64 / E8S_PER_ICP as f64
            ));
        }

        // If affordable, proceed
        let current_balance = accounting::get_balance(caller);
        let new_balance = current_balance.checked_add(payout)
             .ok_or("Balance overflow when adding winnings")?;
        accounting::update_balance(caller, new_balance)?;

        // Update pool (this will no longer trap because we checked above)
        let profit = payout.saturating_sub(bet_amount);
        liquidity_pool::update_pool_on_win(profit);
    } else {
        liquidity_pool::update_pool_on_loss(bet_amount);
    }
    
    // ... return result ...
}
```

## Backend: `dice_backend/src/defi_accounting/liquidity_pool.rs`

The `update_pool_on_win` function currently traps. While redundant with our new check, we should keep the trap as a final safety net. No changes needed here.

## Deployment
Only `dice_backend` needs to be redeployed.
