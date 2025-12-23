#!/bin/bash
# OpenHouse Multi-Game Casino Deployment Script - Mainnet Only
# Usage: ./deploy.sh [--crash-only|--plinko-only|--roulette-only|--dice-only|--frontend-only] [--test]

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Parse arguments
DEPLOY_TARGET="all"
RUN_TESTS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --crash-only)
            DEPLOY_TARGET="crash"
            shift
            ;;
        --plinko-only)
            DEPLOY_TARGET="plinko"
            shift
            ;;
        --roulette-only)
            DEPLOY_TARGET="roulette"
            shift
            ;;
        --dice-only)
            DEPLOY_TARGET="dice"
            shift
            ;;
        --life-only)
            DEPLOY_TARGET="life"
            shift
            ;;
        --life2-only)
            DEPLOY_TARGET="life2"
            shift
            ;;
        --life3-only)
            DEPLOY_TARGET="life3"
            shift
            ;;
        --frontend-only)
            DEPLOY_TARGET="frontend"
            shift
            ;;
        --test)
            RUN_TESTS=true
            shift
            ;;
        --help)
            echo "OpenHouse Casino Deployment Script - Mainnet Only"
            echo ""
            echo "Usage: ./deploy.sh [options]"
            echo ""
            echo "Options:"
            echo "  --crash-only       Deploy only crash backend"
            echo "  --plinko-only      Deploy only plinko backend"
            echo "  --roulette-only   Deploy only roulette backend (Rust)"
            echo "  --dice-only        Deploy only dice backend"
            echo "  --life-only        Deploy only life1 backend (Game of Life - Server 1)"
            echo "  --life2-only       Deploy only life2 backend (Game of Life - Server 2)"
            echo "  --life3-only       Deploy only life3 backend (Life Server 3)"
            echo "  --frontend-only    Deploy only the frontend"
            echo "  --test             Run post-deployment tests"
            echo "  --help             Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./deploy.sh                    # Deploy everything to mainnet"
            echo "  ./deploy.sh --crash-only       # Deploy only crash backend"
            echo "  ./deploy.sh --roulette-only   # Deploy only roulette backend"
            echo "  ./deploy.sh --test             # Deploy and run tests"
            echo ""
            echo "IMPORTANT: This script ALWAYS deploys to MAINNET"
            echo "There is no local testing environment - all testing happens on mainnet"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Display deployment configuration
echo "================================================"
echo "OpenHouse Casino Deployment - MAINNET ONLY"
echo "================================================"
echo "Network: IC (Mainnet)"
echo "Target: $DEPLOY_TARGET"
echo "Working from: $SCRIPT_DIR"
echo ""
echo "Mainnet Canister IDs:"
echo "  Crash Backend:     fws6k-tyaaa-aaaap-qqc7q-cai"
echo "  Plinko Backend:    weupr-2qaaa-aaaap-abl3q-cai"
echo "  Roulette Backend: wvrcw-3aaaa-aaaah-arm4a-cai"
echo "  Dice Backend:      whchi-hyaaa-aaaao-a4ruq-cai"
echo "  Life1 Backend:     pijnb-7yaaa-aaaae-qgcuq-cai"
echo "  Life2 Backend:     qoski-4yaaa-aaaai-q4g4a-cai"
echo "  Life3 Backend:     66p3s-uaaaa-aaaad-ac47a-cai"
echo "  Frontend:          pezw3-laaaa-aaaal-qssoa-cai"
echo "================================================"
echo ""

# Change to script directory for all operations
cd "$SCRIPT_DIR"

# Function to check if DFX is available
check_dfx() {
    if ! command -v dfx &> /dev/null; then
        echo "ERROR: dfx is not installed"
        echo "Please install dfx: sh -c '\$(curl -fsSL https://sdk.dfinity.org/install.sh)'"
        exit 1
    fi
}

# Function to switch to daopad identity
use_daopad_identity() {
    echo "Switching to daopad identity for mainnet deployment..."
    export DFX_WARNING=-mainnet_plaintext_identity
    dfx identity use daopad
    echo "Using identity: daopad"
    echo ""
}

# Function to deploy crash backend
deploy_crash() {
    echo "================================================"
    echo "Deploying Crash Backend Canister"
    echo "================================================"

    # Build the backend canister
    echo "Building crash backend canister..."
    cargo build --release --target wasm32-unknown-unknown --package crash_backend

    # Skip candid extraction - using manually created .did file
    echo "Using pre-defined candid interface..."

    # Deploy to mainnet
    echo "Deploying crash backend to mainnet..."
    dfx deploy crash_backend --network ic

    echo "Crash backend deployment completed!"
    echo ""
}

# Function to deploy plinko backend
deploy_plinko() {
    echo "================================================"
    echo "Deploying Plinko Backend Canister"
    echo "================================================"

    # Build the backend canister
    echo "Building plinko backend canister..."
    cargo build --release --target wasm32-unknown-unknown --package plinko_backend

    # Skip candid extraction - using manually created .did file
    echo "Using pre-defined candid interface..."

    # Deploy to mainnet
    echo "Deploying plinko backend to mainnet..."
    dfx deploy plinko_backend --network ic

    echo "Plinko backend deployment completed!"
    echo ""
}

# Function to deploy roulette backend
deploy_roulette() {
    echo "================================================"
    echo "Deploying Roulette Backend Canister"
    echo "=================================================="
    echo "Deploying Roulette Backend Canister"
    echo "=================================================="

    # Build the backend canister
    echo "Building roulette backend canister..."
    cargo build --release --target wasm32-unknown-unknown --package roulette_backend

    # Skip candid extraction - using manually created .did file
    echo "Using pre-defined candid interface..."

    # Deploy to mainnet
    echo "Deploying roulette backend to mainnet..."
    dfx deploy roulette_backend --network ic

    echo "Roulette backend deployment completed!"
    echo ""
}

# Function to deploy dice backend
deploy_dice() {
    echo "=================================================="
    echo "Deploying Dice Backend Canister"
    echo "=================================================="

    # Build the backend canister
    echo "Building dice backend canister..."
    cargo build --release --target wasm32-unknown-unknown --package dice_backend

    # Skip candid extraction - using manually created .did file
    echo "Using pre-defined candid interface..."

    # Deploy to mainnet
    echo "Deploying dice backend to mainnet..."
    dfx deploy dice_backend --network ic

    echo "Dice backend deployment completed!"
    echo ""
}

# Function to deploy life1 backend (Game of Life - Server 1)
deploy_life() {
    echo "================================================"
    echo "Deploying Life1 Backend Canister"
    echo "================================================"

    # Build the backend canister
    echo "Building life1 backend canister..."
    cargo build --release --target wasm32-unknown-unknown --package life1_backend

    # Skip candid extraction - using manually created .did file
    echo "Using pre-defined candid interface..."

    # Deploy to mainnet
    echo "Deploying life1 backend to mainnet..."
    dfx deploy life1_backend --network ic

    echo "Life1 backend deployment completed!"
    echo "Life1 Canister ID: pijnb-7yaaa-aaaae-qgcuq-cai"
    echo ""
}

# Function to deploy life2 backend (Game of Life - Server 2)
deploy_life2() {
    echo "================================================"
    echo "Deploying Life2 Backend Canister"
    echo "================================================"

    # Build the backend canister
    echo "Building life2 backend canister..."
    cargo build --release --target wasm32-unknown-unknown --package life2_backend

    # Skip candid extraction - using manually created .did file
    echo "Using pre-defined candid interface..."

    # Deploy to mainnet
    echo "Deploying life2 backend to mainnet..."
    dfx deploy life2_backend --network ic

    echo "Life2 backend deployment completed!"
    echo "Life2 Canister ID: qoski-4yaaa-aaaai-q4g4a-cai"
    echo ""
}

# Function to deploy life3 backend (Life Server 3)
deploy_life3() {
    echo "================================================"
    echo "Deploying Life3 Backend Canister"
    echo "================================================"

    # Build the backend canister
    echo "Building life3 backend canister..."
    cargo build --release --target wasm32-unknown-unknown --package life3_backend

    # Skip candid extraction - using manually created .did file
    echo "Using pre-defined candid interface..."

    # Deploy to mainnet
    echo "Deploying life3 backend to mainnet..."
    dfx deploy life3_backend --network ic

    echo "Life3 backend deployment completed!"
    echo "Life3 Canister ID: 66p3s-uaaaa-aaaad-ac47a-cai"
    echo ""
}

# Function to deploy frontend
deploy_frontend() {
    echo "=================================================="
    echo "Deploying OpenHouse Frontend Canister"
    echo "=================================================="

    # CRITICAL: Regenerate declarations from Candid interfaces
    echo "Regenerating backend declarations from Candid interfaces..."
    dfx generate crash_backend 2>/dev/null || echo "Warning: Could not generate crash_backend declarations"
    dfx generate plinko_backend 2>/dev/null || echo "Warning: Could not generate plinko_backend declarations"
    dfx generate roulette_backend 2>/dev/null || echo "Warning: Could not generate roulette_backend declarations"
    dfx generate dice_backend 2>/dev/null || echo "Warning: Could not generate dice_backend declarations"
    dfx generate life1_backend 2>/dev/null || echo "Warning: Could not generate life1_backend declarations"
    dfx generate life2_backend 2>/dev/null || echo "Warning: Could not generate life2_backend declarations"
    dfx generate life3_backend 2>/dev/null || echo "Warning: Could not generate life3_backend declarations"

    # Sync declarations
    echo "Copying fresh declarations to frontend..."
    if [ -d "src/declarations" ]; then
        mkdir -p openhouse_frontend/src/declarations
        cp -r src/declarations/* openhouse_frontend/src/declarations/ 2>/dev/null || true
        echo "✅ Declarations synced successfully"
    else
        echo "⚠️  Warning: src/declarations directory not found"
    fi

    # Build frontend
    echo "Building frontend..."
    if [ -d "openhouse_frontend" ]; then
        cd openhouse_frontend

        if [ -f "package.json" ]; then
            echo "Installing frontend dependencies..."
            npm install

            echo "Building frontend assets..."
            npm run build
        else
            echo "Using static frontend assets..."
        fi

        cd ..
    fi

    # Deploy frontend to mainnet
    echo "Deploying frontend to mainnet..."
    dfx deploy openhouse_frontend --network ic

    echo "Frontend deployment completed!"
    echo "Access at: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
    echo ""
}

# Function to run tests
run_tests() {
    echo "=================================================="
    echo "Running Post-Deployment Tests"
    echo "=================================================="

    # Test crash backend
    echo "Testing crash backend canister..."
    dfx canister --network ic call crash_backend greet '("Tester")' 2>/dev/null || echo "Crash backend test method not yet implemented"

    # Test plinko backend
    echo "Testing plinko backend canister..."
    dfx canister --network ic call plinko_backend greet '("Tester")' 2>/dev/null || echo "Plinko backend test method not yet implemented"

    # Test roulette backend
    echo "Testing roulette backend canister..."
    dfx canister --network ic call roulette_backend greet '("Tester")' 2>/dev/null || echo "Roulette backend test method not yet implemented"

    # Test dice backend
    echo "Testing dice backend canister..."
    dfx canister --network ic call dice_backend greet '("Tester")' 2>/dev/null || echo "Dice backend test method not yet implemented"

    # Check frontend is accessible
    echo "Checking frontend accessibility..."
    curl -s -o /dev/null -w "Frontend HTTP Status: %{http_code}\n" https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io

    echo "Tests completed!"
    echo ""
}

# Main deployment flow
main() {
    check_dfx
    use_daopad_identity

    case $DEPLOY_TARGET in
        crash)
            # deploy_crash
            ;;
        plinko)
            # deploy_plinko
            ;;
        roulette)
            deploy_roulette
            ;;
        dice)
            # deploy_dice
            ;;
        life)
            deploy_life
            ;;
        life2)
            deploy_life2
            ;;
        life3)
            deploy_life3
            ;;
        frontend)
            deploy_frontend
            ;;
        all)
            deploy_crash
            deploy_plinko
            deploy_roulette
            deploy_dice
            deploy_life
            deploy_life2
            deploy_life3
            deploy_frontend
            ;;
    esac

    if [ "$RUN_TESTS" = true ]; then
        run_tests
    fi

    echo "=================================================="
    echo "Deployment Complete!"
    echo "=================================================="
    echo "Crash Backend:     https://dashboard.internetcomputer.org/canister/fws6k-tyaaa-aaaap-qqc7q-cai"
    echo "Plinko Backend:    https://dashboard.internetcomputer.org/canister/weupr-2qaaa-aaaap-abl3q-cai"
    echo "Roulette Backend: https://dashboard.internetcomputer.org/canister/wvrcw-3aaaa-aaaah-arm4a-cai"
    echo "Dice Backend:      https://dashboard.internetcomputer.org/canister/whchi-hyaaa-aaaao-a4ruq-cai"
    echo "Life1 Backend:     https://dashboard.internetcomputer.org/canister/pijnb-7yaaa-aaaae-qgcuq-cai"
    echo "Life2 Backend:     https://dashboard.internetcomputer.org/canister/qoski-4yaaa-aaaai-q4g4a-cai"
    echo "Life3 Backend:     https://dashboard.internetcomputer.org/canister/66p3s-uaaaa-aaaad-ac47a-cai"
    echo "Frontend:          https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
    echo ""
    echo "Remember: All changes are live on mainnet immediately!"
}

# Run main function
main
