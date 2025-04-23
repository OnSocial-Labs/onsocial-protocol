#!/bin/bash

BASE_DIR="$(pwd)/contracts"
CONTRACTS=("auth-onsocial" "ft-wrapper-onsocial" "relayer-onsocial")
TEST_DIR="$(pwd)/tests"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  exit 1
}

test_contract() {
  local contract=$1
  echo "Running unit tests for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  cargo test || handle_error "Unit tests failed for $contract"
  echo -e "${GREEN}$contract unit tests passed${NC}"
}

test_integration() {
  echo "Running integration tests..."
  cd "$TEST_DIR" || handle_error "Tests directory not found"
  cargo test || handle_error "Integration tests failed"
  echo -e "${GREEN}Integration tests passed${NC}"
}

# Check for integration-only mode
if [ "$1" = "integration" ]; then
  if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
    test_integration
  else
    handle_error "Tests directory or valid Cargo.toml not found"
  fi
else
  # Run unit tests for each contract sequentially
  for contract in "${CONTRACTS[@]}"; do
    test_contract "$contract"
  done

  # Run integration tests only if tests/ directory and valid Cargo.toml exist
  if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
    test_integration
  else
    echo "Skipping integration tests: tests/ directory or valid Cargo.toml not found"
  fi
fi

echo -e "${GREEN}All tests complete!${NC}"