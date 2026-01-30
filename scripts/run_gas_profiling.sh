#!/bin/bash
# Run gas profiling tests and capture output

set -e

cd "$(dirname "$0")/.."

echo "🔥 Running Gas Profiling Tests for Staking Contract"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Build contracts first
echo "📦 Building contracts..."
make build-contract-staking-onsocial > /dev/null 2>&1
cd contracts/mock-ft && cargo near build > /dev/null 2>&1
cd ../..

echo "✅ Contracts built"
echo ""

# Run the comprehensive test
echo "📊 Running comprehensive gas profiling..."
cargo test -p onsocial-integration-tests \
    gas_profile_all_operations_summary \
    --release \
    -- \
    --nocapture \
    --test-threads=1 \
    2>&1 | grep -A 50 "STAKING CONTRACT GAS PROFILING"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Gas profiling complete"
