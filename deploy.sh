#!/bin/bash
# OpenHouse Multi-Game Casino Deployment Script - Mainnet Only
# Usage: ./deploy.sh [--crash-only|--plinko-only|--mines-only|--frontend-only] [--test]

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
        --mines-only)
            DEPLOY_TARGET="mines"
            shift
            ;;
        --dice-only)
            DEPLOY_TARGET="dice"
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
            echo "  --mines-only       Deploy only mines backend"
            echo "  --dice-only        Deploy only dice backend"
            echo "  --frontend-only    Deploy only the frontend"
            echo "  --test            Run post-deployment tests"
            echo "  --help            Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./deploy.sh                    # Deploy everything to mainnet"
            echo "  ./deploy.sh --crash-only       # Deploy only crash backend"
            echo "  ./deploy.sh --plinko-only      # Deploy only plinko backend"
            echo "  ./deploy.sh --mines-only       # Deploy only mines backend"
            echo "  ./deploy.sh --dice-only        # Deploy only dice backend"
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
echo "  Crash Backend:  fws6k-tyaaa-aaaap-qqc7q-cai"
echo "  Plinko Backend: weupr-2qaaa-aaaap-abl3q-cai"
echo "  Mines Backend:  wvrcw-3aaaa-aaaah-arm4a-cai"
echo "  Dice Backend:   whchi-hyaaa-aaaao-a4ruq-cai"
echo "  Frontend:       pezw3-laaaa-aaaal-qssoa-cai"
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

# Function to deploy mines backend
deploy_mines() {
    echo "================================================"
    echo "Deploying Mines Backend Canister"
    echo "================================================"

    # Build the backend canister
    echo "Building mines backend canister..."
    cargo build --release --target wasm32-unknown-unknown --package mines_backend

    # Skip candid extraction - using manually created .did file
    echo "Using pre-defined candid interface..."

    # Deploy to mainnet
    echo "Deploying mines backend to mainnet..."
    dfx deploy mines_backend --network ic

    echo "Mines backend deployment completed!"
    echo ""
}

# Function to deploy dice backend
deploy_dice() {
    echo "================================================"
    echo "Deploying Dice Backend Canister"
    echo "================================================"

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

# Function to deploy frontend
deploy_frontend() {
    echo "================================================"
    echo "Deploying OpenHouse Frontend Canister"
    echo "================================================"

    # Sync declarations (critical for frontend to work)
    echo "Syncing backend declarations for frontend..."
    if [ -d "src/declarations" ]; then
        echo "Copying declarations to frontend..."
        mkdir -p openhouse_frontend/src/declarations
        cp -r src/declarations/* openhouse_frontend/src/declarations/ 2>/dev/null || true
    fi

    # Build frontend
    echo "Building frontend..."
    if [ -d "openhouse_frontend" ]; then
        cd openhouse_frontend

        # Install dependencies if package.json exists
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
    echo "================================================"
    echo "Running Post-Deployment Tests"
    echo "================================================"

    # Test crash backend
    echo "Testing crash backend canister..."
    dfx canister --network ic call crash_backend greet '("Tester")' 2>/dev/null || echo "Crash backend test method not yet implemented"

    # Test plinko backend
    echo "Testing plinko backend canister..."
    dfx canister --network ic call plinko_backend greet '("Tester")' 2>/dev/null || echo "Plinko backend test method not yet implemented"

    # Test mines backend
    echo "Testing mines backend canister..."
    dfx canister --network ic call mines_backend greet '("Tester")' 2>/dev/null || echo "Mines backend test method not yet implemented"

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
            deploy_crash
            ;;
        plinko)
            deploy_plinko
            ;;
        mines)
            deploy_mines
            ;;
        dice)
            deploy_dice
            ;;
        frontend)
            deploy_frontend
            ;;
        all)
            deploy_crash
            deploy_plinko
            deploy_mines
            deploy_dice
            deploy_frontend
            ;;
    esac

    if [ "$RUN_TESTS" = true ]; then
        run_tests
    fi

    echo "================================================"
    echo "Deployment Complete!"
    echo "================================================"
    echo "Crash Backend:  https://dashboard.internetcomputer.org/canister/fws6k-tyaaa-aaaap-qqc7q-cai"
    echo "Plinko Backend: https://dashboard.internetcomputer.org/canister/weupr-2qaaa-aaaap-abl3q-cai"
    echo "Mines Backend:  https://dashboard.internetcomputer.org/canister/wvrcw-3aaaa-aaaah-arm4a-cai"
    echo "Dice Backend:   https://dashboard.internetcomputer.org/canister/whchi-hyaaa-aaaao-a4ruq-cai"
    echo "Frontend:       https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
    echo ""
    echo "Remember: All changes are live on mainnet immediately!"
}

# Run main function
main