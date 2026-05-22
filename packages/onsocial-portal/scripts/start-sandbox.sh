#!/bin/bash

# NEAR Sandbox Setup for OnSocial Playground
# This script initializes a local NEAR sandbox and deploys the core-onsocial contract

set -e

echo "🚀 Starting NEAR Sandbox for OnSocial Playground..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if near-sandbox is installed
if ! command -v near-sandbox &> /dev/null; then
    echo "❌ near-sandbox not found. Installing..."
    npm install -g near-sandbox
fi

# Kill any existing sandbox instance
echo "🧹 Cleaning up existing sandbox..."
pkill -f near-sandbox || true
sleep 2

# Start sandbox in background
echo "📦 Starting NEAR sandbox..."
near-sandbox run &
SANDBOX_PID=$!
echo "Sandbox PID: $SANDBOX_PID"

# Wait for sandbox to be ready
echo "⏳ Waiting for sandbox to be ready..."
sleep 5

# Set sandbox as default network
export NEAR_ENV=sandbox

# Create test accounts
echo "👤 Creating test accounts..."
near-sandbox create-account alice.test.near --initialBalance 100 || true
near-sandbox create-account bob.test.near --initialBalance 100 || true
near-sandbox create-account contract.test.near --initialBalance 100 || true

# Deploy contract
echo "📄 Deploying core-onsocial contract..."
WASM_FILE="../../target/near/core_onsocial/core_onsocial.wasm"

if [ ! -f "$WASM_FILE" ]; then
    echo "❌ Contract WASM not found at $WASM_FILE"
    echo "Building contract first..."
    cd ../../contracts/core-onsocial
    cargo near build
    cd -
fi

near-sandbox deploy contract.test.near "$WASM_FILE" --initFunction new --initArgs '{}'

echo ""
echo -e "${GREEN}✅ NEAR Sandbox is ready!${NC}"
echo ""
echo -e "${BLUE}Contract:${NC} contract.test.near"
echo -e "${BLUE}Test Accounts:${NC}"
echo "  - alice.test.near (100 NEAR)"
echo "  - bob.test.near (100 NEAR)"
echo ""
echo -e "${BLUE}RPC Endpoint:${NC} http://localhost:3030"
echo ""
echo "Press Ctrl+C to stop the sandbox"

# Keep script running
wait $SANDBOX_PID
