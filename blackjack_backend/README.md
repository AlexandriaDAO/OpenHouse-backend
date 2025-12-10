# Blackjack Backend

Provably fair Blackjack game running on the Internet Computer.

**Canister ID**: `wvrcw-3aaaa-aaaah-arm4a-cai`
**Module Hash**: `11829c7099b7a29e255179fcb37faded45d4e7318252c8d948a9d1f665f8d6b5`

## Game Mechanics

| Property | Value |
|----------|-------|
| Min Bet | 0.01 USDT |
| Max Win | 10 USDT |
| House Edge | ~1% |
| Randomness | IC VRF (raw_rand) |
| Actions | Hit, Stand, Double Down, Split |

## Verify the Code Matches Deployment

You can verify that this open-source code matches exactly what's deployed on mainnet.

### Step 1: Get Deployed Module Hash

```bash
dfx canister --network ic info wvrcw-3aaaa-aaaah-arm4a-cai
```

Look for the `Module hash:` line in the output. It should match:
```
0x11829c7099b7a29e255179fcb37faded45d4e7318252c8d948a9d1f665f8d6b5
```

### Step 2: Build from Source

Prerequisites:
- Rust 1.91.1 (`rustup install 1.91.1 && rustup default 1.91.1`)
- wasm32 target (`rustup target add wasm32-unknown-unknown`)

```bash
git clone https://github.com/AlexandriaDAO/alexandria.git
cd alexandria/openhouse
cargo build --release --target wasm32-unknown-unknown --package blackjack_backend
```

### Step 3: Compute Local Hash

```bash
sha256sum target/wasm32-unknown-unknown/release/blackjack_backend.wasm
```

### Step 4: Compare

The SHA-256 hash from Step 3 should match the deployed module hash (without the `0x` prefix):
```
11829c7099b7a29e255179fcb37faded45d4e7318252c8d948a9d1f665f8d6b5
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
cargo test --package blackjack_backend
```
