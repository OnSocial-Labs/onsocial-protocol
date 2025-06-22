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
    echo "Generating coverage for $contract..."
    cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
    [ "$VERBOSE" = "1" ] && echo "Running: cargo tarpaulin --out Html --output-dir coverage --output-file tarpaulin-report-$contract.html ..."
    if ! cargo tarpaulin --out Html --output-dir coverage --output-file "tarpaulin-report-$contract.html" --exclude-files 'tests/*' --verbose; then
      echo -e "${ERROR}Tarpaulin failed, falling back to cargo test${RESET}"
      [ "$VERBOSE" = "1" ] && echo "Running: cargo test"
      cargo test || handle_error "Cargo test failed for $contract"
      echo -e "${WARNING}Coverage report not generated, but tests ran${RESET}"
    else
      echo -e "${SUCCESS}Coverage report generated for $contract at coverage/tarpaulin-report-$contract.html${RESET}"
    fi
  else
    echo "Generating coverage for all contracts..."
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      echo "Generating coverage for $contract..."
      cd "$BASE_DIR/$contract" || { ERROR_FLAG=1; continue; }
      [ "$VERBOSE" = "1" ] && echo "Running: cargo tarpaulin --out Html --output-dir coverage --output-file tarpaulin-report-$contract.html ..."
      if ! cargo tarpaulin --out Html --output-dir coverage --output-file "tarpaulin-report-$contract.html" --exclude-files 'tests/*' --verbose; then
        echo -e "${ERROR}Tarpaulin failed for $contract, falling back to cargo test${RESET}"
        [ "$VERBOSE" = "1" ] && echo "Running: cargo test"
        cargo test || ERROR_FLAG=1
        echo -e "${WARNING}Coverage report not generated for $contract, but tests ran${RESET}"
      else
        echo -e "${SUCCESS}Coverage report generated for $contract at coverage/tarpaulin-report-$contract.html${RESET}"
      fi
    done
    echo "Generating coverage for integration tests..."
    cd "$TEST_DIR" || handle_error "Tests directory not found"
    [ "$VERBOSE" = "1" ] && echo "Running: cargo tarpaulin --out Html --output-dir coverage --output-file tarpaulin-report-integration.html ..."
    if ! cargo tarpaulin --out Html --output-dir coverage --output-file "tarpaulin-report-integration.html" --exclude-files 'contracts/*' --verbose; then
      echo -e "${ERROR}Tarpaulin failed for integration tests, falling back to cargo test${RESET}"
      [ "$VERBOSE" = "1" ] && echo "Running: cargo test"
      cargo test || ERROR_FLAG=1
      echo -e "${WARNING}Coverage report not generated for integration tests, but tests ran${RESET}"
    else
      echo -e "${SUCCESS}Coverage report generated for integration tests at coverage/tarpaulin-report-integration.html${RESET}"
    fi
    [ $ERROR_FLAG -eq 1 ] && handle_error "Coverage generation failed for one or more contracts/tests"
  fi
}

case "$1" in
  *)
    test_coverage "$1"
    ;;
esac

echo -e "${SUCCESS}Coverage generation complete!${RESET}"