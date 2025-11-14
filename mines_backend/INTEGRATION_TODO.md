# Mines Backend - Integration Requirements

## ⚠️ CRITICAL: ICP Ledger Integration Required

**Current Status:** The mines backend calculates bets and payouts but **does not transfer actual ICP tokens**.

### What's Missing

This backend currently:
- ✅ Validates bet amounts (1-100 ICP)
- ✅ Calculates multipliers and payouts
- ✅ Tracks game statistics
- ❌ **Does NOT accept ICP deposits from players**
- ❌ **Does NOT send ICP payouts to winners**

### Required Implementation

Before production deployment, you MUST integrate with the ICP Ledger canister:

#### 1. Player Deposits
```rust
// When starting a game, transfer ICP from player to canister
use ic_ledger_types::{transfer, TransferArgs, Tokens, AccountIdentifier};

async fn start_game(bet_amount: u64, num_mines: u8) -> Result<u64, String> {
    // Validate bet amount...

    // Transfer ICP from player to this canister
    let transfer_args = TransferArgs {
        memo: Memo(0),
        amount: Tokens::from_e8s(bet_amount),
        fee: Tokens::from_e8s(10_000), // 0.0001 ICP fee
        from_subaccount: None,
        to: AccountIdentifier::new(&ic_cdk::id(), &DEFAULT_SUBACCOUNT),
        created_at_time: None,
    };

    let block_height = transfer(LEDGER_CANISTER_ID, transfer_args)
        .await
        .map_err(|e| format!("Transfer failed: {:?}", e))?
        .map_err(|e| format!("Transfer error: {:?}", e))?;

    // Store block_height for audit trail

    // Continue with game creation...
}
```

#### 2. Winner Payouts
```rust
// When cashing out or winning, transfer ICP back to player
async fn cash_out(game_id: u64) -> Result<u64, String> {
    // Calculate payout...

    let transfer_args = TransferArgs {
        memo: Memo(game_id),
        amount: Tokens::from_e8s(payout),
        fee: Tokens::from_e8s(10_000),
        from_subaccount: Some(DEFAULT_SUBACCOUNT),
        to: AccountIdentifier::new(&game.player, &DEFAULT_SUBACCOUNT),
        created_at_time: None,
    };

    let block_height = transfer(LEDGER_CANISTER_ID, transfer_args)
        .await
        .map_err(|e| format!("Payout failed: {:?}", e))?
        .map_err(|e| format!("Payout error: {:?}", e))?;

    // Update stats after successful payout
    Ok(payout)
}
```

#### 3. Required Dependencies

Add to `Cargo.toml`:
```toml
[dependencies]
ic-ledger-types = "0.9"
```

Add to `dfx.json`:
```json
{
  "canisters": {
    "mines_backend": {
      "dependencies": ["ledger"]
    }
  }
}
```

#### 4. Treasury Management

Implement:
- Circuit breaker for large unexpected losses
- Maximum payout limits per game
- Reserve funds to ensure canister can always pay winners
- Admin functions to withdraw house profit

### Security Considerations

1. **Verify Deposits**: Always confirm ICP transfer succeeded before creating game
2. **Atomic Payouts**: Ensure payout transfer succeeds before marking game complete
3. **Balance Checks**: Verify canister has sufficient ICP before allowing new games
4. **Audit Trail**: Store all transfer block heights for reconciliation

### Testing on Mainnet

Since this project deploys directly to mainnet:

1. Start with **small bet limits** (e.g., 0.1 ICP min, 1 ICP max)
2. Test full flow: deposit → play → payout
3. Monitor canister ICP balance closely
4. Gradually increase limits after confirming stability

### Resources

- [ICP Ledger Integration Guide](https://internetcomputer.org/docs/current/developer-docs/integrations/ledger/)
- [Ledger Canister Interface](https://github.com/dfinity/ic/tree/master/rs/rosetta-api/icrc1/ledger)
- [Transfer Best Practices](https://internetcomputer.org/docs/current/developer-docs/integrations/ledger/ledger-local-setup)

---

**DO NOT deploy to production without implementing ICP ledger integration.**
