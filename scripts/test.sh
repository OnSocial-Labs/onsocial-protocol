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

test_unit() {
  local contract=$1
  if [ -n "$contract" ]; then
    echo "Running unit tests for $contract..."
    cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
    [ "$VERBOSE" = "1" ] && echo "Running: cargo test"
    cargo test || handle_error "Unit tests failed for $contract"
    echo -e "${GREEN}$contract unit tests passed${NC}"
  else
    echo "Running unit tests for all contracts..."
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      echo "Running unit tests for $contract..."
      cd "$BASE_DIR/$contract" || { ERROR_FLAG=1; continue; }
      [ "$VERBOSE" = "1" ] && echo "Running: cargo test"
      cargo test || ERROR_FLAG=1 &
    done
    wait
    [ $ERROR_FLAG -eq 1 ] && handle_error "Unit tests failed for one or more contracts"
    echo -e "${GREEN}All unit tests passed${NC}"
  fi
}

test_integration() {
    local module=$1
    echo "Running integration tests${module:+ for $module}..."
    cd "$TEST_DIR" || handle_error "Tests directory not found"
    curl -s http://localhost:3030 >/dev/null || { echo "Skipping integration tests: NEAR Sandbox not running"; return 0; }
    if [ -n "$module" ]; then
        case $module in
            auth-onsocial|ft-wrapper-onsocial|relayer-onsocial|cross-contract)
                # Replace hyphens with underscores for module name
                module_name=$(echo "$module" | tr '-' '_')
                echo "Running cargo test --lib ${module_name}_tests"
                [ "$VERBOSE" = "1" ] && echo "Running: cargo test --lib ${module_name}_tests"
                cargo test --lib "${module_name}_tests" || handle_error "Integration tests failed for $module"
                ;;
            *)
                handle_error "Unknown contract: $module"
                ;;
        esac
    else
        echo "Running cargo test --lib"
        [ "$VERBOSE" = "1" ] && echo "Running: cargo test --lib"
        cargo test --lib || handle_error "Integration tests failed"
    fi
    echo -e "${GREEN}Integration tests passed${NC}"
}

case "$1" in
  unit)
    test_unit "$2"
    ;;
  integration)
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration "$2"
    else
      handle_error "Tests directory or valid Cargo.toml not found"
    fi
    ;;
  *)
    test_unit
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration
    else
      echo "Skipping integration tests: tests/ directory or valid Cargo.toml not found"
    fi
    ;;
esac

echo -e "${GREEN}All tests complete!${NC}"