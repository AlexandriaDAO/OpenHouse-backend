#!/bin/bash
# Comprehensive balance check for Dice Backend
# Verifies accounting integrity and displays key metrics
# Version: 1.1

CANISTER_ID="whchi-hyaaa-aaaao-a4ruq-cai"
NETWORK="ic"

# Color codes (if terminal supports)
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "======================================"
echo "  Dice Backend Health Check"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "======================================"
echo ""

# 1. Refresh canister balance
echo "📊 Refreshing canister balance..."
BALANCE=$(dfx canister --network $NETWORK call $CANISTER_ID refresh_canister_balance 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Balance refreshed${NC}"
else
    echo -e "${RED}✗ Failed to refresh balance${NC}"
    echo "Error: $BALANCE"
    exit 1
fi
echo ""

# 2. Get audit status
echo "🔍 Running accounting audit..."
AUDIT=$(dfx canister --network $NETWORK call $CANISTER_ID audit_balances 2>&1)
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to run audit${NC}"
    echo "Error: $AUDIT"
    exit 1
fi
echo "$AUDIT"
echo ""

# 3. Parse audit for excess calculation
POOL=$(echo "$AUDIT" | sed -n 's/.*pool_reserve (\([0-9]*\)).*/\1/p')
DEPOSITS=$(echo "$AUDIT" | sed -n 's/.*deposits (\([0-9]*\)).*/\1/p')
CANISTER=$(echo "$AUDIT" | sed -n 's/.*canister (\([0-9]*\)).*/\1/p')

# Fallback if parsing failed
if [ -z "$POOL" ]; then POOL=0; fi
if [ -z "$DEPOSITS" ]; then DEPOSITS=0; fi
if [ -z "$CANISTER" ]; then CANISTER=0; fi

if [ -n "$POOL" ] && [ -n "$DEPOSITS" ] && [ -n "$CANISTER" ]; then
    CALCULATED=$((POOL + DEPOSITS))
    EXCESS=$((CANISTER - CALCULATED))
    EXCESS_USDT=$(echo "scale=6; $EXCESS / 1000000" | bc)
    FEE_COUNT=$((EXCESS / 10000))

    echo "======================================"
    echo "  Accounting Breakdown"
    echo "======================================"
    echo "Pool Reserve:     $POOL decimals"
    echo "User Deposits:    $DEPOSITS decimals"
    echo "Calculated Total: $CALCULATED decimals"
    echo "Actual Balance:   $CANISTER decimals"
    echo "--------------------------------------"
    echo "EXCESS:           $EXCESS decimals ($EXCESS_USDT USDT)"
    echo "Orphaned Fees:    $FEE_COUNT (@ 0.01 USDT each)"
    echo ""

    # Health status
    if [ $EXCESS -lt 1000000 ]; then
        echo -e "${GREEN}✅ HEALTH STATUS: HEALTHY${NC} (excess < 1 USDT)"
    else
        echo -e "${YELLOW}⚠️  HEALTH STATUS: WARNING${NC} (excess >= 1 USDT)"
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
CAN_BET=$(dfx canister --network $NETWORK call $CANISTER_ID can_accept_bets 2>&1)
if [ $? -eq 0 ]; then
    if echo "$CAN_BET" | grep -q "true"; then
        echo -e "${GREEN}✅ System can accept bets${NC} (pool reserve >= 100 USDT)"
    else
        echo -e "${RED}❌ System cannot accept bets${NC} (pool reserve < 100 USDT)"
    fi
else
    echo -e "${RED}✗ Failed to check operational status${NC}"
fi
echo ""

# 8. Display recent audit log (last 10 entries)
echo "======================================"
echo "  Recent Audit Log (Last 10 Events)"
echo "======================================"
dfx canister --network $NETWORK call $CANISTER_ID 'get_audit_log(0, 10)' 2>/dev/null
echo ""

echo "======================================"
echo "  Health Check Summary"
echo "======================================"

# Summary with recommendations
if [ -n "$EXCESS" ]; then
    if [ $EXCESS -lt 1000000 ]; then
        echo -e "${GREEN}✓ Overall Status: HEALTHY${NC}"
        echo "  - Accounting audit passed"
        echo "  - Excess balance within acceptable range"
    elif [ $EXCESS -lt 5000000 ]; then
        echo -e "${YELLOW}⚠ Overall Status: NEEDS ATTENTION${NC}"
        echo "  - Excess balance accumulating (1-5 USDT)"
        echo "  - Consider investigating orphaned fees"
    else
        echo -e "${RED}✗ Overall Status: ACTION REQUIRED${NC}"
        echo "  - High excess balance (>5 USDT)"
        echo "  - Immediate investigation recommended"
    fi
else
    echo -e "${YELLOW}⚠ Status: INCOMPLETE${NC}"
    echo "  - Unable to calculate full health metrics"
fi

echo ""
echo "======================================"
echo "  Health Check Complete"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "======================================"
