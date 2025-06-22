#!/bin/bash

BASE_DIR="$(pwd)/contracts"
TEST_DIR="$(pwd)/tests"
CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

# List of contracts to test and report on
CONTRACT_LIST=("ft-wrapper-onsocial" "marketplace-onsocial" "staking-onsocial" "social-onsocial" "cross-contract")

# List of JS/TS/RS packages to test and report on
PACKAGES_LIST=("onsocial-js" "app" "relayer")

# Arrays to store test results
declare -A UNIT_RESULTS
declare -A INTEGRATION_RESULTS
UNIT_FAILURES=0
INTEGRATION_FAILURES=0

handle_error() {
  echo -e "${ERROR}Error: $1${RESET}"
  exit 1
}

test_unit() {
    local contract=$1
    local ERROR_FLAG=0
    if [ -n "$contract" ]; then
        echo "Running unit tests for $contract..."
        cd "$BASE_DIR/$contract" || { echo -e "${ERROR}Directory $contract not found${RESET}"; UNIT_RESULTS["$contract"]="Failed"; ((UNIT_FAILURES++)); return 1; }
        [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run --no-fail-fast"
        if ! cargo nextest run --no-fail-fast; then
            echo -e "${ERROR}Unit tests failed for $contract${RESET}"
            UNIT_RESULTS["$contract"]="Failed"
            ERROR_FLAG=1
            ((UNIT_FAILURES++))
        else
            echo -e "${SUCCESS}Unit tests passed for $contract${RESET}"
            UNIT_RESULTS["$contract"]="Passed"
        fi
    else
        echo "Running unit tests for all contracts..."
        for contract in "${CONTRACT_LIST[@]}"; do
            echo "Running unit tests for $contract..."
            cd "$BASE_DIR/$contract" || { echo -e "${ERROR}Directory $contract not found${RESET}"; UNIT_RESULTS["$contract"]="Failed"; ((UNIT_FAILURES++)); ERROR_FLAG=1; continue; }
            [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run --no-fail-fast"
            if ! cargo nextest run --no-fail-fast; then
                echo -e "${ERROR}Unit tests failed for $contract${RESET}"
                UNIT_RESULTS["$contract"]="Failed"
                ERROR_FLAG=1
                ((UNIT_FAILURES++))
            else
                echo -e "${SUCCESS}Unit tests passed for $contract${RESET}"
                UNIT_RESULTS["$contract"]="Passed"
            fi
        done
    fi
    return $ERROR_FLAG
}

test_integration() {
    local module=$1
    echo "Running integration tests${module:+ for $module}..."
    # Build contract in release mode if a specific contract is being tested
    if [ -n "$module" ]; then
        case $module in
            ft-wrapper-onsocial|marketplace-onsocial|staking-onsocial|social-onsocial)
                echo "Building $module in release mode for integration test..."
                cd "$BASE_DIR/$module" || { echo -e "${ERROR}Directory $module not found${RESET}"; INTEGRATION_RESULTS["$module"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
                cargo build --release --target wasm32-unknown-unknown || { echo -e "${ERROR}Release build failed for $module${RESET}"; INTEGRATION_RESULTS["$module"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
                cd "$TEST_DIR" || { echo -e "${ERROR}Tests directory not found${RESET}"; INTEGRATION_RESULTS["${module:-all}"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
                ;;
            *)
                cd "$TEST_DIR" || { echo -e "${ERROR}Tests directory not found${RESET}"; INTEGRATION_RESULTS["${module:-all}"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
                ;;
        esac
    else
        cd "$TEST_DIR" || { echo -e "${ERROR}Tests directory not found${RESET}"; INTEGRATION_RESULTS["${module:-all}"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
    fi
    for i in {1..60}; do
        if curl -s http://localhost:3030/status >/dev/null; then
            echo "Sandbox is ready"
            break
        fi
        echo "Sandbox not ready, retrying ($i/60)..."
        sleep 2
    done
    if ! curl -s http://localhost:3030/status >/dev/null; then
        echo -e "${WARNING}Skipping integration tests: NEAR Sandbox not running or not responding${RESET}"
        echo "Sandbox container status:"
        docker ps | grep near-sandbox || echo "No near-sandbox container running"
        echo "Sandbox logs:"
        docker logs near-sandbox 2>/dev/null || echo "No sandbox logs available"
        INTEGRATION_RESULTS["${module:-all}"]="Failed"
        ((INTEGRATION_FAILURES++))
        return 1
    fi
    if [ -n "$module" ]; then
        case $module in
            ft-wrapper-onsocial|cross-contract)
                module_name=$(echo "$module" | tr '-' '_')
                [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run --no-fail-fast -- ${module_name}_tests"
                if ! cargo nextest run --no-fail-fast -- "${module_name}_tests"; then
                    echo -e "${ERROR}Integration tests failed for $module${RESET}"
                    INTEGRATION_RESULTS["$module"]="Failed"
                    ((INTEGRATION_FAILURES++))
                    return 1
                else
                    echo -e "${SUCCESS}Integration tests passed for $module${RESET}"
                    INTEGRATION_RESULTS["$module"]="Passed"
                fi
                ;;
            *)
                echo -e "${ERROR}Unknown contract: $module${RESET}"
                INTEGRATION_RESULTS["$module"]="Failed"
                ((INTEGRATION_FAILURES++))
                return 1
                ;;
        esac
    else
        [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run --no-fail-fast"
        for contract in "${CONTRACT_LIST[@]}" cross-contract; do
            INTEGRATION_RESULTS["$contract"]="Not Run"
        done
        if ! cargo nextest run --no-fail-fast; then
            echo -e "${ERROR}Integration tests failed${RESET}"
            TEST_OUTPUT=$(cargo nextest run --no-capture --no-fail-fast 2>&1)
            for contract in "${CONTRACT_LIST[@]}"; do
                module_name=$(echo "$contract" | tr '-' '_')
                if echo "$TEST_OUTPUT" | grep -q "FAIL.*${module_name}_tests"; then
                    INTEGRATION_RESULTS["$contract"]="Failed"
                    ((INTEGRATION_FAILURES++))
                else
                    INTEGRATION_RESULTS["$contract"]="Passed"
                fi
            done
            return 1
        else
            echo -e "${SUCCESS}Integration tests passed${RESET}"
            for contract in "${CONTRACT_LIST[@]}"; do
                INTEGRATION_RESULTS["$contract"]="Passed"
            done
        fi
    fi
    return 0
}

print_summary() {
    echo -e "\n NEAR Contract Test Summary\n"
    # Table header with box-drawing characters
    printf "┌──────────────────────┬────────────────────────────┬────────────────────────────┐\n"
    printf "│ %-20s │ %-26s │ %-26s │\n" "Contract" "Unit Tests" "Integration Tests"
    printf "├──────────────────────┼────────────────────────────┼────────────────────────────┤\n"

    # Use tput for color codes if possible, else fallback to ANSI codes
    if [ -n "$TERM" ] && tput setaf 1 &>/dev/null; then
        BOLD_GREEN=$(tput bold; tput setaf 2)
        BOLD_RED=$(tput bold; tput setaf 1)
        BOLD_YELLOW=$(tput bold; tput setaf 3)
        RESET=$(tput sgr0)
    else
        BOLD_GREEN=$'\033[1;32m'
        BOLD_RED=$'\033[1;31m'
        BOLD_YELLOW=$'\033[1;33m'
        RESET=$'\033[0m'
    fi
    for contract in "${CONTRACT_LIST[@]}"; do
        UNIT_STATUS="${UNIT_RESULTS[$contract]:-Not Run}"
        INTEGRATION_STATUS="${INTEGRATION_RESULTS[$contract]:-Not Run}"
        # Pad plain status first and set color
        if [ "$UNIT_STATUS" = "Passed" ]; then
            UNIT_COLOR="$BOLD_GREEN"
            PADDED_UNIT="PASSED   "
        elif [ "$UNIT_STATUS" = "Failed" ]; then
            UNIT_COLOR="$BOLD_RED"
            PADDED_UNIT="FAILED   "
        else
            UNIT_COLOR="$BOLD_YELLOW"
            PADDED_UNIT="NOT RUN  "
        fi
        if [ "$INTEGRATION_STATUS" = "Passed" ]; then
            INT_COLOR="$BOLD_GREEN"
            PADDED_INT="PASSED   "
        elif [ "$INTEGRATION_STATUS" = "Failed" ]; then
            INT_COLOR="$BOLD_RED"
            PADDED_INT="FAILED   "
        else
            INT_COLOR="$BOLD_YELLOW"
            PADDED_INT="NOT RUN  "
        fi
        # Print the row with color only on the status fields
        printf "│ %-20s │ %s%-26s%s │ %s%-26s%s │\n" \
            "${contract:0:20}" \
            "$UNIT_COLOR" "$PADDED_UNIT" "$RESET" \
            "$INT_COLOR" "$PADDED_INT" "$RESET"
    done
    printf "└──────────────────────┴────────────────────────────┴────────────────────────────┘\n"

    # Minimal summary
    if [ $UNIT_FAILURES -ne 0 ] || [ $INTEGRATION_FAILURES -ne 0 ]; then
        echo -e "\nTest Failures: Unit ($UNIT_FAILURES), Integration ($INTEGRATION_FAILURES)"
        exit 1
    else
        echo -e "\nAll executed tests passed successfully"
        exit 0
    fi
}

case "$1" in
  unit)
    if [ -n "$2" ]; then
      PKG_PATH="/code/packages/$2"
      if [ -d "$PKG_PATH" ] && [ -f "$PKG_PATH/Cargo.toml" ]; then
        echo "Running unit tests for Rust package: $2..."
        cd /code || { echo -e "${ERROR}Workspace root not found${RESET}"; exit 1; }
        cargo test -p "$2" -- --nocapture
        exit $?
      else
        test_unit "$2"
        print_summary "unit"
        exit $?
      fi
    else
      test_unit
      print_summary "unit"
      exit $?
    fi
    ;;
  integration)
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration "$2"
      print_summary "integration"
      exit $?
    else
      handle_error "Tests directory or valid Cargo.toml not found"
    fi
    ;;
  all)
    UNIT_STATUS=0
    INTEGRATION_STATUS=0
    test_unit "$2" || UNIT_STATUS=1
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration "$2" || INTEGRATION_STATUS=1
    else
      echo -e "${ERROR}Skipping integration tests: tests/ directory or valid Cargo.toml not found${RESET}"
      INTEGRATION_RESULTS["all"]="Failed"
      ((INTEGRATION_FAILURES++))
      INTEGRATION_STATUS=1
    fi
    print_summary "all"
    exit $?
    ;;
  *)
    UNIT_STATUS=0
    INTEGRATION_STATUS=0
    test_unit || UNIT_STATUS=1
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration || INTEGRATION_STATUS=1
    else
      echo -e "${ERROR}Skipping integration tests: tests/ directory or valid Cargo.toml not found${RESET}"
      INTEGRATION_RESULTS["all"]="Failed"
      ((INTEGRATION_FAILURES++))
      INTEGRATION_STATUS=1
    fi
    print_summary "all"
    exit $?
    ;;
esac