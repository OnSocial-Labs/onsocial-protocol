#!/bin/bash

BASE_DIR="$(pwd)/contracts"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  [ -n "$2" ] && echo -e "${RED}Details:\n$2${NC}"
  exit 1
}

# Detect contracts from Cargo.toml or fallback to scanning directories
if [ -f Cargo.toml ]; then
  CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))
fi

# Fallback: look for contracts with Cargo.toml files in subfolders
if [ ${#CONTRACTS[@]} -eq 0 ]; then
  CONTRACTS=($(find contracts -mindepth 2 -name Cargo.toml | sed 's|contracts/||;s|/Cargo.toml||'))
fi

[ ${#CONTRACTS[@]} -eq 0 ] && {
  echo -e "${RED}Error: No contracts found${NC}"
  exit 1
}

clean_artifacts() {
  echo "Cleaning build artifacts..."
  cargo clean 2> /tmp/error.log || handle_error "Failed to clean artifacts" "$(cat /tmp/error.log)"
  echo -e "${GREEN}Artifacts cleaned${NC}"
}

build_contract() {
  local contract=$1
  local build_type=$2
  echo "Building $contract ($build_type)..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  cargo near build "$build_type" 2> /tmp/error.log || handle_error "Failed to build $contract" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract built successfully${NC}"
}

generate_abi() {
  local contract=$1
  echo "Generating ABI for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$NEAR_ENV" = "sandbox" ] && curl -s http://localhost:3030 >/dev/null || handle_error "NEAR Sandbox not running"
  cargo near abi 2> /tmp/error.log || handle_error "Failed to generate ABI for $contract" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract ABI generated successfully${NC}"
}

test_contract() {
  local contract=$1
  echo "Running tests for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$NEAR_ENV" = "sandbox" ] && curl -s http://localhost:3030 >/dev/null || handle_error "NEAR Sandbox not running"
  cargo test 2> /tmp/error.log || handle_error "Tests failed for $contract" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract tests passed${NC}"
}

verify_contract() {
  local contract=$1
  echo "Verifying $contract..."
  build_contract "$contract" "reproducible-wasm"
  generate_abi "$contract"
  test_contract "$contract"
  echo -e "${GREEN}$contract verified successfully${NC}"
}

case "$1" in
  clean)
    clean_artifacts
    ;;
  abi)
    for contract in "${CONTRACTS[@]}"; do
      generate_abi "$contract"
    done
    echo -e "${GREEN}ABI generation complete!${NC}"
    ;;
  test)
    for contract in "${CONTRACTS[@]}"; do
      test_contract "$contract"
    done
    echo -e "${GREEN}All tests complete!${NC}"
    ;;
  reproducible)
    for contract in "${CONTRACTS[@]}"; do
      build_contract "$contract" "reproducible-wasm"
    done
    echo -e "${GREEN}Reproducible build complete!${NC}"
    ;;
  verify)
    clean_artifacts
    for contract in "${CONTRACTS[@]}"; do
      verify_contract "$contract"
    done
    echo -e "${GREEN}All contracts verified successfully!${NC}"
    ;;
  *)
    # Default to non-reproducible, unless in CI
    build_type="non-reproducible-wasm"
    [ "$CI" = "true" ] && build_type="reproducible-wasm"
    for contract in "${CONTRACTS[@]}"; do
      build_contract "$contract" "$build_type"
    done
    echo -e "${GREEN}Build complete! ($build_type)${NC}"
    ;;
esac
