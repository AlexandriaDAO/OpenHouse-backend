# AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-ckusdt-migration-audit"
    exit 1
fi
echo "In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-ckusdt-migration-audit`
2. **Conduct investigation** - Follow plan sections below
3. **Fix identified bugs** - Make minimal targeted fixes
4. **Build & Deploy to Mainnet**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ./deploy.sh --dice-only
   ```
5. **Verify deployment**:
   ```bash
   # Test the fix worked
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai refresh_canister_balance
   dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai audit_balances
   ```
6. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "fix(dice): Audit ckUSDT migration for lost logic and fix cache bug"
   git push -u origin feature/ckusdt-migration-audit
   gh pr create --title "fix(dice): ckUSDT Migration Audit - Fix Cache & Investigate Lost Logic" --body "$(cat <<'EOF'
## Summary
- Fixes cache update bug lost during ICP->ckUSDT migration
- Comprehensive audit of migration for other lost logic
- Fixes lib.rs routing bug

## Bug Context
During the ckUSDT migration (commits 6ddbec3, a227e23, 108f283), the cache update logic was lost:
- OLD: `refresh_canister_balance()` updated `CACHED_CANISTER_BALANCE`
- NEW: `get_canister_balance()` does NOT update cache
- ROUTING BUG: `lib.rs` routes both endpoints to wrong function

This caused `check_balance.sh` to always report 0 balance, triggering false audit failures.

## Changes
- [List changes made during implementation]

## Test Plan
- [ ] Run `./check_balance.sh` - should show correct balance
- [ ] Verify `audit_balances()` returns correct values
- [ ] Check no other migration regressions found

Deployed to mainnet:
- Dice Backend: whchi-hyaaa-aaaao-a4ruq-cai

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
   ```

## CRITICAL RULES
- NO questions ("should I?", "want me to?", "is it done?")
- NO skipping PR creation - it's MANDATORY
- NO stopping after implementation - create PR immediately
- MAINNET DEPLOYMENT: All changes go directly to production
- ONLY stop at: approved, max iterations, or error

**Branch:** `feature/ckusdt-migration-audit`
**Worktree:** `/home/theseus/alexandria/openhouse-ckusdt-migration-audit`

---

# Implementation Plan: ckUSDT Migration Audit

## Task Classification
**BUG FIX**: Restore broken behavior from migration - minimal changes

## Background

During the ICP to ckUSDT migration (Nov 2025), critical cache update logic was lost. This audit will:
1. Fix the known cache bug
2. Systematically check for other lost logic
3. Document findings

## Known Bugs to Fix

### Bug 1: lib.rs Routing Error (PRIMARY FIX)

**Location:** `dice_backend/src/lib.rs:162-163`

**Current (BROKEN):**
```rust
#[update]
async fn refresh_canister_balance() -> u64 {
    defi_accounting::accounting::get_canister_balance().await  // WRONG!
}
```

**Fix:**
```rust
#[update]
async fn refresh_canister_balance() -> u64 {
    defi_accounting::accounting::refresh_canister_balance().await  // CORRECT
}
```

### Bug 2: get_canister_balance() Missing Cache Update (BELT-AND-SUSPENDERS)

**Location:** `dice_backend/src/defi_accounting/accounting.rs:656-664`

**Current:**
```rust
Ok((balance,)) => {
    balance.0.try_into().unwrap_or(0)
}
```

**Fix:**
```rust
Ok((balance,)) => {
    let bal: u64 = balance.0.try_into().unwrap_or(0);
    CACHED_CANISTER_BALANCE.with(|cache| {
        *cache.borrow_mut() = bal;
    });
    bal
}
```

## Investigation: Other Potentially Lost Logic

### Migration Commits to Audit
- `6ddbec3` - feat: Replace ICP with ckUSDT for stable-value betting
- `a227e23` - feat: Complete ckUSDT migration cleanup - Remove all ICP references
- `108f283` - refactor: Remove ICP archival code after ckUSDT migration

### Checklist for Investigation

Compare OLD (ICP) vs NEW (ckUSDT) implementations:

1. **Balance Queries**
   - [ ] `refresh_canister_balance()` - KNOWN BUG (cache not updating)
   - [ ] `get_canister_balance()` - KNOWN BUG (cache not updating)
   - [ ] Any other balance-related functions?

2. **Deposit Logic**
   - [ ] Fee handling (ICP vs ICRC-2 fee semantics differ)
   - [ ] Amount crediting (net vs gross)
   - [ ] Error handling paths

3. **Withdrawal Logic**
   - [ ] `attempt_transfer()` - verify ICRC-1 transfer works correctly
   - [ ] Fee deduction
   - [ ] Pending withdrawal handling

4. **LP Operations**
   - [ ] `deposit_liquidity()` - uses `icrc2_transfer_from`
   - [ ] `withdraw_liquidity()` - uses `icrc1_transfer`
   - [ ] Share calculations

5. **Audit Functions**
   - [ ] `audit_balances_internal()` - uses stale cache
   - [ ] `get_accounting_stats()` - uses stale cache

### Investigation Commands

Run these to compare before/after migration:

```bash
# See what changed in the migration
cd /home/theseus/alexandria/openhouse-ckusdt-migration-audit
git diff 6ddbec3^..a227e23 -- dice_backend/src/defi_accounting/

# Search for ICP-specific patterns that might have been incorrectly ported
rg "e8s|100_000_000|MAINNET_LEDGER" dice_backend/src/

# Search for cache-related code
rg "CACHED_|borrow_mut" dice_backend/src/defi_accounting/

# Check for any TODO/FIXME comments from migration
rg "TODO|FIXME|XXX|HACK" dice_backend/src/
```

## Files to Modify

1. `dice_backend/src/lib.rs` - Fix routing (line 163)
2. `dice_backend/src/defi_accounting/accounting.rs` - Add cache update to get_canister_balance (lines 656-664)

## Files to Investigate (Read-Only)

1. `dice_backend/src/defi_accounting/liquidity_pool.rs` - LP operations
2. `dice_backend/src/defi_accounting/types.rs` - Type definitions
3. `dice_backend/src/game.rs` - Game logic (should be unaffected)

## Verification

After fixes, run:
```bash
# Deploy
./deploy.sh --dice-only

# Test cache now works
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai refresh_canister_balance
# Should return actual balance (e.g., 100_000_000 for 100 USDT)

# Test audit now works
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai audit_balances
# Should return Ok with matching numbers

# Run health check script
cd scripts && ./check_balance.sh
# Should show correct balance, not 0
```

## Deliverables

1. Fix the two known bugs
2. Document any other issues found during investigation
3. If other issues found, either:
   - Fix them (if simple)
   - Document them for future PR (if complex)

## Notes

- This is a BUG FIX task - minimal changes only
- The audit was already documented in `claude_audit_v3.md` (MED-2) but never fixed
- Primary symptom: `check_balance.sh` shows 0 balance causing false audit failures
- Real balance is correct (verified via direct ledger query)
