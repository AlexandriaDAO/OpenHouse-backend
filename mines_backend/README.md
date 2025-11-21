# Plinko V2 (Motoko Implementation)

**Status**: Active - Experimental Motoko implementation for comparison

This canister implements **Pure Mathematical Plinko** in Motoko as an alternative to the Rust implementation. Both versions use identical game logic to enable objective comparison of language performance and developer experience.

## Comparison Experiment

- **Rust Version**: `weupr-2qaaa-aaaap-abl3q-cai` (plinko_backend)
- **Motoko Version**: `wvrcw-3aaaa-aaaah-arm4a-cai` (mines_backend/Plinko V2)

### Identical Features
- Same mathematical formula
- Same house edge (1%)
- Same API endpoints
- Same frontend experience

### What We're Measuring
1. Cycle consumption per game
2. Response latency
3. WASM bundle size
4. Code maintainability
5. Development velocity

## Game Rules

**Fixed Configuration**: 8 rows, formula-based multipliers

**Mathematical Formula**:
```
M(k) = 0.2 + 6.32 × ((k - 4) / 4)²
```

Where k is the final position (0-8).

**Expected Values**:
```
Position:    0     1     2     3     4     5     6     7     8
Multiplier: 6.52  3.76  1.78  0.60  0.20  0.60  1.78  3.76  6.52
Win/Loss:   WIN   WIN   WIN   LOSS  LOSS  LOSS  WIN   WIN   WIN
Expected Value: 0.99 (1% house edge)
```

## API

All endpoints match the Rust implementation:

- `drop_ball()` - Drop single ball
- `drop_balls(1-10)` - Drop multiple balls
- `get_multipliers()` - Get all multipliers
- `get_expected_value()` - Returns 0.99
- `get_formula()` - Get formula string
- `greet(text)` - Test function

## Development

```bash
# Build
dfx build mines_backend --network ic

# Deploy
dfx deploy mines_backend --network ic

# Test
dfx canister --network ic call mines_backend get_expected_value
dfx canister --network ic call mines_backend get_multipliers
dfx canister --network ic call mines_backend drop_balls '(1 : nat8)'
```

## Frontend

Accessible at: `/plinko-motoko`
Original Rust version at: `/plinko`

## Implementation Details

### Language Features Used
- **Random.blob()**: IC VRF for verifiable randomness
- **Result.Result<T, E>**: Error handling pattern
- **Float**: 64-bit IEEE 754 arithmetic
- **Array.tabulate**: Functional array generation
- **Actor model**: Natural async/await

### Stateless Design
This canister is completely stateless, making upgrades simple and predictable. All game results are determined by pure mathematical functions and VRF randomness.

## Performance Comparison

After deployment, we will gather these metrics:
- Cycle consumption per game
- WASM bundle size
- Response latency
- Developer experience feedback

## Next Steps

After this PR is merged, we can gather real-world performance data and make an informed decision about which language to use for future game backends.
