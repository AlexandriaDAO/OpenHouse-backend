# Plinko Backend

Provably fair Plinko game running on the Internet Computer.

**Canister ID**: `weupr-2qaaa-aaaap-abl3q-cai`
**Module Hash**: `9a55f67401ca119308a02fc0fd8ce0e26e005ccb99f4cea420fc9d00326a66b0`

## Game Mechanics

| Property | Value |
|----------|-------|
| Formula | M(k) = 0.2 + 6.32 × ((k - 4) / 4)² |
| House Edge | 1% |
| Expected Value | 0.99 |
| Randomness | IC VRF (raw_rand) |

## Verify the Code Matches Deployment

You can verify that this open-source code matches exactly what's deployed on mainnet.

### Step 1: Get Deployed Module Hash

```bash
dfx canister --network ic info weupr-2qaaa-aaaap-abl3q-cai
```

Look for the `Module hash:` line in the output. It should match:
```
0x9a55f67401ca119308a02fc0fd8ce0e26e005ccb99f4cea420fc9d00326a66b0
```

### Step 2: Build from Source

Prerequisites:
- Rust 1.91.1 (`rustup install 1.91.1 && rustup default 1.91.1`)
- wasm32 target (`rustup target add wasm32-unknown-unknown`)

```bash
git clone https://github.com/AlexandriaDAO/alexandria.git
cd alexandria/openhouse
cargo build --release --target wasm32-unknown-unknown --package plinko_backend
```

### Step 3: Compute Local Hash

```bash
sha256sum target/wasm32-unknown-unknown/release/plinko_backend.wasm
```

### Step 4: Compare

The SHA-256 hash from Step 3 should match the deployed module hash (without the `0x` prefix):
```
9a55f67401ca119308a02fc0fd8ce0e26e005ccb99f4cea420fc9d00326a66b0
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
cargo test --package plinko_backend
```

Tests include Monte Carlo simulations verifying the 1% house edge across millions of games.
