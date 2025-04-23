#!/bin/bash

# Set the base directory for contracts
BASE_DIR="$(pwd)/contracts"

# Dynamically load contracts from Cargo.toml
CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))
if [ ${#CONTRACTS[@]} -eq 0 ]; then
  echo -e "${RED}Error: No contracts found in Cargo.toml${NC}"
  exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Function to handle errors with detailed output
handle_error() {
  local error_msg=$1
  local error_output=$2
  echo -e "${RED}Error: $error_msg${NC}"
  echo -e "${RED}Details:\n$error_output${NC}"
  exit 1
}

# Clean build artifacts
clean_artifacts() {
  echo "Cleaning build artifacts..."
  cargo clean 2> >(tee /tmp/error.log >&2) || handle_error "Failed to clean artifacts" "$(cat /tmp/error.log)"
  echo -e "${GREEN}Artifacts cleaned${NC}"
}

# Build a single contract
build_contract() {
  local contract=$1
  local build_type=$2
  echo "Building $contract ($build_type)..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found" "Check if $contract exists in $BASE_DIR"
  cargo near build "$build_type" 2> >(tee /tmp/error.log >&2) || handle_error "Failed to build $contract" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract built successfully${NC}"
}

# Generate ABI for a single contract
generate_abi() {
  local contract=$1
  echo "Generating ABI for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found" "Check if $contract exists in $BASE_DIR"
  cargo near abi 2> >(tee /tmp/error.log >&2) || handle_error "Failed to generate ABI for $contract" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract ABI generated successfully${NC}"
}

# Run tests for a single contract
test_contract() {
  local contract=$1
  echo "Running tests for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found" "Check if $contract exists in $BASE_DIR"
  cargo test 2> >(tee /tmp/error.log >&2) || handle_error "Tests failed for $contract" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract tests passed${NC}"
}

# Main script
case "$1" in
  clean)
    clean_artifacts
    ;;
  abi)
    for contract in "${CONTRACTS[@]}"; do
      generate_abi "$contract" &
    done
    wait
    echo -e "${GREEN}ABI generation complete!${NC}"
    ;;
  test)
    for contract in "${CONTRACTS[@]}"; do
      test_contract "$contract" &
    done
    wait
    echo -e "${GREEN}All tests complete!${NC}"
    ;;
  reproducible)
    for contract in "${CONTRACTS[@]}"; do
      build_contract "$contract" "reproducible-wasm" &
    done
    wait
    echo -e "${GREEN}Reproducible build complete!${NC}"
    ;;
  *)
    for contract in "${CONTRACTS[@]}"; do
      build_contract "$contract" "non-reproducible-wasm" &
    done
    wait
    echo -e "${GREEN}Non-reproducible build complete!${NC}"
    ;;
esac