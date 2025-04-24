#!/bin/bash

BASE_DIR="$(pwd)/contracts"
TEST_DIR="$(pwd)/tests"
[ ! -f Cargo.toml ] && { echo -e "${RED}Error: Cargo.toml not found${NC}"; exit 1; }
CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))
[ ${#CONTRACTS[@]} -eq 0 ] && { echo -e "${RED}Error: No contracts found in Cargo.toml${NC}"; exit 1; }

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  [ -n "$2" ] && echo -e "${RED}Details:\n$2${NC}"
  exit 1
}

test_contract() {
  local contract=$1
  echo "Running unit tests for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  cargo test 2> /tmp/error.log || handle_error "Unit tests failed for $contract" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract unit tests passed${NC}"
}

test_integration() {
  echo "Running integration tests..."
  cd "$TEST_DIR" || handle_error "Tests directory not found"
  curl -s http://localhost:3030 >/dev/null || { echo "Skipping integration tests: NEAR Sandbox not running"; return 0; }
  cargo test 2> /tmp/error.log || handle_error "Integration tests failed" "$(cat /tmp/error.log)"
  echo -e "${GREEN}Integration tests passed${NC}"
}

if [ "$1" = "integration" ]; then
  [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] || handle_error "Tests directory or Cargo.toml not found"
  test_integration
else
  for contract in "${CONTRACTS[@]}"; do
    test_contract "$contract"
  done
  [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && test_integration
fi

echo -e "${GREEN}All tests complete!${NC}"