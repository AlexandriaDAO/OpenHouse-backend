# DAOPad Build and Deployment Process - Complete Analysis

## Executive Summary

DAOPad has a **mainnet-only deployment strategy** with NO local testing environment. The deployment architecture enforces mainnet deployments through:

1. **Deployment script enforcement** - Uses `--network ic` as the canonical deployment path
2. **Pre-configured mainnet canister IDs** - All canisters have hardcoded mainnet IDs
3. **Three-canister architecture** - Backend, Admin, and Frontend canisters with strict separation of duties
4. **Critical declaration sync requirement** - Frontend must sync backend declarations for proper functionality

---

## 1. Build Scripts and Entry Points

### Primary Deployment Script
**Location**: `/home/theseus/alexandria/daopad/src/daopad/deploy.sh`

**Key Features**:
- Executable bash script (755 permissions)
- ~400 lines of well-documented deployment logic
- Usage: `./deploy.sh [--network ic] [--fresh] [--backend-only|--frontend-only] [--test]`

**Critical Design Points**:
```bash
# Line 13: Default network is LOCAL (but enforced to IC in practice)
NETWORK="local"

# Lines 25-26: Supports --network ic for mainnet
--network)
    NETWORK="$2"
    shift 2
```

**Mainnet Identity Management** (Lines 103-112):
```bash
else
    # For mainnet, use daopad identity (no password required for Claude)
    echo "Switching to daopad identity for mainnet deployment..."
    dfx identity use daopad
    IDENTITY=$(dfx identity whoami)
    echo "Using identity: $IDENTITY"
    echo ""
    
    # Set environment variable to suppress the plaintext identity warning if using daopad
    export DFX_WARNING=-mainnet_plaintext_identity
fi
```

**Key Insight**: The script automatically switches to the `daopad` identity for mainnet deployments. This identity has no password requirement (designed for CI/CD and Claude automation).

### Build Process Steps

#### Backend Build (Lines 125-209):
```bash
1. Build daopad_backend canister:
   cargo build --target wasm32-unknown-unknown --release -p daopad_backend --locked

2. Extract Candid interface:
   candid-extractor target/wasm32-unknown-unknown/release/daopad_backend.wasm > src/daopad/daopad_backend/daopad_backend.did

3. Deploy to mainnet:
   dfx deploy --network ic daopad_backend --argument "(opt \"$ALEXANDRIA_STATION_ID\")"

4. **CRITICAL**: Sync declarations to frontend:
   cp -r src/declarations/daopad_backend/* src/daopad/daopad_frontend/src/declarations/daopad_backend/
```

#### Frontend Build (Lines 212-292):
```bash
1. Install dependencies:
   cd src/daopad/daopad_frontend && npm install

2. Generate declarations:
   dfx generate daopad_backend

3. Build frontend:
   npm run build

4. Deploy to mainnet:
   dfx deploy --network ic daopad_frontend
```

---

## 2. Mainnet-Only Configuration

### Hardcoded Mainnet Canister IDs

**Location**: `/home/theseus/alexandria/daopad/canister_ids.json`

```json
{
  "daopad_backend": {
    "ic": "lwsav-iiaaa-aaaap-qp2qq-cai"
  },
  "admin": {
    "ic": "odkrm-viaaa-aaaap-qp2oq-cai"
  },
  "daopad_frontend": {
    "ic": "l7rlj-6aaaa-aaaap-qp2ra-cai"
  },
  "daopad_invoices": {
    "ic": "heuuj-6aaaa-aaaag-qc6na-cai"
  },
  "kong_locker": {
    "ic": "eazgb-giaaa-aaaap-qqc2q-cai"
  },
  "kong_locker_frontend": {
    "ic": "c6w56-taaaa-aaaai-atlma-cai"
  }
}
```

**Critical Detail**: These IDs are:
- **ONLY configured for IC (mainnet)** - No local network definitions
- **Pre-deployed** - They already exist on mainnet with code
- **Immutable** - Once deployed, only updates are possible

### DFX Configuration

**Location**: `/home/theseus/alexandria/daopad/dfx.json`

```json
{
  "canisters": {
    "daopad_backend": {
      "candid": "src/daopad/daopad_backend/daopad_backend.did",
      "package": "daopad_backend",
      "type": "rust"
    },
    "daopad_frontend": {
      "dependencies": ["daopad_backend", "admin"],
      "source": ["src/daopad/daopad_frontend/dist"],
      "type": "assets",
      "build": "cd src/daopad/daopad_frontend && npm run build"
    },
    "kong_locker": {
      "candid": "src/kong_locker/kong_locker/kong_locker.did",
      "package": "kong_locker",
      "type": "rust",
      "specified_id": "eazgb-giaaa-aaaap-qqc2q-cai"  // MAINNET ONLY
    },
    "kong_locker_frontend": {
      "source": ["src/kong_locker/kong_locker_frontend/dist"],
      "type": "assets",
      "build": "cd src/kong_locker/kong_locker_frontend && npm run build",
      "specified_id": "c6w56-taaaa-aaaai-atlma-cai"  // MAINNET ONLY
    }
  }
}
```

**Key Points**:
- **No local network configuration** - dfx.json doesn't define a "local" network section
- **Specified IDs are hardcoded** - All critical canisters have explicit IDs
- **Dependencies are declared** - Ensures proper build order

---

## 3. Claude-Specific Deployment Instructions

### Official Documentation for Claude

**Location**: `/home/theseus/alexandria/daopad/src/daopad/CLAUDE.md`

**Critical Section** (Lines 1-8):
```markdown
1. **Deployment**: Use `./deploy.sh` from THIS directory (`src/daopad/`), NOT the root

### Workflow Summary:
./deploy.sh --network ic  # Deploy everything. Use this every time.

**⚠️ CRITICAL: Always deploy to mainnet using `./deploy.sh --network ic` 
after making ANY changes. There is no local testing environment - all 
testing happens on mainnet. This ensures both frontend and backend stay in sync.**
```

**Architecture Documentation** (Lines 11-52):
- Two-canister separation of duties (Backend creates requests, Admin approves)
- Repository structure with READ-ONLY reference directories
- Clear directory hierarchy for development

**Declaration Sync Bug Warning** (Lines 117-143):
```markdown
## 🚨 CRITICAL: Declaration Sync Bug

**Error**: `TypeError: actor.method_name is not a function` 
(works in dfx but not frontend)

**Root Cause**: Frontend uses `/src/daopad/daopad_frontend/src/declarations/` 
but dfx generates to `/src/declarations/`. They don't auto-sync!

**Quick Fix After Backend Changes**:
cp -r src/declarations/daopad_backend/* src/daopad/daopad_frontend/src/declarations/daopad_backend/
```

**Orbit Station Integration** (Lines 146-223):
- Use test station: `fec7w-zyaaa-aaaaa-qaffq-cai` (ALEX token)
- Use `daopad` identity with admin/operator access
- 4-step deterministic testing process before implementation

### Claude Permissions Configuration

**Location**: `/home/theseus/alexandria/daopad/src/daopad/.claude/settings.local.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(dfx canister --network ic call fec7w-zyaaa-aaaaa-qaffq-cai ...)",
      "Bash(dfx canister:*)",
      "Read(//home/theseus/alexandria/daopad/**)",
      "Bash(git pull:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push:*)"
    ]
  }
}
```

**Permissions Detail**: 
- Allows all `dfx canister` operations (no network restriction at the permissions level)
- Allows specific Orbit Station test calls
- Allows git operations for commits/pushes
- Read access to entire daopad directory

---

## 4. Deployment Workflows and CI/CD

### GitHub Actions Workflows

#### 1. Claude Code Review Workflow
**Location**: `/home/theseus/alexandria/daopad/.github/workflows/claude-code-review.yml`

```yaml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  claude-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          prompt: |
            Please review this pull request and provide feedback on:
            - Code quality and best practices
            - Potential bugs or issues
            - Performance considerations
            - Security concerns
            - Test coverage
```

**No deployment trigger** - This is code review only.

#### 2. Claude Code Workflow
**Location**: `/home/theseus/alexandria/daopad/.github/workflows/claude.yml`

```yaml
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: contains(comment/review body, '@claude')
    runs-on: ubuntu-latest
```

**Purpose**: Allows Claude to be tagged in comments/issues to perform tasks.

**No automatic deployment** - Deployment is manual via `./deploy.sh`.

### Testing Scripts

**Location**: `/home/theseus/alexandria/daopad/src/daopad/scripts/`

#### Post-Deployment Smoke Tests
**File**: `test-deployment.sh`

```bash
#!/bin/bash
NETWORK="${1:-ic}"
BACKEND_ID="lwsav-iiaaa-aaaap-qp2qq-cai"
TEST_STATION="fec7w-zyaaa-aaaaa-qaffq-cai"

# Tests all critical backend methods after deployment
test_method "check_admin_control" "(principal \"$TEST_STATION\")"
test_method "check_treasury_control" "(principal \"$TEST_STATION\")"
test_method "get_backend_principal" "()"
```

**Run**: `./deploy.sh --network ic --test`

#### Declaration Sync Verification
**File**: `verify-declarations.sh`

```bash
DFX_DECL="src/declarations/daopad_backend/daopad_backend.did.js"
FRONTEND_DECL="src/daopad/daopad_frontend/src/declarations/daopad_backend/daopad_backend.did.js"

# Ensures frontend and dfx declarations are identical
# If mismatch: "TypeError: actor.method_name is not a function"
```

---

## 5. Canister Architecture and Separation of Duties

### Three-Canister System

**1. Backend Canister** (`lwsav-iiaaa-aaaap-qp2qq-cai`)
- Creates Orbit requests only (operator role)
- Cannot approve requests
- Connects to Orbit Station at: `fec7w-zyaaa-aaaaa-qaffq-cai`

**2. Admin Canister** (`odkrm-viaaa-aaaap-qp2oq-cai`)
- Handles ALL voting and approvals (admin role)
- Community votes based on Kong Locker voting power
- Auto-creates proposals when backend creates requests
- Approves after threshold reached

**3. Frontend Canister** (`l7rlj-6aaaa-aaaap-qp2ra-cai`)
- Asset canister with user interface
- Dependencies: daopad_backend + admin
- Syncs declarations from both backend and admin

**Flow**:
```
User Action → Backend creates request → Returns request_id
           ↓
Admin auto-creates proposal for community vote
           ↓
Users vote via Admin (weighted by Kong Locker VP)
           ↓
Threshold reached → Admin approves in Orbit Station
```

### Makefile (Legacy Reference)
**Location**: `/home/theseus/alexandria/daopad/Makefile`

Contains hardcoded canister creation commands:
```bash
daopad_backend:
	dfx canister create daopad_backend --specified-id lwsav-iiaaa-aaaap-qp2qq-cai
	cargo build --release --target wasm32-unknown-unknown --package daopad_backend
	...

admin:
	dfx canister create admin --specified-id odkrm-viaaa-aaaap-qp2oq-cai
	...
```

**Note**: This is NOT used for normal deployments - `deploy.sh` is the standard path.

---

## 6. Key Deployment Constraints and Safeguards

### 1. No Local Testing Environment
- **Evidence**: CLAUDE.md explicitly states "There is no local testing environment - all testing happens on mainnet"
- **Consequence**: Every code change MUST be deployed to mainnet to test
- **Advantage**: Ensures frontend and backend stay in sync (no local drift)

### 2. Declaration Sync Requirement (CRITICAL BUG)
- **Problem**: Frontend reads from `/src/daopad/daopad_frontend/src/declarations/` but dfx generates to `/src/declarations/`
- **Symptoms**: "TypeError: actor.method_name is not a function" in frontend
- **Solution**: Manual sync required in deploy.sh (lines 169-206)
```bash
DECL_SOURCE="src/declarations/daopad_backend"
DECL_TARGET="src/daopad/daopad_frontend/src/declarations/daopad_backend"
cp -r "$DECL_SOURCE"/* "$DECL_TARGET/"
```

### 3. Identity Management
- **daopad identity**: No password required (designed for automation)
- **Plaintext warning suppression**: `export DFX_WARNING=-mainnet_plaintext_identity`
- **Role**: Has admin/operator access to test station

### 4. Specified IDs Lock Deployment
```json
"kong_locker": {
  "specified_id": "eazgb-giaaa-aaaap-qqc2q-cai"  // Forces exact canister
},
"kong_locker_frontend": {
  "specified_id": "c6w56-taaaa-aaaai-atlma-cai"
}
```

**Effect**: Cannot deploy to different canisters without code changes.

### 5. Alexandria Station Integration
- **Test Station ID**: `fec7w-zyaaa-aaaaa-qaffq-cai`
- **Used for**: Validating Orbit request formats and responses
- **Permission**: `daopad` identity has admin access
- **Workflow**: Test with dfx FIRST, then implement in code

---

## 7. Complete Deployment Workflow for Claude

### Standard Mainnet Deployment
```bash
cd /home/theseus/alexandria/daopad/src/daopad/
./deploy.sh --network ic
```

### With Testing
```bash
./deploy.sh --network ic --test
```

### Backend Only
```bash
./deploy.sh --network ic --backend-only
```

### Frontend Only
```bash
./deploy.sh --network ic --frontend-only
```

### Fresh Deployment (Local Only)
```bash
./deploy.sh --fresh
```

### Deployment Steps
1. **Parse arguments** - Extract network, target, and flags
2. **Check network** - For IC: switch to `daopad` identity and set DFX_WARNING
3. **Build backend** (if needed):
   - Compile Rust: `cargo build --target wasm32-unknown-unknown --release -p daopad_backend --locked`
   - Extract Candid: `candid-extractor`
   - Generate declarations: `dfx generate daopad_backend`
4. **Deploy backend** (if needed):
   - `dfx deploy --network ic daopad_backend --argument "(opt \"fec7w-zyaaa-aaaaa-qaffq-cai\")"`
5. **Sync declarations** (CRITICAL):
   - Copy from `src/declarations/` to `src/daopad/daopad_frontend/src/declarations/`
6. **Build frontend** (if needed):
   - Install: `npm install`
   - Generate: `dfx generate daopad_backend` (again)
   - Sync declarations: `cp -r src/declarations/daopad_backend/* ...`
   - Build: `npm run build`
7. **Deploy frontend** (if needed):
   - `dfx deploy --network ic daopad_frontend`
8. **Run tests** (if --test flag):
   - Execute smoke tests
   - Execute frontend integration tests

---

## 8. Critical Files Summary

| File | Purpose | Maintainability |
|------|---------|-----------------|
| `src/daopad/deploy.sh` | Primary deployment script | Well-documented, 400 lines |
| `dfx.json` | DFX configuration | Minimal, mostly read-only |
| `canister_ids.json` | Mainnet canister IDs | Hardcoded, immutable |
| `src/daopad/CLAUDE.md` | Claude-specific instructions | Comprehensive, updated |
| `.claude/settings.local.json` | Claude permissions | Whitelist-based |
| `Makefile` | Legacy canister creation | Not used in standard flow |
| `.github/workflows/claude.yml` | GitHub automation | For code review only |
| `scripts/test-deployment.sh` | Post-deployment validation | Smoke tests only |
| `scripts/verify-declarations.sh` | Declaration sync checker | Verification utility |

---

## 9. Key Differences from Local Deployment

| Aspect | Local | Mainnet |
|--------|-------|---------|
| **Network** | Default (local) | `--network ic` required |
| **Identity** | Current identity | Switches to `daopad` |
| **Canister IDs** | Auto-assigned | Pre-specified in dfx.json |
| **Testing** | Optional local dfx | REQUIRED before each change |
| **Declaration Sync** | Built into deploy.sh | CRITICAL - manual sync in script |
| **Fresh Deploy** | `--fresh` flag available | Not recommended |
| **Internet Identity** | Deployed by script | Already exists (rdmx6-jaaaa...) |

---

## 10. Security Considerations

### Identity Security
- **daopad identity** is passwordless (for CI/CD)
- **Location**: dfx identity store (system-managed)
- **Warning**: DFX_WARNING suppression is necessary for automation

### Canister Security
- **Specified IDs**: Prevent accidental deployment to wrong canisters
- **Role separation**: Backend (operator) and Admin (admin) cannot approve their own requests
- **Test station**: `fec7w-zyaaa-aaaaa-qaffq-cai` for validation before live changes

### Code Validation
- **Smoke tests**: Verify all backend methods callable after deployment
- **Declaration sync**: Ensures frontend uses correct backend types
- **GitHub workflows**: Code review before merging

---

## 11. Troubleshooting Guide

### "TypeError: actor.method_name is not a function"
**Cause**: Declaration sync failure
**Fix**: 
```bash
cp -r src/declarations/daopad_backend/* src/daopad/daopad_frontend/src/declarations/daopad_backend/
./deploy.sh --network ic --frontend-only
```

### "DFX command not found"
**Cause**: DFX not installed or not in PATH
**Fix**: Install DFX: `sh -c '$(curl -fsSL https://sdk.dfinity.org/install.sh)'`

### "dfx is not running" (local deployment)
**Cause**: Local dfx daemon not started
**Fix**: `dfx start --background --host 127.0.0.1:4943`

### "Identity not found: daopad"
**Cause**: `daopad` identity needs to be created
**Fix**: Must be set up separately (not part of standard deploy)

### Deployment fails with permission error on mainnet
**Cause**: Not using `daopad` identity or insufficient permissions
**Fix**: Ensure `daopad` identity has admin/operator roles on test station

---

## 12. Complete Deployment Decision Tree

```
START: Make code changes
  ↓
Run: ./deploy.sh --network ic
  ↓
[Backend changed?] → Build backend, deploy backend, SYNC DECLARATIONS
  ↓
[Frontend changed?] → Generate declarations, build frontend, deploy frontend
  ↓
[Both changed?] → Execute backend flow FIRST, then frontend flow
  ↓
Run: ./deploy.sh --network ic --test
  ↓
[Tests pass?] → SUCCESS: Commit changes, create PR
  ↓
[Tests fail?] → Review test output, fix issue, GOTO "Make code changes"
```

---

## Summary: Mainnet-Only Deployment Strategy

**DAOPad enforces mainnet-only deployments through:**

1. **No local network defined** - dfx.json has no local configuration
2. **Pre-specified mainnet IDs** - All canisters locked to mainnet addresses
3. **daopad identity requirement** - Automatic switch for IC network
4. **Declaration sync enforcement** - Built into deploy script
5. **Hardcoded test station** - For Orbit integration validation
6. **CLAUDE.md enforcement** - Explicit "no local testing" documentation
7. **GitHub workflow design** - Code review, not deployment automation

**Result**: Every code change goes directly to production mainnet. Verification happens through smoke tests after deployment. This design maximizes confidence in frontend-backend sync at the cost of requiring mainnet testing.

