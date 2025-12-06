# OpenHouse Plinko Security Audit

**Date:** 2025-12-06
**Auditor:** Claude Opus 4.5

---

# Part 1: Plinko Game Logic

**Scope:** `plinko_backend/src/game.rs`, `plinko_backend/src/lib.rs`, `plinko_backend/src/types.rs`

## Executive Summary

The plinko game logic is well-implemented with proper VRF usage, correct mathematical formula, and safe arithmetic. One medium-severity issue exists around the variance-aware betting system.

**Verified Correct:**
- VRF randomness: Uses IC's `raw_rand()` correctly, 1 byte per ball (8 bits for 8 rows)
- Multiplier formula: `M_bp(k) = 2000 + 3950 × d²` produces correct expected value of 0.99
- Payout calculation: Uses u128 intermediate math to prevent overflow
- Rollback on failure: If `settle_bet()` fails, user balance is correctly restored to original

---

## Vulnerabilities

### 1. Variance-Aware Betting Can Exceed Stated 15% Risk Limit

**Severity:** Medium

**Description:** Multi-ball games (4+ balls) use a statistical "effective multiplier" based on Law of Large Numbers to allow higher bets. However, the actual worst-case payout can significantly exceed the 15% pool limit that the system is designed to protect.

**Failure Scenario:**
1. Pool has 1000 USDT, max_allowed_payout = 150 USDT (15%)
2. User plays 10 balls with effective multiplier = 2.31x (4-sigma estimate)
3. Max bet per ball = 150 / (10 × 2.31) = 6.49 USDT
4. User bets 6.49 USDT × 10 balls = 64.9 USDT total
5. User gets extremely lucky: all 10 balls hit position 0 (6.52x each)
6. Actual payout = 64.9 × 6.52 = 423.15 USDT (profit = 358.25 USDT)
7. This is 35.8% of pool, exceeding the 15% design limit
8. Pool solvency check passes (358 < 1000), so payout succeeds
9. While astronomically unlikely for all 10, even 3-4 edge hits would exceed limits

**Probability:** All 10 balls hitting 6.52x is (1/256)^10 ≈ 10^-24. However, partial high-multiplier outcomes are much more likely and can still exceed limits.

**Location:** `game.rs:188-196`, `game.rs:291-307`

---

## Items Verified Secure

### VRF Randomness
- Uses IC's cryptographic `raw_rand()` - no fallback, fails safely if unavailable
- Gets randomness BEFORE deducting balance (fail-safe ordering)
- 32 bytes returned, uses 1 byte per ball (up to 30 balls)
- Bit extraction `(random_byte >> i) & 1` correctly produces 8 independent coin flips

### Mathematical Formula
- Multipliers: [65200, 37550, 17800, 5950, 2000, 5950, 17800, 37550, 65200] BP
- Expected value: Σ(probability × multiplier) = 0.99 (verified via binomial coefficients)
- 1% house edge correctly implemented
- Integer arithmetic prevents floating-point errors

### Bet Flow Integrity
```
1. Check balance          ✓ Validates user has funds
2. Validate min bet       ✓ 0.01 USDT minimum enforced
3. Check max payout       ✓ Against house limit (with variance caveat above)
4. Get VRF randomness     ✓ Before any state changes
5. Deduct bet             ✓ Atomic update
6. Record volume          ✓ For statistics
7. Calculate result       ✓ Deterministic from VRF
8. Credit payout          ✓ Safe math
9. Settle with pool       ✓ Pool solvency checked
10. Rollback on failure   ✓ Restores original balance
```

### Solvency Protection
- `settle_bet()` rejects if profit > pool_reserve
- Canister-level solvency check before each game
- Pool can never go negative

---

# Part 2: DeFi Accounting Module

**Scope:** `dice_backend/src/defi_accounting/` (shared module)

## Vulnerabilities

### 2. Orphaned Funds Tracking Inaccurate After Audit Log Pruning

**Severity:** Medium

**Description:** Audit log keeps only 1000 entries. `sum_abandoned_from_audit_internal()` calculates orphaned funds from this log. After pruning, the sum is permanently understated.

**Failure Scenario:**
1. 50 users abandon withdrawals totaling 500 USDT over time
2. After 1000+ audit events, oldest abandonments are pruned
3. `admin_health_check()` reports only recent abandonments (e.g., 200 USDT)
4. Admin's solvency assessment is incorrect by 300 USDT

**Location:** `accounting.rs:713-725`

---

### 3. Sub-Minimum Balances Trapped Without Recovery

**Severity:** Medium

**Description:** Balances below `MIN_WITHDRAW` (1 USDT) cannot be withdrawn. No mechanism exists to forfeit or recover these funds.

**Failure Scenario:**
1. User loses down to 0.5 USDT balance
2. Cannot withdraw (below 1 USDT minimum)
3. Must deposit more or gamble to zero
4. If user abandons platform, funds are locked forever

**Location:** `accounting.rs:199-201`

---

### 4. Parent Fee Credit Failure Returns Fee to Pool

**Severity:** Medium

**Description:** If parent canister has pending withdrawal when LP fee is due, fee goes to pool reserve instead of protocol.

**Failure Scenario:**
1. LP withdraws 1000 USDT, fee = 10 USDT
2. Parent has pending withdrawal at that moment
3. Fee added to pool reserve instead of parent
4. LPs get windfall, protocol loses revenue

**Location:** `liquidity_pool.rs:386-394`

---

## Recommendations

1. **For Issue #1:** Add a hard cap check at settlement time: `if total_payout > max_allowed { reject }`. This ensures the 15% limit is never exceeded regardless of statistical assumptions.

2. **For Issue #2:** Maintain a separate `total_abandoned_usdt` counter that is never pruned.

3. **For Issue #3:** Reduce `MIN_WITHDRAW` to 0.01 USDT (same as MIN_BET), or add admin sweep function.

4. **For Issue #4:** Queue failed fee credits for retry rather than returning to pool.
