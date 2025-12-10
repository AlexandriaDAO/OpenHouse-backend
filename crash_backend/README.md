# Crash Backend

Provably fair Crash game running on the Internet Computer.

**Canister ID**: `fws6k-tyaaa-aaaap-qqc7q-cai`
**Module Hash**: `1c6b9aceeafeaaa3038d3c66e6d956861a2d1649620665bafcacd0f0a1d5773b`

## Game Mechanics

| Property | Value |
|----------|-------|
| Min Bet | 1 USDT |
| Max Win | 1000x |
| House Edge | 1% |
| Randomness | IC VRF (raw_rand) |

## Verify the Code Matches Deployment

You can verify that this open-source code matches exactly what's deployed on mainnet.

### Step 1: Get Deployed Module Hash

```bash
dfx canister --network ic info fws6k-tyaaa-aaaap-qqc7q-cai
```

Look for the `Module hash:` line in the output. It should match:
```
0x1c6b9aceeafeaaa3038d3c66e6d956861a2d1649620665bafcacd0f0a1d5773b
```

### Step 2: Build from Source

Prerequisites:
- Rust 1.91.1 (`rustup install 1.91.1 && rustup default 1.91.1`)
- wasm32 target (`rustup target add wasm32-unknown-unknown`)

```bash
git clone https://github.com/AlexandriaDAO/alexandria.git
cd alexandria/openhouse
cargo build --release --target wasm32-unknown-unknown --package crash_backend
```

### Step 3: Compute Local Hash

```bash
sha256sum target/wasm32-unknown-unknown/release/crash_backend.wasm
```

### Step 4: Compare

The SHA-256 hash from Step 3 should match the deployed module hash (without the `0x` prefix):
```
1c6b9aceeafeaaa3038d3c66e6d956861a2d1649620665bafcacd0f0a1d5773b
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
cargo test --package crash_backend
```
