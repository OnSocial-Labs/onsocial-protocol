#!/bin/bash

BASE_DIR="$(pwd)/contracts"

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

handle_error() {
  echo -e "${ERROR}Error: $1${RESET}"
  [ -n "$2" ] && echo -e "${ERROR}Details:\n$2${RESET}"
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
  echo -e "${ERROR}Error: No contracts found${RESET}"
  exit 1
}

clean_artifacts() {
  echo "Cleaning build artifacts..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo clean"
  cargo clean || handle_error "Failed to clean artifacts"
  echo -e "${SUCCESS}Artifacts cleaned${RESET}"
}

clean_all() {
  echo "Cleaning build artifacts..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo clean"
  cargo clean || handle_error "Failed to clean artifacts"
  echo "Cleaning sandbox data..."
  [ "$VERBOSE" = "1" ] && echo "Running: rm -rf $(pwd)/near-data"
  rm -rf "$(pwd)/near-data" || handle_error "Failed to clean sandbox data"
  echo -e "${SUCCESS}Build artifacts and sandbox data cleaned${RESET}"
}

cargo_update() {
  echo "Cleaning build artifacts..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo clean"
  cargo clean || handle_error "Failed to clean artifacts"
  echo "Updating dependencies..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo update"
  cargo update || handle_error "Failed to update Dependencies"
  echo -e "${SUCCESS}Dependencies updated${RESET}"
}

format_code() {
  echo "Formatting code..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo fmt --all"
  cargo fmt --all || handle_error "Failed to format code"
  echo -e "${SUCCESS}Code formatted successfully${RESET}"
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
    echo -e "${SUCCESS}$contract format cache hit, skipping${RESET}"
    return
  fi

  [ "$VERBOSE" = "1" ] && echo "Running: cargo fmt"
  cargo fmt || handle_error "Failed to format $contract"

  # Save cache
  mkdir -p "$CACHE_DIR"
  touch "$CACHE_FILE"
  echo -e "${SUCCESS}$contract formatted successfully${RESET}"
}

format_all() {
  echo "Formatting all contracts..."
  ERROR_FLAG=0
  for contract in "${CONTRACTS[@]}"; do
    format_contract "$contract" || ERROR_FLAG=1 &
  done
  wait
  [ $ERROR_FLAG -eq 1 ] && handle_error "Formatting failed for one or more contracts"
  echo -e "${SUCCESS}All contracts formatted successfully${RESET}"
}

lint_code() {
  echo "Linting code..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo clippy --all-targets --all-features -- -D warnings"
  cargo clippy --all-targets --all-features -- -D warnings || handle_error "Failed to lint code"
  echo -e "${SUCCESS}Code linted successfully${RESET}"
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
    echo -e "${SUCCESS}$contract lint cache hit, skipping${RESET}"
    return
  fi

  [ "$VERBOSE" = "1" ] && echo "Running: cargo clippy --all-targets --all-features -- -D warnings"
  cargo clippy --all-targets --all-features -- -D warnings || handle_error "Failed to lint $contract"

  # Save cache
  mkdir -p "$CACHE_DIR"
  touch "$CACHE_FILE"
  echo -e "${SUCCESS}$contract linted successfully${RESET}"
}

lint_all() {
  echo "Linting all contracts..."
  ERROR_FLAG=0
  for contract in "${CONTRACTS[@]}"; do
    lint_contract "$contract" || ERROR_FLAG=1 &
  done
  wait
  [ $ERROR_FLAG -eq 1 ] && handle_error "Linting failed for one or more contracts"
  echo -e "${SUCCESS}All contracts linted successfully${RESET}"
}

check_workspace() {
  echo "Checking workspace..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo check --all-targets --all-features"
  cargo check --all-targets --all-features || handle_error "Workspace check failed"
  echo -e "${SUCCESS}Workspace checked successfully${RESET}"
}

audit_deps() {
  echo "Auditing dependencies..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo audit"
  cargo audit || handle_error "Dependency audit failed"
  echo -e "${SUCCESS}Dependencies audited successfully${RESET}"
}

check_deps() {
  echo "Checking dependency tree..."
  [ "$VERBOSE" = "1" ] && echo "Running: cargo tree"
  cargo tree || handle_error "Dependency check failed"
  echo -e "${SUCCESS}Dependency tree checked successfully${RESET}"
}

build_contract() {
  local contract=$1
  local build_type=$2
  echo "Building $contract ($build_type)..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$VERBOSE" = "1" ] && echo "Running: cargo near build $build_type"
  cargo near build "$build_type" || handle_error "Failed to build $contract"
  echo -e "${SUCCESS}$contract built successfully${RESET}"
}

generate_abi() {
  local contract=$1
  echo "Generating ABI for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$NEAR_ENV" = "sandbox" ] && curl -s http://localhost:3030 >/dev/null || handle_error "NEAR Sandbox not running"
  [ "$VERBOSE" = "1" ] && echo "Running: cargo near abi"
  cargo near abi || handle_error "Failed to generate ABI for $contract"
  echo -e "${SUCCESS}$contract ABI generated successfully${RESET}"
}

test_contract() {
  local contract=$1
  echo "Running tests for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  if [ "$NEAR_ENV" = "sandbox" ]; then
    curl -s http://localhost:3030/status >/dev/null || handle_error "NEAR Sandbox not running"
  fi
  [ "$VERBOSE" = "1" ] && echo "Running: cargo test"
  cargo test || handle_error "Tests failed for $contract"
  echo -e "${SUCCESS}$contract tests passed${RESET}"
}

verify_contract() {
  local contract=$1
  echo "Verifying $contract..."
  build_contract "$contract" "reproducible-wasm"
  generate_abi "$contract"
  test_contract "$contract"
  echo -e "${SUCCESS}$contract verified successfully${RESET}"
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
      handle_error "No contract specified. Use CONTRACT=<contract-name> (e.g., relayer-onsocial)"
    fi
    format_contract "$2"
    echo -e "${SUCCESS}Formatting complete for $2${RESET}"
    ;;
  format-all)
    format_all
    echo -e "${SUCCESS}Formatting complete for all contracts${RESET}"
    ;;
  lint)
    lint_code
    ;;
  lint-contract)
    if [ -z "$2" ]; then
      handle_error "No contract specified. Use CONTRACT=<contract-name> (e.g., relayer-onsocial)"
    fi
    lint_contract "$2"
    echo -e "${SUCCESS}Linting complete for $2${RESET}"
    ;;
  lint-all)
    lint_all
    echo -e "${SUCCESS}Linting complete for all contracts${RESET}"
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
      handle_error "No contract specified. Use CONTRACT=<contract-name> (e.g., relayer-onsocial)"
    fi
    # Default to non-reproducible, unless in CI
    build_type="non-reproducible-wasm"
    [ "$CI" = "true" ] && build_type="reproducible-wasm"
    build_contract "$2" "$build_type"
    echo -e "${SUCCESS}Build complete for $2 ($build_type)${RESET}"
    ;;
  verify)
    if [ -n "$2" ]; then
      verify_contract "$2"
      echo -e "${SUCCESS}Verification complete for $2${RESET}"
    else
      clean_artifacts
      ERROR_FLAG=0
      for contract in "${CONTRACTS[@]}"; do
        verify_contract "$contract" || ERROR_FLAG=1 &
      done
      wait
      [ $ERROR_FLAG -eq 1 ] && handle_error "Verification failed for one or more contracts"
      echo -e "${SUCCESS}All contracts verified successfully${RESET}"
    fi
    ;;
  abi)
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      generate_abi "$contract" || ERROR_FLAG=1 &
    done
    wait
    [ $ERROR_FLAG -eq 1 ] && handle_error "ABI generation failed for one or more contracts"
    echo -e "${SUCCESS}ABI generation complete!${RESET}"
    ;;
  test)
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      test_contract "$contract" || ERROR_FLAG=1 &
    done
    wait
    [ $ERROR_FLAG -eq 1 ] && handle_error "Tests failed for one or more contracts"
    echo -e "${SUCCESS}All tests complete!${RESET}"
    ;;
  reproducible)
    ERROR_FLAG=0
    for contract in "${CONTRACTS[@]}"; do
      build_contract "$contract" "reproducible-wasm" || ERROR_FLAG=1 &
    done
    wait
    [ $ERROR_FLAG -eq 1 ] && handle_error "Reproducible build failed for one or more contracts"
    echo -e "${SUCCESS}Reproducible build complete!${RESET}"
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
    echo -e "${SUCCESS}Build complete! ($build_type)${RESET}"
    ;;
esac