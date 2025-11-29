# Audit Plan V4: Evidence-Based Security Audit

**Target:** `dice_backend/src/defi_accounting/`
**Methodology:** Empirical Proof-of-Concept Required
**Canister:** `whchi-hyaaa-aaaao-a4ruq-cai` (Mainnet)

---

## Audit Philosophy: No Speculation, Only Proof

Previous audits (v1-v3) identified "vulnerabilities" that were:
- **Invalid**: Misunderstood IC's atomic execution model (e.g., "race conditions" in sequential message processing)
- **Theoretical**: Described scenarios that can't happen in practice
- **Unverified**: No attempt to reproduce the claimed exploit

This audit REQUIRES empirical proof. For every claimed vulnerability:

```
IF you_cannot_demonstrate_it THEN it_is_not_a_vulnerability
```

---

## Available Testing Infrastructure

You have access to real-world testing tools:

### 1. Stress Test Script
```bash
/home/theseus/alexandria/openhouse/scripts/stress_test_dice.sh
```
- 15 concurrent users x 15 operations each = 225 concurrent operations
- 60% play_dice, 20% deposit, 10% withdraw, 5% deposit_liquidity, 5% withdraw_liquidity
- Pre/post audit validation
- Automated accounting verification

### 2. Balance Check Script
```bash
/home/theseus/alexandria/openhouse/scripts/check_balance.sh
```
- Refreshes canister balance
- Runs accounting audit
- Shows pool stats, LP stats, game stats
- Displays recent audit log

### 3. Direct Canister Calls
```bash
# Dice Backend
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai <method> '(args)'

# Check accounting
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai audit_balances
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_accounting_stats
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_pool_stats
```

### 4. Unit Tests
```bash
/home/theseus/alexandria/openhouse/dice_backend/src/defi_accounting/tests/
```
- Serialization boundary tests
- Can be extended to test specific scenarios

---

## Audit Procedure: The 5-Step Verification Protocol

For EVERY vulnerability you claim, you MUST complete ALL 5 steps:

### Step 1: State the Hypothesis
Write the exact vulnerability claim in this format:
```
CLAIM: [Specific scenario that causes fund loss/DoS/corruption]
PRECONDITIONS: [Exact state required]
TRIGGER: [Exact sequence of operations]
EXPECTED RESULT: [Exact outcome - not "could cause" but "will cause"]
```

### Step 2: Design the Experiment
Create a reproducible test:
```
TEST DESIGN:
1. Setup: [How to get the system into the precondition state]
2. Actions: [Exact canister calls in order]
3. Measurement: [What to check before/after]
4. Success Criteria: [Exact condition that proves vulnerability exists]
```

### Step 3: Execute the Experiment
Run the test against the LIVE CANISTER:
```bash
# Show your actual commands and their outputs
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai ...
```

Document:
- Exact commands run
- Full output (not summarized)
- Timestamps of operations

### Step 4: Analyze Results
Compare expected vs actual:
```
EXPECTED: [What should happen if vulnerability exists]
ACTUAL: [What actually happened]
MATCH: [Yes/No - did the vulnerability manifest?]
```

### Step 5: Classify the Finding
Based on empirical evidence:

| Evidence Level | Classification |
|----------------|----------------|
| Successfully exploited on mainnet | **CRITICAL** - Verified |
| Reproduced in stress test | **HIGH** - Verified |
| Caused accounting discrepancy | **MEDIUM** - Verified |
| Code path exists but couldn't trigger | **LOW** - Theoretical |
| Pure speculation, no evidence | **INVALID** - Not a vulnerability |

---

## Mandatory Audit Phases

### Phase 1: Baseline Establishment (REQUIRED FIRST)

Before claiming ANY vulnerability:

```bash
# 1. Record starting state
./scripts/check_balance.sh > baseline_$(date +%s).log

# 2. Run stress test to ensure system is stable
./scripts/stress_test_dice.sh

# 3. Record post-stress state
./scripts/check_balance.sh > post_stress_$(date +%s).log

# 4. Verify accounting passed
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai audit_balances
```

**Checkpoint**: System must pass `audit_balances` before proceeding.

### Phase 2: Concurrency Attack Testing

Test claimed race conditions by actually trying to race:

```bash
# Attempt concurrent withdrawals from same principal
for i in {1..10}; do
  dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai withdraw_all '()' &
done
wait

# Check: Did balance ever go negative? Did audit fail?
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai audit_balances
```

**What to prove**: Can you actually cause a double-spend via concurrency?

### Phase 3: Timeout/Rollback Scenario Testing

Previous audits claimed:
> "If ledger times out and rollback happens, user gets double-spent"

**Your job**: Prove this can actually happen:

1. Find a way to trigger ledger timeout (difficult - ledger is reliable)
2. Show the rollback actually credits funds that were already sent
3. Demonstrate the user can withdraw twice

**If you cannot trigger this scenario**: It is NOT a vulnerability, it is speculation.

### Phase 4: Serialization Limit Testing

Previous audits claimed:
> "Large Nat values could exceed serialization bounds"

**Your job**: Find the actual breaking point:

```bash
# Try to create the largest possible withdrawal that fits
# Then try one that should break it

# Calculate: At what share count does serialization fail?
# Attempt to reach that state legitimately
```

**Evidence required**: Show a transaction that actually fails due to serialization.

### Phase 5: LP Share Manipulation Testing

Previous audits claimed:
> "LP shares can be diluted via race condition"

**Your job**: Actually dilute someone's shares:

1. Have multiple identities (if testing multi-user)
2. Attempt concurrent LP deposits
3. Measure expected shares vs received shares
4. Show measurable loss

---

## What Counts as Evidence

### Valid Evidence
- Transaction hashes showing double payment
- Audit failures after specific operation sequences
- Concrete balance discrepancies (before/after comparison)
- Canister traps with stack traces
- Reproducible test scripts that fail

### Invalid Evidence
- "Could theoretically happen if..."
- "In a scenario where X and Y align..."
- "The code doesn't prevent..."
- "If the ledger behaves unexpectedly..."
- Any claim without reproduction steps

---

## Report Format

For each finding, use this EXACT format:

```markdown
## Finding [N]: [Title]

### Severity: [CRITICAL/HIGH/MEDIUM/LOW/INVALID]

### Claim
[One sentence: What is the vulnerability?]

### Preconditions
- [Bullet list of required state]

### Reproduction Steps
1. [Exact command 1]
2. [Exact command 2]
...

### Evidence
\`\`\`bash
# Actual commands run:
$ dfx canister --network ic call ...
[Actual output]
\`\`\`

### Before/After State
| Metric | Before | After | Discrepancy |
|--------|--------|-------|-------------|
| User Balance | X | Y | +/- Z |
| Pool Reserve | X | Y | +/- Z |
| Audit Status | Pass/Fail | Pass/Fail | - |

### Conclusion
[Was the vulnerability proven? Yes/No]
[If no: Why couldn't it be reproduced?]
```

---

## Disallowed Claims

The following claims are AUTOMATICALLY INVALID unless you provide extraordinary evidence:

1. **"IC doesn't guarantee atomic execution"** - It does. Single-message mutations are atomic.

2. **"Race condition between line X and line Y"** - Unless there's an `await` between them, impossible.

3. **"Concurrent users could..."** - IC processes messages sequentially per canister. Prove the interleaving.

4. **"If the ledger times out..."** - Ledger is highly reliable. Show actual timeout occurrence.

5. **"Nat overflow could..."** - Show the actual Nat value that overflows, and how to reach it.

6. **"Integer division precision loss..."** - Show actual fund loss from rounding, not theoretical pennies.

---

## Passing Criteria

Your audit is considered rigorous if:

- [ ] Baseline accounting passes before starting
- [ ] Every claimed vulnerability has reproduction steps
- [ ] Every reproduction was actually attempted on mainnet
- [ ] Results are documented with actual command outputs
- [ ] Findings are classified by evidence level, not theory
- [ ] Stress test passes after your attack attempts

---

## Final Deliverable

Submit:

1. **Evidence Log**: Full transcript of all commands run and outputs
2. **Findings Report**: Using the exact format above
3. **Summary Table**:

| ID | Title | Claimed Severity | Evidence Level | Final Verdict |
|----|-------|------------------|----------------|---------------|
| 1 | ... | CRITICAL | Reproduced | VALID |
| 2 | ... | HIGH | Could not reproduce | INVALID |

4. **Stress Test Result**: Output of `./scripts/stress_test_dice.sh` run after your testing

---

## Meta-Rule

If you find yourself writing "could", "might", "theoretically", or "if X happens"--STOP.

Go prove it or don't report it.

The question is not "Is this code perfect?"
The question is "Can I steal money from this canister?"

If yes: Show me.
If no: Move on.
