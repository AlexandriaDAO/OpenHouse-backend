#!/bin/bash
# Comprehensive Dice Backend Stress Test
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
