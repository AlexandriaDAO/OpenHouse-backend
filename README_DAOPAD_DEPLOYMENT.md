# DAOPad Build and Deployment Process - Complete Documentation

## Overview

This directory contains comprehensive analysis of the **DAOPad mainnet-only deployment strategy**. DAOPad enforces direct production deployments with no local testing environment - every code change goes directly to mainnet canisters.

## Quick Start

**The Single Deployment Command:**
```bash
cd /home/theseus/alexandria/daopad/src/daopad/
./deploy.sh --network ic
```

This command handles everything:
1. Checks network and switches to `daopad` identity
2. Builds backend (Rust compilation)
3. Extracts Candid interface
4. Deploys backend to mainnet
5. **Syncs declarations to frontend (critical!)**
6. Builds frontend (npm)
7. Deploys frontend to mainnet

## Documentation Files

### 1. **DAOPAD_DEPLOYMENT_EXECUTIVE_SUMMARY.txt** (START HERE)
- High-level overview of the entire deployment system
- Key findings and unique design decisions
- Deployment workflow in 4 steps
- Complete list of canister IDs
- Common operations and troubleshooting
- **Best for**: Quick understanding, decision makers, troubleshooting

### 2. **DAOPAD_DEPLOYMENT_SUMMARY.txt** (QUICK REFERENCE)
- Fast reference guide organized by sections
- File locations for all critical components
- All deployment command options
- Deployment flow diagram
- Security safeguards
- Testing and validation procedures
- **Best for**: During deployment, quick lookups, checklists

### 3. **DAOPAD_DEPLOYMENT_ANALYSIS.md** (COMPREHENSIVE)
- 12-section deep dive into the entire system
- Complete file listing with line numbers
- Build script analysis with code snippets
- Mainnet configuration details
- Claude-specific setup and permissions
- GitHub workflows explanation
- Canister architecture details
- Deployment constraints and safeguards
- Complete workflow documentation
- Security considerations
- Troubleshooting guide with decision tree
- **Best for**: Complete understanding, implementation, integration

## Key Facts

### Mainnet-Only Strategy
- **NO local testing environment** - All testing happens on mainnet
- **Direct production deployment** - Every code change goes live
- **Three-canister architecture** - Backend (creates), Admin (approves), Frontend (UI)
- **Passwordless identity** - `daopad` identity for Claude automation

### Critical Components

| Component | File | Purpose |
|-----------|------|---------|
| Deployment Script | `src/daopad/deploy.sh` | Main deployment automation (400 lines) |
| Documentation | `src/daopad/CLAUDE.md` | Claude-specific workflow guide |
| Configuration | `dfx.json` + `canister_ids.json` | Canister setup |
| Testing | `scripts/test-deployment.sh` | Post-deployment validation |
| Declaration Sync | `scripts/verify-declarations.sh` | Frontend-backend sync check |

### Mainnet Canister IDs

```
Backend    lwsav-iiaaa-aaaap-qp2qq-cai  (Creates Orbit requests)
Admin      odkrm-viaaa-aaaap-qp2oq-cai  (Handles voting/approval)
Frontend   l7rlj-6aaaa-aaaap-qp2ra-cai  (User interface)
Invoices   heuuj-6aaaa-aaaag-qc6na-cai
Test Stn   fec7w-zyaaa-aaaaa-qaffq-cai  (Validation)
```

## Common Deployment Scenarios

### Full Mainnet Deployment
```bash
cd /home/theseus/alexandria/daopad/src/daopad/
./deploy.sh --network ic
```

### Backend Changes Only
```bash
./deploy.sh --network ic --backend-only
```

### Frontend Changes Only
```bash
./deploy.sh --network ic --frontend-only
```

### With Post-Deployment Tests
```bash
./deploy.sh --network ic --test
```

### Fresh Local (Development)
```bash
./deploy.sh --fresh
```

## Critical Issues and Solutions

### Declaration Sync Bug
**Problem:** Frontend reads from `src/daopad/daopad_frontend/src/declarations/` but DFX generates to `src/declarations/`

**Symptom:** `TypeError: actor.method_name is not a function`

**Solution:** Auto-handled by deploy script, but verify with:
```bash
./scripts/verify-declarations.sh
```

### Deployment Safeguards
1. **Identity Control** - Auto-switches to `daopad` for mainnet
2. **Canister IDs** - Hardcoded to prevent wrong deployment
3. **Declaration Sync** - Auto-sync + verification script
4. **Role Separation** - Backend/Admin cannot approve own requests
5. **Test Station** - `fec7w-zyaaa-aaaaa-qaffq-cai` for validation
6. **Post-Deployment Tests** - 13+ smoke tests verify functionality

## Claude-Specific Setup

### Documentation Location
`/home/theseus/alexandria/daopad/src/daopad/CLAUDE.md`

Complete guide including:
- Deployment workflow
- Two-canister architecture explanation
- Declaration sync bug and fix
- Orbit Station integration process
- Security checks
- Common issues and solutions

### Permissions
`/home/theseus/alexandria/daopad/src/daopad/.claude/settings.local.json`

Allows:
- All `dfx canister` operations
- Specific Orbit Station test calls
- Git operations (pull, add, commit, push)
- Read access to entire daopad directory

### GitHub Workflows
- **claude.yml** - Interactive, responds to @claude mentions
- **claude-code-review.yml** - Auto-review on PR open/sync
- **No automatic deployment** - Manual via `./deploy.sh`

## File Locations Reference

### Primary Files
```
/home/theseus/alexandria/daopad/
├── src/daopad/
│   ├── deploy.sh                    (Main deployment script - 400 lines)
│   ├── CLAUDE.md                    (Complete workflow guide)
│   ├── dfx.json                     (DFX configuration)
│   ├── daopad_backend/              (Backend canister source)
│   ├── admin/                       (Admin canister source)
│   ├── daopad_frontend/             (Frontend source)
│   └── scripts/
│       ├── test-deployment.sh       (Smoke tests)
│       ├── verify-declarations.sh   (Declaration sync check)
│       └── test-frontend-integration.sh
├── canister_ids.json                (Mainnet IDs only)
├── dfx.json                         (DFX config)
└── .github/workflows/
    ├── claude.yml                   (Interactive)
    └── claude-code-review.yml       (Auto-review)
```

## Troubleshooting Quick Links

See **DAOPAD_DEPLOYMENT_EXECUTIVE_SUMMARY.txt** section "Troubleshooting Checklist" for:
- Declaration sync issues
- DFX installation problems
- Identity configuration
- Permission errors
- Frontend update delays

## Architecture Summary

### Three-Canister System

**Backend Canister** (`lwsav-iiaaa-aaaap-qp2qq-cai`)
- Creates Orbit requests only (operator role)
- Cannot approve requests
- Isolated from approval logic

**Admin Canister** (`odkrm-viaaa-aaaap-qp2oq-cai`)
- Handles voting and approvals (admin role)
- Cannot create requests
- Community votes based on Kong Locker voting power

**Frontend Canister** (`l7rlj-6aaaa-aaaap-qp2ra-cai`)
- User interface (asset canister)
- Dependencies: daopad_backend + admin
- Syncs declarations from both

### Orbit Station Integration
- Test Station: `fec7w-zyaaa-aaaaa-qaffq-cai`
- Identity: `daopad` (has admin/operator access)
- Workflow: Test with dfx FIRST, then implement in code

## Design Philosophy

### Why Mainnet-Only?
- Forces frontend-backend sync (no local drift)
- Every change immediately tested in real conditions
- Single source of truth (production)
- Reduces bugs from local/mainnet divergence

### Known Issues
- Declaration sync bug (documented, auto-handled)
- Passwordless identity (by design for automation)
- No rollback mechanism (be careful with deployments)

## Critical Success Factors

1. **ALWAYS use ./deploy.sh from src/daopad/**, NOT root
2. **Mainnet deployment is MANDATORY for testing**
3. **Verify declarations** with `scripts/verify-declarations.sh`
4. **Run post-deployment tests** - `./deploy.sh --network ic --test`
5. **Test with dfx FIRST** before implementing Orbit integration
6. **NEVER skip declaration sync** - causes "is not a function" errors
7. **NEVER change hardcoded canister IDs** without approval

## Additional Resources

### External Documentation
- **Orbit Station Docs**: Read-only reference at `../../orbit-reference/`
- **Kong Locker Docs**: Read-only reference at `../../kong-locker-reference/`
- **Internet Computer Docs**: https://internetcomputer.org/docs

### Internal Guides
- **Playground E2E Testing**: `PLAYWRIGHT_TESTING_GUIDE_CONDENSED.md`
- **Plan Methodology**: `.claude/workflows/plan-pursuit-methodology-condensed.md`
- **PR Orchestration**: `.claude/prompts/autonomous-pr-orchestrator-condensed.md`

## Support

For deployment issues:
1. Check **DAOPAD_DEPLOYMENT_EXECUTIVE_SUMMARY.txt** troubleshooting section
2. Review **src/daopad/CLAUDE.md** for detailed explanations
3. Run `./scripts/verify-declarations.sh` to check declaration sync
4. Run `./deploy.sh --help` for script options

---

**Project**: Alexandria DAO - DAOPad  
**Strategy**: Mainnet-Only Deployment (No Local Testing)  
**Deployment Script**: `src/daopad/deploy.sh` (400 lines)  
**Documentation**: `src/daopad/CLAUDE.md`  
**Last Updated**: 2025-11-12

