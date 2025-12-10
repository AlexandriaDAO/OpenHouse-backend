# Dice Backend

Provably fair Dice game running on the Internet Computer.

**Canister ID**: `whchi-hyaaa-aaaao-a4ruq-cai`
**Module Hash**: `25c41b51cd48b98c73972138b34bfc3ac8a3699db734d6c4143eca5a06730721`

## Game Mechanics

| Property | Value |
|----------|-------|
| Roll Range | 0-100 |
| Min Bet | 0.01 USDT |
| Max Win | 100 USDT |
| House Edge | 1% |
| Win Chance | 1% to 98% (adjustable) |
| Randomness | IC VRF (raw_rand) |

## Verify the Code Matches Deployment

You can verify that this open-source code matches exactly what's deployed on mainnet.

### Step 1: Get Deployed Module Hash

```bash
dfx canister --network ic info whchi-hyaaa-aaaao-a4ruq-cai
```

Look for the `Module hash:` line in the output. It should match:
```
0x25c41b51cd48b98c73972138b34bfc3ac8a3699db734d6c4143eca5a06730721
```

### Step 2: Build from Source

Prerequisites:
- Rust 1.91.1 (`rustup install 1.91.1 && rustup default 1.91.1`)
- wasm32 target (`rustup target add wasm32-unknown-unknown`)

```bash
git clone https://github.com/AlexandriaDAO/alexandria.git
cd alexandria/openhouse
cargo build --release --target wasm32-unknown-unknown --package dice_backend
```

### Step 3: Compute Local Hash

```bash
sha256sum target/wasm32-unknown-unknown/release/dice_backend.wasm
```

### Step 4: Compare

The SHA-256 hash from Step 3 should match the deployed module hash (without the `0x` prefix):
```
25c41b51cd48b98c73972138b34bfc3ac8a3699db734d6c4143eca5a06730721
```

### Build Requirements for Exact Match

- **Rust version**: 1.91.1 (exact version required for reproducible builds)
- **Cargo.lock**: Committed to repo, ensures identical dependency versions
- **Workspace settings** (in root Cargo.toml):
  - `codegen-units = 1` (deterministic compilation)
  - `lto = true` (link-time optimization)
  - `opt-level = 3`

## Test Suite

Run the comprehensive test suite locally:

```bash
cargo test --package dice_backend
```
