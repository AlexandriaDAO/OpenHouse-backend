# DeFi Accounting Architecture - YAML Pseudocode Guide

> **Purpose**: This document translates the Rust DeFi accounting module into simple, concise YAML-style pseudocode.
> You don't need to be a Rust expert to understand the system's architecture and flow.

---

## 📖 The Story: How OpenHouse Casino Manages Money

This module is the **financial backbone** of OpenHouse Casino. It handles three key responsibilities:

1. **Player Money** - Users deposit ckUSDT, play games, withdraw winnings
2. **House Money** - Liquidity providers stake funds that back all games
3. **Statistics** - Track daily volume, profit, and APY for transparency

Think of it like a casino with three accounts:
- **User Balances** (player chips)
- **Liquidity Pool** (house bankroll)
- **Statistics Ledger** (daily reports)

---

## 🗂️ Module Structure Overview

```yaml
defi_accounting/:
  core_modules:
    - mod.rs           # Public API exports
    - types.rs         # Data structures (PendingWithdrawal, AuditEntry)
    - memory_ids.rs    # Stable storage ID registry (prevents collisions)
    - accounting.rs    # User deposits/withdrawals/balances
    - liquidity_pool.rs # LP deposits/withdrawals/pool management
    - query.rs         # Read-only query functions

  statistics/:          # Daily stats tracking (isolated from critical logic)
    - mod.rs
    - types.rs          # DailySnapshot, ApyInfo
    - storage.rs        # StableVec for historical data
    - collector.rs      # Record bets, take snapshots
    - queries.rs        # APY calculations
```

---

## 🧱 Part 1: Data Structures (types.rs)

### Core Types

```yaml
PendingWithdrawal:
  purpose: "Track withdrawals in-flight (between initiation and completion)"
  design_note: "Removed retry fields to prevent double-spend vulnerability"
  fields:
    withdrawal_type:
      User:
        amount: u64
      LP:
        shares: Nat
        reserve: Nat
        amount: u64
    created_at: u64  # Ledger deduplication key (prevents duplicate transfers)

AuditEntry:
  purpose: "Tamper-proof log of all financial events"
  fields:
    timestamp: u64
    event: AuditEvent

AuditEvent:
  types:
    - WithdrawalInitiated
    - WithdrawalCompleted
    - WithdrawalFailed
    - WithdrawalAbandoned  # User gave up (NO balance restore - prevents double-spend)
    - BalanceRestored      # Rollback after definite failure
    - ParentFeeCredited    # LP fee sent to parent canister
    - SlippageProtectionTriggered  # LP deposit refunded due to price change
```

### Why "Abandoned" Never Restores Balance

```yaml
double_spend_prevention:
  scenario: "Transfer might have succeeded on-chain but we lost connection"
  options:
    auto_rollback:
      risk: "User gets balance back PLUS their on-chain withdrawal = 2x payout"
    manual_abandon:
      risk: "User might lose funds if they abandon without checking on-chain"

  decision: "Accept 'user might lose' over 'house definitely loses twice'"
  rationale:
    - "Orphaned funds stay in canister (system remains solvent)"
    - "User can check on-chain balance before abandoning"
    - "Astronomically rare edge case (~1 in 30 billion)"
```

---

## 💾 Part 2: Memory Management (memory_ids.rs)

```yaml
stable_memory_allocation:
  purpose: "Prevent memory ID collisions across canister upgrades"

  ranges:
    accounting: [10-19]
      - USER_BALANCES: 10
      - LP_SHARES: 11
      - POOL_STATE: 13

    withdrawals_audit: [20-29]
      - PENDING_WITHDRAWALS: 20
      - AUDIT_LOG_MAP: 24
      - AUDIT_LOG_COUNTER: 25

    statistics: [30-39]
      - SNAPSHOTS: 30
      - ACCUMULATOR: 31

  abandoned_ids: [22, 23]  # Corrupted, never reuse
```

---

## 💰 Part 3: User Accounting (accounting.rs)

### Constants

```yaml
constants:
  MIN_DEPOSIT: 1_000_000     # 1 USDT (prevents dust attacks)
  MIN_WITHDRAW: 1_000_000    # 1 USDT
  MAX_AUDIT_ENTRIES: 1000    # Rolling log (oldest pruned)
  PARENT_AUTO_WITHDRAW_THRESHOLD: 100_000_000  # 100 USDT
```

### Storage

```yaml
thread_local_storage:
  USER_BALANCES_STABLE:
    type: StableBTreeMap<Principal, u64>
    purpose: "Player betting balances"

  PENDING_WITHDRAWALS:
    type: StableBTreeMap<Principal, PendingWithdrawal>
    purpose: "Track in-flight withdrawals (max 1 per user)"

  AUDIT_LOG_MAP:
    type: StableBTreeMap<u64, AuditEntry>
    purpose: "Sequential audit trail (auto-pruned at 1000 entries)"

  AUDIT_LOG_COUNTER:
    type: StableCell<u64>
    purpose: "Sequential key generator for audit log"
```

### Deposit Flow (ICRC-2)

```yaml
deposit(amount: u64):
  validation:
    - if amount < MIN_DEPOSIT: ERROR

  icrc2_transfer_from:
    from: caller's account
    to: canister account
    amount: amount
    fee: CKUSDT_TRANSFER_FEE (explicitly charged to sender)

    why_icrc2: "Canister pulls funds (requires prior approval from user)"

  on_success:
    - credit_user_balance(caller, amount)  # Full amount received
    - return new_balance

  note: "User pays amount + fee, canister receives amount (fee burned by ledger)"
```

### Withdrawal Flow

```yaml
withdraw_all():
  caller: msg_caller()

  preconditions:
    - if pending_withdrawal_exists(caller): ERROR "already pending"
    - if balance == 0: ERROR
    - if balance < MIN_WITHDRAW: ERROR

  atomic_state_transition:
    step1: create_pending_withdrawal(caller, balance, timestamp)
    step2: zero_user_balance(caller)  # Balance moved to pending
    step3: log_audit(WithdrawalInitiated)

    why_order: "If step1 fails, balance untouched (IC auto-rollback)"

  attempt_transfer(caller, balance, timestamp):
    cases:
      Success:
        - remove_pending(caller)
        - log_audit(WithdrawalCompleted)
        - return amount

      DefiniteError (initial attempt only):
        - rollback_withdrawal(caller)  # SAFE: fresh timestamp = no TooOld
        - log_audit(WithdrawalFailed)
        - return ERROR

      UncertainError:
        - keep_pending(caller)  # DO NOT rollback
        - return ERROR "Call retry_withdrawal() or abandon_withdrawal()"
```

### Retry & Abandon (User-Controlled Recovery)

```yaml
retry_withdrawal():
  caller: msg_caller()

  get_pending_or_error(caller)

  attempt_transfer(caller, amount, SAME_created_at):
    why_same_timestamp: "Ledger deduplication = idempotent retry"

    cases:
      Success:
        - complete_withdrawal(caller)

      DefiniteError:
        - DO_NOT_rollback()  # Might be TooOld (doesn't mean failed)
        - return ERROR "Check on-chain balance. Use abandon_withdrawal() if received."

      UncertainError:
        - return ERROR "Please retry again"

abandon_withdrawal():
  purpose: "User gives up on stuck withdrawal"

  critical_safety:
    - remove_pending(caller)
    - DO_NOT_restore_balance()  # Prevents double-spend
    - log_audit(WithdrawalAbandoned)

  user_must_verify:
    - "Check ckUSDT balance on-chain before abandoning"
    - "If funds received: abandon is correct (clears frozen state)"
    - "If funds NOT received: you accept the loss"
```

### Parent Canister Fee Auto-Withdrawal

```yaml
start_parent_withdrawal_timer():
  interval: 7 days

  auto_withdraw_parent():
    parent: PARENT_STAKER_CANISTER
    balance: get_balance(parent)

    if balance > 100 USDT:
      withdraw_internal(parent)

    note: "TOCTOU race acceptable (withdraw_internal checks atomically)"
```

---

## 🏦 Part 4: Liquidity Pool (liquidity_pool.rs)

### Constants

```yaml
lp_constants:
  MINIMUM_LIQUIDITY: 1000         # Burned shares (prevents share manipulation)
  MIN_DEPOSIT: 10_000_000         # 10 USDT (higher than user deposits)
  MIN_WITHDRAWAL: 100_000         # 0.1 USDT
  MIN_OPERATING_BALANCE: 100_000_000  # 100 USDT to operate games
  LP_WITHDRAWAL_FEE_BPS: 100      # 1% fee on LP withdrawals
  PARENT_STAKER_CANISTER: "e454q-riaaa-aaaap-qqcyq-cai"
```

### Storage

```yaml
thread_local_storage:
  LP_SHARES:
    type: StableBTreeMap<Principal, StorableNat>
    purpose: "Track LP shares per user"

  POOL_STATE:
    type: StableCell<PoolState>
    fields:
      reserve: Nat      # Total ckUSDT backing all games
      initialized: bool
```

### Share Calculation Math

```yaml
calculate_shares(deposit_amount):
  total_shares: sum(all LP shares)
  current_reserve: pool.reserve

  if total_shares == 0:
    # Initial deposit (first LP)
    initial_shares: deposit_amount
    burned_shares: MINIMUM_LIQUIDITY (1000 shares)
    user_receives: initial_shares - burned_shares

    why_burn: "Prevents share price manipulation attacks"

  else:
    # Standard deposit
    shares: (deposit_amount * total_shares) / current_reserve

    example:
      reserve: 1000 USDT
      total_shares: 1000
      deposit: 100 USDT
      shares: (100 * 1000) / 1000 = 100 shares
```

### LP Deposit Flow

```yaml
deposit_liquidity(amount: u64, min_shares_expected: Option<Nat>):
  validation:
    - if amount < 10 USDT: ERROR
    - if caller == anonymous: ERROR
    - if pending_withdrawal_exists(caller): ERROR

  pre_flight_check:
    projected_shares: calculate_shares(amount)
    if projected_shares == 0: ERROR "deposit too small"
    if min_shares_expected > 0: validate_provided

  icrc2_transfer_from(caller, amount):
    why_icrc2: "LP approves canister to pull funds"

  post_transfer_slippage_check:
    actual_shares: calculate_shares(amount)  # State may have changed during await

    if actual_shares < min_shares_expected:
      # CRITICAL: Transfer already happened, must refund
      credit_balance(caller, amount)  # Credit to betting balance
      log_audit(SlippageProtectionTriggered)
      return ERROR "Slippage exceeded. Funds credited to betting balance."

  on_success:
    if first_deposit:
      insert(anonymous, MINIMUM_LIQUIDITY)  # Burn shares

    user_shares: get_shares(caller) + actual_shares
    insert(caller, user_shares)

    pool.reserve += amount
    return actual_shares
```

### LP Withdrawal Flow

```yaml
withdraw_all_liquidity():
  caller: msg_caller()
  shares: get_shares(caller)

  validation:
    - if caller == anonymous: ERROR "cannot withdraw burned shares"
    - if shares == 0: ERROR

  calculate_payout:
    total_shares: sum(all shares)
    payout: (shares * pool.reserve) / total_shares

    if payout < MIN_WITHDRAWAL: ERROR

  fee_calculation:
    fee: payout * 1%
    lp_amount: payout - fee

  atomic_state_update:
    step1: remove_user_shares(caller)
    step2: deduct_full_payout_from_reserve(payout)
    step3: schedule_lp_withdrawal(caller, shares, payout, lp_amount)

  fire_and_forget_accounting:
    step1_critical: attempt_transfer(caller, lp_amount)
      on_fail: rollback_everything()

    step2_best_effort: credit_parent_fee(parent, fee)
      on_fail: return_fee_to_pool()  # Keeps pool solvent

    why_pattern: "Reserve <= Balance always maintained"
```

### Game Integration

```yaml
settle_bet(bet_amount: u64, payout_amount: u64):
  purpose: "Primary API for games to settle bets"

  if payout_amount > bet_amount:
    # Player won
    profit: payout_amount - bet_amount

    solvency_check:
      if profit > pool.reserve: ERROR "POOL_INSOLVENT"

    pool.reserve -= profit

  elif payout_amount < bet_amount:
    # Player lost (partial or total)
    pool_gain: bet_amount - payout_amount
    pool.reserve += pool_gain

  else:
    # Push (payout == bet)
    # No pool change

  examples:
    settle_bet(100, 0):     # Total loss: pool +100
    settle_bet(100, 20):    # 0.2x payout: pool +80
    settle_bet(100, 100):   # Push: pool +0
    settle_bet(100, 200):   # 2x win: pool -100
```

---

## 📊 Part 5: Statistics Tracking (statistics/)

### Purpose

```yaml
statistics_module:
  purpose: "Track daily volume, profit, APY for transparency"
  isolation: "Completely separate from critical defi logic"
  storage: "Unlimited historical retention using StableVec"
```

### Data Structures

```yaml
DailySnapshot:
  purpose: "Permanent daily record"
  fields:
    day_timestamp: u64        # Midnight of that day
    pool_reserve_end: u64     # Pool size at day end
    daily_pool_profit: i64    # Can be negative if house lost
    daily_volume: u64         # Total wagered
    share_price: u64          # LP share value

DailyAccumulator:
  purpose: "Current day's running totals (reset at midnight)"
  fields:
    day_start: u64            # Current day's midnight
    volume_accumulated: u64   # Running bet total
    last_pool_reserve: u64    # Pool size at day start
```

### Snapshot Flow

```yaml
record_bet_volume(amount: u64):
  called_by: "Game logic after each bet"

  current_day: get_day_start(now)
  accumulator: get_accumulator()

  if accumulator.day_start != current_day AND accumulator.day_start > 0:
    # New day detected - snapshot yesterday
    take_snapshot(accumulator):
      current_reserve: get_pool_reserve()
      daily_profit: current_reserve - accumulator.last_pool_reserve

      snapshot:
        day: accumulator.day_start
        reserve_end: current_reserve
        profit: daily_profit
        volume: accumulator.volume_accumulated
        share_price: get_share_price()

      append_to_history(snapshot)
      return current_reserve

    # Reset for new day
    accumulator:
      day_start: current_day
      volume_accumulated: 0
      last_pool_reserve: snapshot.reserve_end

  # Accumulate today's bet
  accumulator.volume_accumulated += amount

backup_timer:
  interval: "24 hours"
  purpose: "Snapshot even on days with no bets"
  action: take_daily_snapshot()
```

### APY Calculations

```yaml
get_apy_info(days: Option<u32>):
  days: clamp(days.unwrap_or(7), 1, 365)

  snapshots: get_last_N_snapshots(days)

  if snapshots.empty:
    return default (0% APY)

  aggregate_data:
    total_profit: sum(snapshot.daily_pool_profit for each day)
    total_volume: sum(snapshot.daily_volume for each day)

  starting_reserve: snapshots[0].pool_reserve_end - snapshots[0].daily_pool_profit

  actual_apy:
    formula: (total_profit / starting_reserve) * (365 / days) * 100
    note: "Can be negative if house lost money"

  expected_apy:
    expected_profit: total_volume * 0.01  # Theoretical 1% house edge
    formula: (expected_profit / starting_reserve) * (365 / days) * 100

  return:
    actual_apy_percent: actual_apy
    expected_apy_percent: expected_apy
    days_calculated: days
    total_volume: total_volume
    total_profit: total_profit
```

---

## 🔍 Part 6: Query Functions (query.rs)

```yaml
public_queries:
  user_balance:
    get_balance(user): USER_BALANCES.get(user)
    get_my_balance(): get_balance(caller)

  pool_info:
    get_house_balance(): POOL_STATE.reserve
    get_max_allowed_payout(): pool.reserve * 10%

  lp_position:
    get_lp_position(user):
      shares: LP_SHARES.get(user)
      total_shares: sum(all shares)
      ownership_pct: (shares / total_shares) * 100
      redeemable: (shares * pool.reserve) / total_shares

  statistics:
    get_pool_stats():
      total_shares: sum(all shares)
      pool_reserve: POOL_STATE.reserve
      share_price: pool.reserve / total_shares
      total_lps: count(non-zero shares)

    get_accounting_stats():
      total_deposits: sum(USER_BALANCES)
      house_balance: pool.reserve
      canister_balance: cached_ledger_balance
      unique_depositors: count(USER_BALANCES)

  audit:
    get_audit_log(offset, limit): AUDIT_LOG_MAP[offset..offset+limit]
    get_withdrawal_status(): PENDING_WITHDRAWALS.get(caller)
```

---

## 🔐 Security Principles

### 1. Double-Spend Prevention

```yaml
withdrawal_safety:
  problem: "Transfer might succeed but connection lost"

  unsafe_approach:
    - Auto-rollback after timeout
    - Risk: User gets balance + withdrawal = 2x payout

  safe_approach:
    - Never auto-rollback UncertainError
    - User must manually abandon (without balance restore)
    - "Accept user might lose over house definitely loses twice"
```

### 2. Atomicity Guarantees

```yaml
state_transition_safety:
  deposit_liquidity:
    - Calculate shares BEFORE transfer (pre-flight check)
    - Transfer funds
    - Calculate shares AGAIN (state may have changed)
    - If slippage: refund to betting balance (transfer already happened)

  withdrawal:
    - Create pending FIRST (if fails, balance untouched)
    - Zero balance AFTER pending created
    - Attempt transfer with dedup key
```

### 3. Solvency Invariants

```yaml
invariants:
  reserve_vs_balance:
    - "pool.reserve + user_balances == canister_balance"
    - Verified by: audit_balances()

  lp_withdrawal_fees:
    step1: "Deduct FULL payout from reserve (LP amount + fee)"
    step2: "Transfer LP amount (critical - rollback on fail)"
    step3: "Credit fee to parent (best-effort - return to pool on fail)"

    why: "Reserve <= Balance always maintained"
```

### 4. Slippage Protection

```yaml
lp_deposit_slippage:
  pre_flight:
    - Calculate projected shares
    - Reject if 0 shares

  post_transfer:
    - Recalculate shares (state may have changed during await)
    - If actual < expected: refund to betting balance

  why_refund_not_reject:
    - Transfer already executed
    - Cannot reject (funds already moved)
    - Refund prevents user loss
```

---

## 🎮 Game Integration Guide

### What Games Must Do

```yaml
game_lifecycle:
  initialization:
    - start_stats_timer()        # Enable daily snapshots
    - start_parent_withdrawal_timer()  # Auto-collect fees

  before_accepting_bet:
    max_payout: get_max_allowed_payout()  # 10% of pool
    if potential_payout > max_payout: REJECT

  after_bet_settled:
    record_bet_volume(bet_amount)         # Statistics
    settle_bet(bet_amount, payout_amount) # Pool accounting
    update_balance(player, new_balance)   # Player balance

example_game_flow:
  user_places_bet:
    bet: 100 USDT
    max_allowed: get_max_allowed_payout()  # e.g., 1000 USDT

    if bet > user_balance: ERROR
    if potential_payout > max_allowed: ERROR

    # Deduct bet from balance
    new_balance: user_balance - bet
    update_balance(player, new_balance)

  game_resolves:
    result: determine_outcome()  # Game logic
    payout: calculate_payout(bet, result)

    # Settle with pool
    settle_bet(bet, payout)  # Automatically adjusts pool

    # Credit player
    if payout > 0:
      new_balance: user_balance + payout
      update_balance(player, new_balance)

    # Track stats
    record_bet_volume(bet)
```

---

## 📋 Common Patterns & Pitfalls

### ✅ DO

```yaml
correct_patterns:
  concurrent_state_changes:
    - Always recalculate after await points
    - Use slippage protection for LP deposits
    - Use deduplication for withdrawals

  error_handling:
    - Distinguish DefiniteError vs UncertainError
    - Only rollback on DefiniteError (and only on first attempt)
    - Let user decide on UncertainError

  state_updates:
    - Update critical state BEFORE transfers
    - Use IC's automatic rollback on trap
```

### ❌ DON'T

```yaml
anti_patterns:
  dont_auto_rollback:
    - Never rollback UncertainError
    - Never rollback TooOld error
    - "Might have succeeded" means KEEP PENDING

  dont_skip_checks:
    - Always check pending_withdrawal before deposit
    - Always check pool solvency before payout
    - Always validate min_shares > 0

  dont_ignore_fees:
    - Always charge fee to sender (prevent protocol loss)
    - Handle LP fee failure gracefully (return to pool)
```

---

## 🔄 Upgrade Safety

```yaml
stable_memory_persistence:
  what_survives_upgrades:
    - USER_BALANCES_STABLE
    - LP_SHARES
    - POOL_STATE
    - PENDING_WITHDRAWALS
    - AUDIT_LOG_MAP
    - DAILY_SNAPSHOTS

  what_resets:
    - CACHED_CANISTER_BALANCE (must call refresh after upgrade)
    - Timers (must restart via start_stats_timer, start_parent_withdrawal_timer)

  migration_checklist:
    - Verify memory IDs unchanged
    - Test Storable implementations
    - Check type compatibility (no field removal)
    - Test rollback on pre_upgrade failure
```

---

## 🎯 Summary: The Big Picture

```yaml
defi_accounting_in_3_principles:
  1_user_custody:
    - Players deposit ckUSDT via ICRC-2
    - Balances tracked in stable storage
    - Withdrawals atomic (pending state prevents double-spend)

  2_house_bankroll:
    - LPs stake ckUSDT for shares (AMM-style pool)
    - Pool backs all games (10% max payout per bet)
    - Share price = pool_reserve / total_shares

  3_transparency:
    - Daily snapshots (volume, profit, APY)
    - Audit log (all financial events)
    - Provably fair accounting (on-chain verification)

safety_philosophy:
  - "Prefer user loss over house loss" (double-spend prevention)
  - "Solvency above all" (reserve <= balance always)
  - "Transparency by default" (audit everything)
```

---

**End of Architecture Guide**

> This pseudocode represents the complete DeFi accounting module as of the current codebase state.
> For implementation details, refer to the source files in `plinko_backend/src/defi_accounting/`.
