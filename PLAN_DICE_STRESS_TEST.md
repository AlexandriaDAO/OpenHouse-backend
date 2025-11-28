# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-dice-stress-test"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-dice-stress-test`
2. **Implement feature** - Follow plan sections below
3. **No build/deploy needed** - This is a test script, not a canister deployment
4. **Test the script**:
   ```bash
   # Make script executable
   chmod +x scripts/stress_test_dice.sh

   # Optionally run a quick test (user will run full test)
   # ./scripts/stress_test_dice.sh
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add scripts/stress_test_dice.sh
   git commit -m "feat(dice): Add comprehensive stress test script

- Simulates 10-20 concurrent users
- Tests play_dice, deposit, withdraw, LP operations
- Fail-fast error handling
- Before/after accounting validation
- Parallel execution using bash backgrounding"
   git push -u origin feature/dice-stress-test
   gh pr create --title "feat(dice): Add stress test script for concurrent operations" --body "Implements PLAN_DICE_STRESS_TEST.md

## Overview
Comprehensive stress test script for Dice backend to detect race conditions and accounting discrepancies.

## Features
- 10-20 concurrent user simulation
- Randomized operations: play_dice (60%), deposit (20%), withdraw (10%), LP operations (10%)
- Fail-fast error handling - stops on any unexpected error
- Before/after accounting validation with audit_balances
- Detailed error categorization
- Warm-up and cool-down phases

## Testing
Script ready to run: \`./scripts/stress_test_dice.sh\`

No canister deployment needed - this is a testing tool."
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
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/dice-stress-test`
**Worktree:** `/home/theseus/alexandria/openhouse-dice-stress-test`

---

# Implementation Plan: Dice Backend Stress Test Script

## Current State

### Existing Files
```
openhouse/
├── scripts/
│   ├── check_balance.sh          # Health check script (reference)
│   └── generateTree.cjs           # Utility script
└── dice_backend/
    ├── dice_backend.did           # Canister interface
    └── src/lib.rs                 # Main implementation
```

### Dice Backend API (from dice_backend.did:50-104)
**Update (State-Modifying) Functions:**
- `play_dice(nat64, nat8, RollDirection, text)` - Core game function
- `deposit(nat64)` - Fund user balance
- `withdraw_all()` - Withdraw all funds
- `deposit_liquidity(nat64, opt nat)` - Add LP funds
- `withdraw_all_liquidity()` - Remove LP funds
- `refresh_canister_balance()` - Update balance cache

**Query Functions:**
- `audit_balances()` - Accounting integrity check
- `get_accounting_stats()` - Balance breakdown
- `can_accept_bets()` - Operational status
- `get_my_balance()` - User balance
- `get_pool_stats()` - LP statistics

### Reference: check_balance.sh Pattern
- Uses color codes for output
- Calls canister functions via dfx
- Parses results with grep/awk
- Provides health status summary

## Task: Create Stress Test Script

**Type:** NEW FEATURE - Adding new test infrastructure

**Requirements from User:**
- Simulate 10-20 concurrent users
- Test all core functions (play_dice, deposit, withdraw, LP operations)
- Parallel execution to trigger race conditions
- Fail-fast approach: stop on ANY unexpected error
- Before/after accounting validation
- Error categorization (expected vs unexpected)

## Implementation Plan

### File: `scripts/stress_test_dice.sh` (NEW)

```bash
#!/bin/bash
# PSEUDOCODE - Comprehensive Dice Backend Stress Test
# Simulates concurrent users to expose race conditions and bugs

# =============================================================================
# CONFIGURATION
# =============================================================================
CANISTER_ID="whchi-hyaaa-aaaao-a4ruq-cai"
NETWORK="ic"
CONCURRENT_USERS=15          # 10-20 range
OPERATIONS_PER_USER=15       # Each user does 15 operations
TEMP_DIR="/tmp/dice_stress_$$"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Generate random bet parameters
function random_bet_params() {
    # bet_amount: 10,000 to 10,000,000 decimals (0.01 to 10 USDT)
    BET=$((10000 + RANDOM % 9990000))

    # target_number: 1-99 (avoid edge cases)
    TARGET=$((1 + RANDOM % 99))

    # direction: Over or Under (50/50 chance)
    if [ $((RANDOM % 2)) -eq 0 ]; then
        DIRECTION="variant { Over }"
    else
        DIRECTION="variant { Under }"
    fi

    # client_seed: random string
    CLIENT_SEED="stress_test_${RANDOM}_${RANDOM}"

    echo "$BET $TARGET $DIRECTION $CLIENT_SEED"
}

# Call dfx with error checking
function dfx_call() {
    local METHOD=$1
    local ARGS=$2
    local OUTPUT

    # Make the call and capture output
    OUTPUT=$(dfx canister --network $NETWORK call $CANISTER_ID $METHOD "$ARGS" 2>&1)
    local EXIT_CODE=$?

    # Check for unexpected errors
    if [ $EXIT_CODE -ne 0 ]; then
        echo "$OUTPUT" | grep -q "Insufficient balance" && return 1  # Expected
        echo "$OUTPUT" | grep -q "Pool reserve too low" && return 2  # Expected
        echo "$OUTPUT" | grep -q "Bet too high" && return 3           # Expected

        # Unexpected error - fail fast
        echo -e "${RED}❌ UNEXPECTED ERROR in $METHOD${NC}" >&2
        echo "$OUTPUT" >&2
        exit 1
    fi

    echo "$OUTPUT"
    return 0
}

# Simulate one user's operations
function simulate_user() {
    local USER_ID=$1
    local SUCCESS=0
    local EXPECTED_ERRORS=0

    for op in $(seq 1 $OPERATIONS_PER_USER); do
        # Random operation selection
        RAND=$((RANDOM % 100))

        if [ $RAND -lt 60 ]; then
            # 60% - play_dice
            read BET TARGET DIRECTION CLIENT_SEED <<< $(random_bet_params)
            dfx_call "play_dice" "($BET : nat64, $TARGET : nat8, $DIRECTION, \"$CLIENT_SEED\")"
            [ $? -eq 0 ] && ((SUCCESS++)) || ((EXPECTED_ERRORS++))

        elif [ $RAND -lt 80 ]; then
            # 20% - deposit
            AMOUNT=$((1000000 + RANDOM % 49000000))  # 1-50 USDT
            dfx_call "deposit" "($AMOUNT : nat64)"
            [ $? -eq 0 ] && ((SUCCESS++)) || ((EXPECTED_ERRORS++))

        elif [ $RAND -lt 90 ]; then
            # 10% - withdraw_all
            dfx_call "withdraw_all" "()"
            [ $? -eq 0 ] && ((SUCCESS++)) || ((EXPECTED_ERRORS++))

        elif [ $RAND -lt 95 ]; then
            # 5% - deposit_liquidity (10 USDT minimum)
            LP_AMOUNT=$((10000000 + RANDOM % 40000000))  # 10-50 USDT
            dfx_call "deposit_liquidity" "($LP_AMOUNT : nat64, null)"
            [ $? -eq 0 ] && ((SUCCESS++)) || ((EXPECTED_ERRORS++))

        else
            # 5% - withdraw_all_liquidity
            dfx_call "withdraw_all_liquidity" "()"
            [ $? -eq 0 ] && ((SUCCESS++)) || ((EXPECTED_ERRORS++))
        fi

        # Small random delay (10-100ms) to vary timing
        sleep 0.$((RANDOM % 90 + 10))
    done

    echo "$USER_ID:$SUCCESS:$EXPECTED_ERRORS"
}

# =============================================================================
# MAIN TEST EXECUTION
# =============================================================================

echo "======================================"
echo "  Dice Backend Stress Test"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "======================================"
echo ""

# Create temp directory for logs
mkdir -p "$TEMP_DIR"

# -----------------------------------------------------------------------------
# PHASE 1: Pre-Test Setup
# -----------------------------------------------------------------------------
echo "[SETUP] Running pre-test validation..."

# Run audit and save baseline
BASELINE_AUDIT=$(dfx canister --network $NETWORK call $CANISTER_ID audit_balances 2>&1)
if ! echo "$BASELINE_AUDIT" | grep -q "Ok"; then
    echo -e "${RED}❌ Pre-test audit failed${NC}"
    echo "$BASELINE_AUDIT"
    exit 1
fi
echo -e "${GREEN}✓ Pre-test audit passed${NC}"

# Check operational status
CAN_BET=$(dfx canister --network $NETWORK call $CANISTER_ID can_accept_bets 2>&1)
if ! echo "$CAN_BET" | grep -q "true"; then
    echo -e "${RED}❌ System cannot accept bets${NC}"
    exit 1
fi
echo -e "${GREEN}✓ System operational${NC}"

# Get baseline balances
USER_BAL=$(dfx canister --network $NETWORK call $CANISTER_ID get_my_balance 2>&1 | grep -oP '\d+')
POOL_STATS=$(dfx canister --network $NETWORK call $CANISTER_ID get_pool_stats 2>&1)
POOL_RESERVE=$(echo "$POOL_STATS" | grep -oP 'pool_reserve = \K\d+')

echo ""
echo "Starting balances:"
echo "  User: $(echo "scale=2; $USER_BAL / 1000000" | bc) USDT"
echo "  Pool: $(echo "scale=2; $POOL_RESERVE / 1000000" | bc) USDT"
echo ""

# -----------------------------------------------------------------------------
# PHASE 2: Warm-up (Sequential)
# -----------------------------------------------------------------------------
echo "[WARMUP] Running 5 sequential operations..."

for i in {1..5}; do
    read BET TARGET DIRECTION CLIENT_SEED <<< $(random_bet_params)
    if ! dfx_call "play_dice" "($BET : nat64, $TARGET : nat8, $DIRECTION, \"$CLIENT_SEED\")" > /dev/null; then
        echo -e "${RED}❌ Warmup operation $i failed${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ Warmup completed${NC}"
echo ""

# -----------------------------------------------------------------------------
# PHASE 3: Stress Test (Parallel)
# -----------------------------------------------------------------------------
echo "[STRESS] Launching $CONCURRENT_USERS concurrent users..."
echo "[STRESS] Each user performing $OPERATIONS_PER_USER operations..."
echo ""

PIDS=()
for user_id in $(seq 1 $CONCURRENT_USERS); do
    simulate_user $user_id > "$TEMP_DIR/user_${user_id}.log" &
    PIDS+=($!)
done

# Wait for all users and check for failures
FAILED=0
for pid in "${PIDS[@]}"; do
    if ! wait $pid; then
        FAILED=1
    fi
done

if [ $FAILED -eq 1 ]; then
    echo -e "${RED}❌ Stress test failed - check logs${NC}"
    exit 1
fi

# Parse results
TOTAL_SUCCESS=0
TOTAL_EXPECTED_ERRORS=0
for user_id in $(seq 1 $CONCURRENT_USERS); do
    RESULT=$(cat "$TEMP_DIR/user_${user_id}.log")
    SUCCESS=$(echo $RESULT | cut -d: -f2)
    ERRORS=$(echo $RESULT | cut -d: -f3)
    TOTAL_SUCCESS=$((TOTAL_SUCCESS + SUCCESS))
    TOTAL_EXPECTED_ERRORS=$((TOTAL_EXPECTED_ERRORS + ERRORS))
    echo -e "${GREEN}✓${NC} User $user_id completed ($SUCCESS success, $ERRORS expected errors)"
done
echo ""

# -----------------------------------------------------------------------------
# PHASE 4: Cool-down (Sequential)
# -----------------------------------------------------------------------------
echo "[COOLDOWN] Running 5 sequential operations..."

for i in {1..5}; do
    read BET TARGET DIRECTION CLIENT_SEED <<< $(random_bet_params)
    if ! dfx_call "play_dice" "($BET : nat64, $TARGET : nat8, $DIRECTION, \"$CLIENT_SEED\")" > /dev/null; then
        echo -e "${RED}❌ Cooldown operation $i failed${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ Cooldown completed${NC}"
echo ""

# -----------------------------------------------------------------------------
# PHASE 5: Post-Test Validation
# -----------------------------------------------------------------------------
echo "[VALIDATION] Running post-test validation..."

# Run audit again
FINAL_AUDIT=$(dfx canister --network $NETWORK call $CANISTER_ID audit_balances 2>&1)
if ! echo "$FINAL_AUDIT" | grep -q "Ok"; then
    echo -e "${RED}❌ Post-test audit failed${NC}"
    echo "$FINAL_AUDIT"
    exit 1
fi
echo -e "${GREEN}✓ Post-test audit passed${NC}"

# Check still operational
CAN_BET=$(dfx canister --network $NETWORK call $CANISTER_ID can_accept_bets 2>&1)
if echo "$CAN_BET" | grep -q "true"; then
    echo -e "${GREEN}✓ System still operational${NC}"
else
    echo -e "${YELLOW}⚠ System cannot accept bets (may be normal if pool depleted)${NC}"
fi

# Get final balances
FINAL_USER_BAL=$(dfx canister --network $NETWORK call $CANISTER_ID get_my_balance 2>&1 | grep -oP '\d+')
FINAL_POOL_STATS=$(dfx canister --network $NETWORK call $CANISTER_ID get_pool_stats 2>&1)
FINAL_POOL_RESERVE=$(echo "$FINAL_POOL_STATS" | grep -oP 'pool_reserve = \K\d+')

echo ""
echo "Ending balances:"
echo "  User: $(echo "scale=2; $FINAL_USER_BAL / 1000000" | bc) USDT"
echo "  Pool: $(echo "scale=2; $FINAL_POOL_RESERVE / 1000000" | bc) USDT"
echo ""

# -----------------------------------------------------------------------------
# PHASE 6: Summary
# -----------------------------------------------------------------------------
TOTAL_OPS=$((CONCURRENT_USERS * OPERATIONS_PER_USER + 10))  # +10 for warmup/cooldown
SUCCESS_RATE=$(echo "scale=1; ($TOTAL_SUCCESS + 10) * 100 / $TOTAL_OPS" | bc)

echo "======================================"
echo "  STRESS TEST PASSED ✅"
echo "======================================"
echo "Total operations: $TOTAL_OPS"
echo "Successful: $(($TOTAL_SUCCESS + 10))"
echo "Expected errors: $TOTAL_EXPECTED_ERRORS"
echo "Unexpected errors: 0"
echo "Success rate: ${SUCCESS_RATE}%"
echo ""
echo "Accounting validation: PASSED"
echo "System integrity: MAINTAINED"
echo "======================================"

# Cleanup
rm -rf "$TEMP_DIR"
```

## Key Implementation Details

### 1. Parallel Execution via Bash Backgrounding
- Each `simulate_user` function runs as background process (`&`)
- PIDs tracked in array
- `wait` blocks until all complete
- Exit code checked for each process

### 2. Fail-Fast Error Handling
- `dfx_call` wrapper checks every response
- Known expected errors (insufficient balance, etc.) return non-zero but continue
- ANY other error immediately `exit 1` for entire script
- Error messages printed to stderr

### 3. Random Operation Selection
- 60% chance: `play_dice` with random params
- 20% chance: `deposit` (1-50 USDT)
- 10% chance: `withdraw_all`
- 5% chance: `deposit_liquidity` (10-50 USDT minimum)
- 5% chance: `withdraw_all_liquidity`

### 4. Before/After Validation
- `audit_balances()` run before and after stress test
- `can_accept_bets()` checked for operational status
- Balance deltas displayed but not strictly validated (house edge means variance)

### 5. Phases for Safety
- **Warm-up**: 5 sequential ops to verify system responsive
- **Stress**: Parallel concurrent operations
- **Cool-down**: 5 sequential ops to verify system still works
- Prevents false failures from system being down

## Expected Behavior

### Success Case
- All operations complete (possibly with expected errors like insufficient balance)
- Pre/post audits pass
- System remains operational
- Script exits 0

### Failure Case (What We're Looking For)
- Canister trapped error
- Audit fails (accounting discrepancy)
- Timeout errors
- Any unexpected error message
- Script exits 1 immediately

## Testing Strategy

User will run manually after implementation:
```bash
# Make executable
chmod +x scripts/stress_test_dice.sh

# Run stress test
./scripts/stress_test_dice.sh

# Expected duration: 30-60 seconds
# Watch for any errors
```

## Files Modified
- **NEW**: `scripts/stress_test_dice.sh` - Main stress test script

## Deployment Notes
**No canister deployment required** - this is a testing tool that calls existing mainnet canisters.

## Success Criteria
✅ Script created and executable
✅ Implements all 5 phases (setup, warmup, stress, cooldown, validation)
✅ Parallel execution with 10-20 concurrent users
✅ Fail-fast on unexpected errors
✅ Before/after accounting validation
✅ Clear, readable output with status indicators
