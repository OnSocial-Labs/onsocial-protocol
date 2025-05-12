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
  [ "$VERBOSE" = "1" ] && echo "Running: cargo clean"
  cargo clean || handle_error "Failed to clean artifacts"
  echo -e "${GREEN}Artifacts cleaned${NC}"
}

clean_all() {
  echo "Cleaning build artifacts..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo clean"
  cargo clean || handle_error "Failed to clean artifacts"
  echo "Cleaning sandbox data..."
  [ "$VERBOSE" = "1" ] && echo "Running: rm -rf $(pwd)/near-data"
  rm -rf "$(pwd)/near-data" || handle_error "Failed to clean sandbox data"
  echo -e "${GREEN}Build artifacts and sandbox data cleaned${NC}"
}

cargo_update() {
  echo "Cleaning build artifacts..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo clean"
  cargo clean || handle_error "Failed to clean artifacts"
  echo "Updating dependencies..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo update"
  cargo update || handle_error "Failed to update Dependencies"
  echo -e "${GREEN}Dependencies updated${NC}"
}

format_code() {
  echo "Formatting code..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo fmt --all"
  cargo fmt --all || handle_error "Failed to format code"
  echo -e "${GREEN}Code formatted successfully${NC}"
}

format_contract() {
  local contract=$1
  echo "Formatting $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"

  # Generate cache key
  CACHE_KEY=$(find src -type f -exec sha256sum {} \; | sort | sha256sum | awk '{print $1}')
  CACHE_DIR="$BASE_DIR/.cache"
  CACHE_FILE="$CACHE_DIR/format-$contract-$CACHE_KEY"

  if [ -f "$CACHE_FILE" ]; then
    echo -e "${GREEN}$contract format cache hit, skipping${NC}"
    return
  fi

  [ "$VERBOSE" = "1" ] && echo "Running: cargo fmt"
  cargo fmt || handle_error "Failed to format $contract"

  # Save cache
  mkdir -p "$CACHE_DIR"
  touch "$CACHE_FILE"
  echo -e "${GREEN}$contract formatted successfully${NC}"
}

format_all() {
  echo "Formatting all contracts..."
  ERROR_FLAG=0
  for contract in "${CONTRACTS[@]}"; do
    format_contract "$contract" || ERROR_FLAG=1 &
  done
  wait
  [ $ERROR_FLAG -eq 1 ] && handle_error "Formatting failed for one or more contracts"
  echo -e "${GREEN}All contracts formatted successfully${NC}"
}

lint_code() {
  echo "Linting code..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo clippy --all-targets --all-features -- -D warnings"
  cargo clippy --all-targets --all-features -- -D warnings || handle_error "Failed to lint code"
  echo -e "${GREEN}Code linted successfully${NC}"
}

lint_contract() {
  local contract=$1
  echo "Linting $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"

  # Generate cache key
  CACHE_KEY=$(find src -type f -exec sha256sum {} \; | sort | sha256sum | awk '{print $1}')
  CACHE_DIR="$BASE_DIR/.cache"
  CACHE_FILE="$CACHE_DIR/lint-$contract-$CACHE_KEY"

  if [ -f "$CACHE_FILE" ]; then
    echo -e "${GREEN}$contract lint cache hit, skipping${NC}"
    return
  fi

  [ "$VERBOSE" = "1" ] && echo "Running: cargo clippy --all-targets --all-features -- -D warnings"
  cargo clippy --all-targets --all-features -- -D warnings || handle_error "Failed to lint $contract"

  # Save cache
  mkdir -p "$CACHE_DIR"
  touch "$CACHE_FILE"
  echo -e "${GREEN}$contract linted successfully${NC}"
}

lint_all() {
  echo "Linting all contracts..."
  ERROR_FLAG=0
  for contract in "${CONTRACTS[@]}"; do
    lint_contract "$contract" || ERROR_FLAG=1 &
  done
  wait
  [ $ERROR_FLAG -eq 1 ] && handle_error "Linting failed for one or more contracts"
  echo -e "${GREEN}All contracts linted successfully${NC}"
}

check_workspace() {
  echo "Checking workspace..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo check --all-targets --all-features"
  cargo check --all-targets --all-features || handle_error "Workspace check failed"
  echo -e "${GREEN}Workspace checked successfully${NC}"
}

audit_deps() {
  echo "Auditing dependencies..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo audit"
  cargo audit || handle_error "Dependency audit failed"
  echo -e "${GREEN}Dependencies audited successfully${NC}"
}

check_deps() {
  echo "Checking dependency tree..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo tree"
  cargo tree || handle_error "Dependency check failed"
  echo -e "${GREEN}Dependency tree checked successfully${NC}"
}

build_contract() {
  local contract=$1
  local build_type=$2
  echo "Building $contract ($build_type)..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$VERBOSE" = "1" ] && echo "Running: cargo near build $build_type"
  cargo near build "$build_type" || handle_error "Failed to build $contract"
  echo -e "${GREEN}$contract built successfully${NC}"
}

generate_abi() {
  local contract=$1
  echo "Generating ABI for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$NEAR_ENV" = "sandbox" ] && curl -s http://localhost:3030 >/dev/null || handle_error "NEAR Sandbox not running"
  [ "$VERBOSE" = "1" ] && echo "Running: cargo near abi"
  cargo near abi || handle_error "Failed to generate ABI for $contract"
  echo -e "${GREEN}$contract ABI generated successfully${NC}"
}

test_contract() {
  local contract=$1
  echo "Running tests for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$NEAR_ENV" = "sandbox" ] && curl -s http://localhost:3030 >/dev/null || handle_error "NEAR Sandbox not running"
  [ "$VERBOSE" = "1" ] && echo "Running: cargo test"
  cargo test || handle_error "Tests failed for $contract"
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
  clean-all)
    clean_all
    ;;
  cargo-update)
    cargo_update
    ;;
  format)
    format_code
    ;;
  format-contract)
    if [ -z "$2" ]; then
      handle_error "No contract specified. Use CONTRACT=<contract-name> (e.g., auth-onsocial)"
    fi
    format_contract "$2"
    echo -e "${GREEN}Formatting complete for $2${NC}"
    ;;
  format-all)
    format_all
    echo -e "${GREEN}Formatting complete for all contracts${NC}"
    ;;
  lint)
    lint_code
    ;;
  lint-contract)
    if [ -z "$2" ]; then
      handle_error "No contract specified. Use CONTRACT=<contract-name> (e.g., auth-onsocial)"
    fi
    lint_contract "$2"
    echo -e "${GREEN}Linting complete for $2${NC}"
    ;;
  lint-all)
    lint_all
    echo -e "${GREEN}Linting complete for all contracts${NC}"
    ;;
  check)
    check_workspace
    ;;
  audit)
    audit_deps
    ;;
  check-deps)
    check_deps
    ;;
  build-contract)
    if [ -z "$2" ]; then
      handle_error "No contract specified. Use CONTRACT=<contract-name> (e.g., auth-onsocial)"
    fi
    # Default to non-reproducible, unless in CI
    build_type="non-reproducible-wasm"
    [ "$CI" = "true" ] && build_type="reproducible-wasm"
    build_contract "$2" "$build_type"
    echo -e "${GREEN}Build complete for $2 ($build_type)${NC}"
    ;;
  verify)
    if [ -n "$2" ]; then
      verify_contract "$2"
      echo -e "${GREEN}Verification complete for $2${NC}"
    else
      clean_artifacts
      ERROR_FLAG=0
      for contract in "${CONTRACTS[@]}"; do
        verify_contract "$contract" || ERROR_FLAG=1 &
      done
      wait
      [ $ERROR_FLAG -eq 1 ] && handle_error "Verification failed for one or more contracts"
      echo -e "${GREEN}All contracts verified successfully${NC}"
    fi
    ;;
  abi)
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      generate_abi "$contract" || ERROR_FLAG=1 &
    done
    wait
    [ $ERROR_FLAG -eq 1 ] && handle_error "ABI generation failed for one or more contracts"
    echo -e "${GREEN}ABI generation complete!${NC}"
    ;;
  test)
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      test_contract "$contract" || ERROR_FLAG=1 &
    done
    wait
    [ $ERROR_FLAG -eq 1 ] && handle_error "Tests failed for one or more contracts"
    echo -e "${GREEN}All tests complete!${NC}"
    ;;
  reproducible)
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      build_contract "$contract" "reproducible-wasm" || ERROR_FLAG=1 &
    done
    wait
    [ $ERROR_FLAG -eq 1 ] && handle_error "Reproducible build failed for one or more contracts"
    echo -e "${GREEN}Reproducible build complete!${NC}"
    ;;
  *)
    # Default to non-reproducible, unless in CI
    build_type="non-reproducible-wasm"
    [ "$CI" = "true" ] && build_type="reproducible-wasm"
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      build_contract "$contract" "$build_type" || ERROR_FLAG=1 &
    done
    wait
    [ $ERROR_FLAG -eq 1 ] && handle_error "Build failed for one or more contracts"
    echo -e "${GREEN}Build complete! ($build_type)${NC}"
    ;;
esac