#!/bin/bash

BASE_DIR="$(pwd)/contracts"
TEST_DIR="$(pwd)/tests"

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

handle_error() {
  echo -e "${ERROR}Error: $1${RESET}"
  exit 1
}

# Detect contracts from Cargo.toml
if [ -f Cargo.toml ]; then
  CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))
fi

[ ${#CONTRACTS[@]} -eq 0 ] && {
  echo -e "${ERROR}Error: No contracts found${RESET}"
  exit 1
}

test_coverage() {
  local contract=$1
  mkdir -p coverage || handle_error "Failed to create coverage directory"
  if [ -n "$contract" ]; then
    echo "Running tests with coverage info for $contract..."
    cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
    [ "$VERBOSE" = "1" ] && echo "Running: cargo test --release"
    if ! cargo test --release; then
      echo -e "${ERROR}Tests failed for $contract${RESET}"
      handle_error "Tests failed for $contract"
    else
      echo -e "${SUCCESS}Tests completed successfully for $contract${RESET}"
      echo -e "${WARNING}Note: For detailed coverage reports, consider using cargo-llvm-cov or tarpaulin${RESET}"
    fi
  else
    echo "Running tests for all contracts..."
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      echo "Running tests for $contract..."
      cd "$BASE_DIR/$contract" || { ERROR_FLAG=1; continue; }
      [ "$VERBOSE" = "1" ] && echo "Running: cargo test --release"
      if ! cargo test --release; then
        echo -e "${ERROR}Tests failed for $contract${RESET}"
        ERROR_FLAG=1
      else
        echo -e "${SUCCESS}Tests completed successfully for $contract${RESET}"
      fi
    done
    echo "Running integration tests..."
    cd "$TEST_DIR" || handle_error "Tests directory not found"
    [ "$VERBOSE" = "1" ] && echo "Running: cargo test --release"
    if ! cargo test --release; then
      echo -e "${ERROR}Integration tests failed${RESET}"
      ERROR_FLAG=1
    else
      echo -e "${SUCCESS}Integration tests completed successfully${RESET}"
    fi
    [ $ERROR_FLAG -eq 1 ] && handle_error "Tests failed for one or more contracts"
    echo -e "${WARNING}Note: For detailed coverage reports, consider using cargo-llvm-cov or tarpaulin${RESET}"
  fi
}

case "$1" in
  *)
    test_coverage "$1"
    ;;
esac

echo -e "${SUCCESS}Test execution complete!${RESET}"