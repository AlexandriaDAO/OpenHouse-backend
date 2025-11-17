Questions while reading: 
- During deposits withdraws, do we account for the transfer fee, and is it taken from the user's own deposit/withdraw so as not to deplete from the house amounts?
- How much is stored in the last_balance_refresh and the cached_canister_balance, or is it just one value (the latest value and no historical values)?
- Is there a better design for tracking max betting amounts than caching? My concern is that someone could drain the house and the balances won't update and they could keep betting and the house will default. Is this possible?



# Dice Backend Accounting System - Logic Flow

## 📊 Overview
A smart caching accounting system that manages user deposits/withdrawals and tracks house balance efficiently.

---

## 🔧 Constants
```yaml
ICP_TRANSFER_FEE: 10_000  # 0.0001 ICP in e8s
MIN_DEPOSIT: 10_000_000   # 0.1 ICP minimum
MIN_WITHDRAW: 10_000_000  # 0.1 ICP minimum
LEDGER_CANISTER: "ryjl3-tyaaa-aaaaa-aaaba-cai"
```

---

## 💾 State Management

### Storage (Stable - Persists across upgrades)
```yaml
USER_BALANCES_STABLE:
  type: StableBTreeMap<Principal, u64>
  memory_id: 10
  purpose: "Track each user's deposited balance"

CACHED_CANISTER_BALANCE:
  type: u64
  purpose: "Cache of total ICP in canister (avoids expensive ledger calls)"
  updated_on:
    - deposit completion
    - withdrawal completion
    - manual refresh

LAST_BALANCE_REFRESH:
  type: u64 (nanoseconds timestamp)
  purpose: "Track when cache was last updated"
  default: 0 (never refreshed)
```

---

## 🔄 Cache Management Functions

### refresh_canister_balance()
```yaml
purpose: "Update cached balance from ICP ledger"
type: async update call
flow:
  - create_account_object:
      owner: canister_id
      subaccount: None

  - call_ledger:
      method: "icrc1_balance_of"
      canister: "ryjl3-tyaaa-aaaaa-aaaba-cai"
      params: account

  - on_success:
      - convert_nat_to_u64: balance
      - update_cache: CACHED_CANISTER_BALANCE = balance
      - update_timestamp: LAST_BALANCE_REFRESH = current_time
      - return: balance_u64

  - on_failure:
      - log_error: "Failed to refresh canister balance"
      - return: 0
```

### is_balance_cache_stale(max_age_nanos)
```yaml
purpose: "Check if cached balance is too old"
inputs:
  max_age_nanos: u64

logic:
  - get_last_refresh: LAST_BALANCE_REFRESH
  - get_current_time: ic_cdk::api::time()

  - if last_refresh == 0:
      return: true  # Never refreshed

  - calculate_age: current_time - last_refresh  # uses saturating_sub (prevents overflow)

  - if age > max_age_nanos:
      return: true  # Stale
  - else:
      return: false  # Fresh
```

### get_balance_cache_age()
```yaml
purpose: "Get age of cached balance in nanoseconds"
returns: u64
logic:
  - get_last_refresh: LAST_BALANCE_REFRESH

  - if last_refresh == 0:
      return: u64::MAX  # Never refreshed
  - else:
      return: current_time - last_refresh  # uses saturating_sub
```

---

## 📥 Deposit Flow

### deposit(amount)
```yaml
type: async update call
inputs:
  amount: u64  # Amount user wants to deposit in e8s
  caller: Principal  # Auto-extracted from ic_cdk::caller()

flow:
  step_1_validation:
    - if amount < MIN_DEPOSIT:
        return_error: "Minimum deposit is 0.1 ICP"

  step_2_transfer_from_user:
    - create_transfer_args:
        from_subaccount: None  # User's default account
        to:
          owner: canister_id
          subaccount: None
        amount: amount
        fee: ICP_TRANSFER_FEE
        memo: None
        created_at_time: None

    - call_ledger:
        method: "icrc1_transfer"
        canister: LEDGER_CANISTER
        params: transfer_args

  step_3_credit_user:
    on_transfer_success:
      - get_current_balance: USER_BALANCES_STABLE[caller] or 0
      - calculate_new_balance: current + amount
      - update_storage: USER_BALANCES_STABLE[caller] = new_balance
      - refresh_canister_balance: await  # Update cache
      - log_success: "Deposit successful"
      - return: new_balance

    on_transfer_failure:
      - return_error: "Transfer failed: {error_details}"

note: |
  In ICRC-1:
  - User pays: amount + fee
  - Canister receives: amount (ledger deducts fee)
  - User is credited: amount (the full amount canister received)
```

---

## 📤 Withdrawal Flow

### withdraw(amount)
```yaml
type: async update call
inputs:
  amount: u64  # Amount user wants to withdraw
  caller: Principal

flow:
  step_1_validation:
    - if amount < MIN_WITHDRAW:
        return_error: "Minimum withdrawal is 0.1 ICP"

  step_2_balance_check:
    - get_user_balance: USER_BALANCES_STABLE[caller]
    - if user_balance < amount:
        return_error: "Insufficient balance. You have {balance}, trying to withdraw {amount}"

  step_3_debit_first:
    purpose: "PREVENT RE-ENTRANCY ATTACKS"
    - calculate_new_balance: user_balance - amount
    - update_storage: USER_BALANCES_STABLE[caller] = new_balance
    note: "Debit BEFORE transfer to prevent re-entrancy"

  step_4_transfer_to_user:
    - create_transfer_args:
        from_subaccount: None  # Canister's default
        to:
          owner: caller
          subaccount: None
        amount: amount - ICP_TRANSFER_FEE  # User receives less fee
        fee: ICP_TRANSFER_FEE

    - call_ledger:
        method: "icrc1_transfer"
        params: transfer_args

  step_5_handle_result:
    on_success:
      - refresh_canister_balance: await  # Update cache
      - log_success: "Withdrawal successful"
      - return: new_balance

    on_failure:
      rollback:
        - restore_balance: USER_BALANCES_STABLE[caller] = user_balance
        - return_error: "Transfer failed: {error_details}"

note: |
  User receives: amount - ICP_TRANSFER_FEE
  User's internal balance is debited: amount (full amount)
  This is correct because the fee is paid from their balance
```

### withdraw_all()
```yaml
type: async update call
purpose: "Convenience function to withdraw entire balance"

flow:
  - get_user_balance: USER_BALANCES_STABLE[caller]

  - if user_balance == 0:
      return_error: "No balance to withdraw"

  - if user_balance < MIN_WITHDRAW:
      return_error: "Balance {balance} is below minimum withdrawal"

  - delegate_to_withdraw: withdraw(user_balance).await
```

---

## 🔍 Query Functions (Read-Only, Fast)

### get_balance(user)
```yaml
type: query
inputs:
  user: Principal
returns: u64
logic:
  - lookup: USER_BALANCES_STABLE[user]
  - if exists:
      return: balance
  - else:
      return: 0
```

### get_my_balance()
```yaml
type: query
returns: u64
logic:
  - get_caller: ic_cdk::caller()
  - delegate: get_balance(caller)
```

### calculate_total_deposits() [Helper]
```yaml
type: internal helper function
purpose: "Calculate sum of all user balances on-demand"
returns: u64
logic:
  - iterate: USER_BALANCES_STABLE.iter()
  - sum_all_balances: balances.sum()
  - return: total

note: |
  Called fresh every time to prevent drift
  This is the source of truth for total user deposits
```

### get_house_balance()
```yaml
type: query
purpose: "Calculate house profit/loss"
returns: u64

formula:
  house_balance = canister_balance - total_user_deposits

logic:
  - get_cached_balance: CACHED_CANISTER_BALANCE
  - calculate_deposits: calculate_total_deposits()  # Fresh, not cached

  - if canister_balance > total_deposits:
      return: canister_balance - total_deposits
  - else:
      return: 0  # Should never happen unless exploited

note: |
  House balance represents:
  - Winnings from games (house edge accumulation)
  - Losses to players (payouts that exceeded bets)

  Uses cached canister balance (fast) but fresh deposits calculation (accurate)
```

### get_accounting_stats()
```yaml
type: query
returns: AccountingStats

structure:
  total_user_deposits: u64
  house_balance: u64
  canister_balance: u64
  unique_depositors: u64

logic:
  - calculate_deposits: calculate_total_deposits()  # Fresh
  - count_depositors: USER_BALANCES_STABLE.iter().count()
  - get_cached_balance: CACHED_CANISTER_BALANCE
  - calculate_house: max(0, canister_balance - total_deposits)

  - return_stats:
      total_user_deposits: total_deposits
      house_balance: house_balance
      canister_balance: canister_balance
      unique_depositors: count
```

---

## 🔒 Audit & Security

### audit_balances()
```yaml
type: query
purpose: "Verify accounting integrity"
returns: Result<String, String>

verification_formula:
  house_balance + sum(user_balances) = canister_balance

logic:
  - get_cached_balance: CACHED_CANISTER_BALANCE
  - calculate_deposits: calculate_total_deposits()
  - calculate_house: max(0, canister_balance - total_deposits)

  - calculate_total: house_balance + total_deposits

  - if calculated_total == canister_balance:
      return_success: "✅ Audit passed: house + deposits = canister"
  - else:
      return_failure: "❌ Audit FAILED: mismatch detected"

note: |
  This should always pass unless:
  - Cache is stale (call refresh_canister_balance first)
  - Accounting bug
  - External manipulation
```

### update_balance(user, new_balance) [Internal]
```yaml
type: internal function
purpose: "Allow game logic to update balances (wins/losses)"
inputs:
  user: Principal
  new_balance: u64

logic:
  - update_storage: USER_BALANCES_STABLE[user] = new_balance
  - return: Ok(())

security_note: |
  This is called by game logic when:
  - User places a bet (balance decreases)
  - User wins (balance increases)
  NOT directly callable by users
```

---

## 🔄 Upgrade Persistence

### pre_upgrade_accounting()
```yaml
purpose: "Called before canister upgrade"
actions:
  - none_needed: "StableBTreeMap persists automatically"
```

### post_upgrade_accounting()
```yaml
purpose: "Called after canister upgrade"
actions:
  - none_needed: "StableBTreeMap restores automatically"
  - note: "Totals calculated on-demand, cache will refresh on first use"
```

---

## 🎯 Key Design Decisions

### Smart Caching Strategy
```yaml
what_is_cached:
  - CACHED_CANISTER_BALANCE: "Total ICP in canister"
  - reason: "Ledger calls are expensive (inter-canister calls)"

what_is_NOT_cached:
  - total_user_deposits: "Calculated fresh every time"
  - reason: "Prevents drift, ensures accuracy, computation is cheap"

cache_invalidation:
  - on_deposit: "Refresh after successful deposit"
  - on_withdrawal: "Refresh after successful withdrawal"
  - manual: "refresh_canister_balance() can be called anytime"
  - staleness_check: "is_balance_cache_stale() helps determine when to refresh"
```

### Security Measures
```yaml
re_entrancy_prevention:
  - withdraw: "Debit user balance BEFORE calling ledger transfer"
  - reason: "Prevents user from calling withdraw again before first completes"

rollback_on_failure:
  - withdraw: "Restore original balance if transfer fails"
  - reason: "Maintain consistency, don't lose user funds"

minimum_amounts:
  - deposit: "Prevents spam with tiny transactions"
  - withdrawal: "Ensures fees don't exceed withdrawal amount"

validation:
  - deposit: "Check minimum amount"
  - withdrawal: "Check sufficient balance + minimum amount"
```

### Calculation Philosophy
```yaml
house_balance_calculation:
  formula: "canister_balance - total_user_deposits"

  components:
    canister_balance:
      source: CACHED_CANISTER_BALANCE
      updated: "After deposits/withdrawals"
      speed: "O(1) - instant"

    total_user_deposits:
      source: "calculate_total_deposits()"
      updated: "Calculated fresh every time"
      speed: "O(n) where n = number of users"
      accuracy: "Always 100% accurate"

  tradeoff:
    - cached_canister: "Fast but potentially stale"
    - fresh_deposits: "Accurate but requires iteration"
    - result: "Balanced approach - mostly fast, always accurate for deposits"
```

---

## 📊 Data Flow Summary

### User Deposits ICP
```yaml
1. User → Ledger Transfer:
   - User pays: amount + fee
   - Canister receives: amount

2. Update Internal State:
   - USER_BALANCES[user] += amount

3. Refresh Cache:
   - CACHED_CANISTER_BALANCE = ledger.icrc1_balance_of()

4. Result:
   - User has 'amount' credits in game
   - Can use for betting
```

### User Withdraws ICP
```yaml
1. Validate & Debit First:
   - Check: USER_BALANCES[user] >= amount
   - Debit: USER_BALANCES[user] -= amount

2. Canister → User Transfer:
   - User receives: amount - fee
   - Canister sends: amount

3. Refresh Cache:
   - CACHED_CANISTER_BALANCE = ledger.icrc1_balance_of()

4. On Failure:
   - Rollback: USER_BALANCES[user] = original_balance
```

### User Plays Game (Separate Module)
```yaml
1. Place Bet:
   - Debit: USER_BALANCES[user] -= bet_amount
   - Game logic uses update_balance()

2. Game Resolves:
   - Win: USER_BALANCES[user] += (bet_amount * payout_multiplier)
   - Loss: (already debited, nothing more)

3. House Balance Changes:
   - Win: house_balance decreases
   - Loss: house_balance increases

Note: Canister balance stays same during games
      Only changes during deposits/withdrawals
```

---

## 🎓 Mental Model

Think of the accounting system like a casino cage:

```yaml
physical_analogy:
  canister_balance: "Total cash in the casino vault"
  user_deposits: "Chips players have exchanged for cash"
  house_balance: "Casino's profit/loss (vault - chips)"

  deposit: "Player brings cash, gets chips"
  withdrawal: "Player returns chips, gets cash"
  game_play: "Chips move between players and house, but cash stays in vault"
```

### Why Cache Canister Balance?
```yaml
problem: "Calling ledger is like sending someone to the bank - slow and expensive"
solution: "Keep a cached value - like checking your written balance instead of calling bank"
refresh_triggers: "Update cache only when vault actually changes (deposits/withdrawals)"
tradeoff: "Cache might be slightly stale, but deposits are always accurate (calculated fresh)"
```

### Why Calculate Deposits Fresh?
```yaml
problem: "If we cached deposits, user balance updates during games could cause drift"
solution: "Recalculate from source of truth (USER_BALANCES_STABLE) every time"
cost: "O(n) iteration, but n is small and operation is fast"
benefit: "Deposits are ALWAYS accurate, prevents accounting bugs"
```

---

## ⚠️ Important Notes

1. **No Local Testing**: All changes deploy to mainnet immediately
2. **Stable Storage**: USER_BALANCES_STABLE survives canister upgrades
3. **Cache Invalidation**: Refresh canister balance after financial operations
4. **Source of Truth**: USER_BALANCES_STABLE is authoritative for deposits
5. **Re-entrancy Safe**: Balances debited before external calls
6. **Rollback Logic**: Failed transfers restore original state
7. **Smart Hybrid**: Cache canister balance (slow to fetch), calculate deposits fresh (fast to compute)
