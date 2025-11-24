#!/bin/bash
# Comprehensive balance check for Dice Backend
# Verifies accounting integrity and displays key metrics

CANISTER_ID="whchi-hyaaa-aaaao-a4ruq-cai"
NETWORK="ic"

echo "======================================"
echo "  Dice Backend Health Check"
echo "======================================"
echo ""

# 1. Refresh canister balance
echo "📊 Refreshing canister balance..."
BALANCE=$(dfx canister --network $NETWORK call $CANISTER_ID refresh_canister_balance 2>/dev/null | grep -oP '\d+')
echo "✓ Balance refreshed"
echo ""

# 2. Get audit status
echo "🔍 Running accounting audit..."
AUDIT=$(dfx canister --network $NETWORK call $CANISTER_ID audit_balances 2>/dev/null)
echo "$AUDIT"
echo ""

# 3. Parse audit for excess calculation
POOL=$(echo "$AUDIT" | grep -oP 'pool_reserve \(\K\d+' || echo "0")
DEPOSITS=$(echo "$AUDIT" | grep -oP 'deposits \(\K\d+' || echo "0")
CANISTER=$(echo "$AUDIT" | grep -oP 'canister \(\K\d+' || echo "0")

if [ -n "$POOL" ] && [ -n "$DEPOSITS" ] && [ -n "$CANISTER" ]; then
    CALCULATED=$((POOL + DEPOSITS))
    EXCESS=$((CANISTER - CALCULATED))
    EXCESS_ICP=$(echo "scale=8; $EXCESS / 100000000" | bc)
    FEE_COUNT=$((EXCESS / 10000))

    echo "======================================"
    echo "  Accounting Breakdown"
    echo "======================================"
    echo "Pool Reserve:     $POOL e8s"
    echo "User Deposits:    $DEPOSITS e8s"
    echo "Calculated Total: $CALCULATED e8s"
    echo "Actual Balance:   $CANISTER e8s"
    echo "--------------------------------------"
    echo "EXCESS:           $EXCESS e8s ($EXCESS_ICP ICP)"
    echo "Orphaned Fees:    $FEE_COUNT (@ 0.0001 ICP each)"
    echo ""

    # Health status
    if [ $EXCESS -lt 100000000 ]; then
        echo "✅ HEALTH STATUS: HEALTHY (excess < 1 ICP)"
    else
        echo "⚠️  HEALTH STATUS: WARNING (excess >= 1 ICP)"
    fi
    echo ""
fi

# 4. Get accounting stats
echo "======================================"
echo "  Accounting Statistics"
echo "======================================"
dfx canister --network $NETWORK call $CANISTER_ID get_accounting_stats 2>/dev/null
echo ""

# 5. Get pool stats
echo "======================================"
echo "  Liquidity Pool Statistics"
echo "======================================"
dfx canister --network $NETWORK call $CANISTER_ID get_pool_stats 2>/dev/null
echo ""

# 6. Get game stats
echo "======================================"
echo "  Game Performance Statistics"
echo "======================================"
dfx canister --network $NETWORK call $CANISTER_ID get_stats 2>/dev/null
echo ""

# 7. Check operational status
echo "======================================"
echo "  Operational Status"
echo "======================================"
CAN_BET=$(dfx canister --network $NETWORK call $CANISTER_ID can_accept_bets 2>/dev/null)
if echo "$CAN_BET" | grep -q "true"; then
    echo "✅ System can accept bets (pool reserve >= 10 ICP)"
else
    echo "❌ System cannot accept bets (pool reserve < 10 ICP)"
fi
echo ""

# 8. Display recent audit log (last 10 entries)
echo "======================================"
echo "  Recent Audit Log (Last 10 Events)"
echo "======================================"
dfx canister --network $NETWORK call $CANISTER_ID 'get_audit_log(0, 10)' 2>/dev/null
echo ""

echo "======================================"
echo "  Health Check Complete"
echo "======================================"
