#!/bin/bash

BASE_DIR="$(pwd)/contracts"
TEST_DIR="$(pwd)/tests"
CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))
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
  local module=$1
  echo "Running integration tests${module:+ for $module}..."
  cd "$TEST_DIR" || handle_error "Tests directory not found"
  curl -s http://localhost:3030 >/dev/null || { echo "Skipping integration tests: NEAR Sandbox not running"; return 0; }
  if [ -n "$module" ]; then
    echo "Running cargo test --lib -- $module"
    cargo test --lib -- $module || handle_error "Integration tests failed for $module"
  else
    echo "Running cargo test --lib"
    cargo test --lib || handle_error "Integration tests failed"
  fi
  echo -e "${GREEN}Integration tests passed${NC}"
}

if [ "$1" = "integration" ]; then
  if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
    test_integration "$2"
  else
    handle_error "Tests directory or valid Cargo.toml not found"
  fi
else
  for contract in "${CONTRACTS[@]}"; do
    test_contract "$contract"
  done
  if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
    test_integration
  else
    echo "Skipping integration tests: tests/ directory or valid Cargo.toml not found"
  fi
fi

echo -e "${GREEN}All tests complete!${NC}"