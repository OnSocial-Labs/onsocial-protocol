#!/bin/bash

BASE_DIR="$(pwd)/contracts"
TEST_DIR="$(pwd)/tests"

# Fix permissions for Rust build artifacts
sudo chown -R $(whoami):$(whoami) "$(pwd)/target" 2>/dev/null
CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))

# Enable colored output for cargo and tests
export CARGO_TERM_COLOR=always
export RUST_TEST_THREADS=1
export RUST_BACKTRACE=1
export RUST_LOG_STYLE=always

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

# List of contracts to test and report on
CONTRACT_LIST=("scarces-onsocial" "staking-onsocial" "core-onsocial" "token-onsocial" "cross-contract")

# List of JS/TS/RS packages to test and report on
PACKAGES_LIST=("onsocial-client" "app" "relayer")

# Arrays to store test results
declare -A UNIT_RESULTS
declare -A INTEGRATION_RESULTS
UNIT_FAILURES=0
INTEGRATION_FAILURES=0

handle_error() {
  echo -e "${ERROR}Error: $1${RESET}"
  exit 1
}

# Run integration test with optional verbose/nocapture support
# Usage: run_integration_test "test_filter" "extra_args"
# Returns exit code and sets test_output variable
run_integration_test() {
    local test_filter="$1"
    local extra_args="${2:-}"
    local nocapture_flag=""
    
    if [ "$VERBOSE" = "1" ]; then
        nocapture_flag="--nocapture"
    fi
    
    local test_cmd="NEAR_WORKSPACES_SANDBOX_TIMEOUT_SECS=120 cargo test -p onsocial-integration-tests --release --color always -- $test_filter $extra_args --test-threads=1 $nocapture_flag"
    
    [ "$VERBOSE" = "1" ] && echo "Running: $test_cmd"
    
    if [ "$VERBOSE" = "1" ]; then
        # Stream output directly for verbose mode
        eval "$test_cmd" 2>&1 | grep -v -E "(net\.(ipv4|core)\.|set_kernel_params|ERROR neard::cli)"
        return ${PIPESTATUS[0]}
    else
        # Capture output for filtering
        test_output=$(eval "$test_cmd" 2>&1)
        local exit_code=$?
        echo "$test_output" | grep -v -E "(net\.(ipv4|core)\.|set_kernel_params|ERROR neard::cli)"
        return $exit_code
    fi
}

test_unit() {
    local contract=$1
    local test_name=$2
    local verbose_flag=${3:-0}
    # If VERBOSE=1, treat as verbose_flag
    if [ "$VERBOSE" = "1" ]; then
        verbose_flag=1
    fi
    local ERROR_FLAG=0
    if [ -n "$contract" ]; then
        echo "Running unit tests for $contract${test_name:+ (test: $test_name)}..."
        cd "$BASE_DIR/$contract" || { echo -e "${ERROR}Directory $contract not found${RESET}"; UNIT_RESULTS["$contract"]="Failed"; ((UNIT_FAILURES++)); return 1; }
        
        # Build cargo test command with optional test filter
        local test_cmd="cargo test --release --color always -- --color always"
        if [ -n "$test_name" ]; then
            test_cmd="cargo test --release --color always -- $test_name --color always"
            echo "Running specific test: $test_name"
        fi
        if [ $verbose_flag -eq 1 ]; then
            test_cmd="$test_cmd --nocapture"
        fi
        [ "$VERBOSE" = "1" ] && echo "Running: $test_cmd"
        if ! eval "$test_cmd"; then
            echo -e "${ERROR}Unit tests failed for $contract${test_name:+ (test: $test_name)}${RESET}"
            UNIT_RESULTS["$contract"]="Failed"
            ERROR_FLAG=1
            ((UNIT_FAILURES++))
        else
            echo -e "${SUCCESS}Unit tests passed for $contract${test_name:+ (test: $test_name)}${RESET}"
            UNIT_RESULTS["$contract"]="Passed"
        fi
    else
        echo "Running unit tests for all contracts..."
        for contract in "${CONTRACT_LIST[@]}"; do
            echo "Running unit tests for $contract..."
            cd "$BASE_DIR/$contract" || { echo -e "${ERROR}Directory $contract not found${RESET}"; UNIT_RESULTS["$contract"]="Failed"; ((UNIT_FAILURES++)); ERROR_FLAG=1; continue; }
            local test_cmd="cargo test --release --color always -- --color always"
            if [ $verbose_flag -eq 1 ]; then
                test_cmd="$test_cmd --nocapture"
            fi
            [ "$VERBOSE" = "1" ] && echo "Running: $test_cmd"
            if ! eval "$test_cmd"; then
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
    local test_name=$2
    echo "Running integration tests${module:+ for $module}${test_name:+ (test: $test_name)}..."
    # Build contract in release mode if a specific contract is being tested
    if [ -n "$module" ]; then
        case $module in
            scarces-onsocial|staking-onsocial|core-onsocial|token-onsocial)
                echo "Building $module in release mode for integration test..."
                cd "$BASE_DIR/$module" || { echo -e "${ERROR}Directory $module not found${RESET}"; INTEGRATION_RESULTS["$module"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
                cargo near build non-reproducible-wasm || { echo -e "${ERROR}Release build failed for $module${RESET}"; INTEGRATION_RESULTS["$module"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
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
            cross-contract)
                module_name=$(echo "$module" | tr '-' '_')
                
                # Build test command with optional specific test filter
                local test_filter="${module_name}_tests"
                if [ -n "$test_name" ]; then
                    test_filter="$test_name"
                    echo "Running specific integration test: $test_name"
                fi
                
                [ "$VERBOSE" = "1" ] && echo "Running: cargo test --release --color always -- $test_filter"
                if ! cargo test --release --color always -- "$test_filter"; then
                    echo -e "${ERROR}Integration tests failed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Failed"
                    ((INTEGRATION_FAILURES++))
                    return 1
                else
                    echo -e "${SUCCESS}Integration tests passed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Passed"
                fi
                ;;
            core-onsocial)
                # Run near-workspaces integration tests for core-onsocial
                # Clean up any stale sandbox temp files first
                rm -rf /tmp/.tmp* 2>/dev/null || true
                
                # Run core-onsocial integration tests only
                # Skip tests belonging to other contracts (token, staking, cross-contract)
                local test_filter=""
                if [ -n "$test_name" ]; then
                    test_filter="$test_name"
                    echo "Running specific integration test: $test_name"
                fi
                
                if [ -n "$test_filter" ]; then
                    run_integration_test "$test_filter"
                else
                    # Run core-onsocial tests only: skip cross-contract, token, staking, and scarces test modules
                    run_integration_test "" "--skip cross_contract_tests --skip token_onsocial_tests --skip staking_onsocial_tests --skip staking_gas_profiling_tests --skip scarces::"
                fi
                local test_exit_code=$?
                
                if [ $test_exit_code -ne 0 ]; then
                    echo -e "${ERROR}Integration tests failed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Failed"
                    ((INTEGRATION_FAILURES++))
                    return 1
                else
                    echo -e "${SUCCESS}Integration tests passed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Passed"
                fi
                ;;
            staking-onsocial)
                # Run near-workspaces integration tests for staking-onsocial
                # Clean up any stale sandbox temp files first
                rm -rf /tmp/.tmp* 2>/dev/null || true
                
                # Build mock-ft for FT integration tests
                echo "Building mock-ft contract for staking integration tests..."
                if [ -d "$BASE_DIR/mock-ft" ]; then
                    cd "$BASE_DIR/mock-ft" || { echo -e "${WARNING}mock-ft contract not found, FT tests will be skipped${RESET}"; }
                    cargo near build non-reproducible-wasm || { echo -e "${ERROR}Failed to build mock-ft${RESET}"; }
                fi
                cd "$TEST_DIR" || { echo -e "${ERROR}Tests directory not found${RESET}"; INTEGRATION_RESULTS["${module:-all}"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
                
                # Run staking tests
                local test_filter="staking_onsocial_tests"
                if [ -n "$test_name" ]; then
                    test_filter="$test_name"
                    echo "Running specific integration test: $test_name"
                fi
                
                run_integration_test "$test_filter"
                local test_exit_code=$?
                
                if [ $test_exit_code -ne 0 ]; then
                    echo -e "${ERROR}Integration tests failed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Failed"
                    ((INTEGRATION_FAILURES++))
                    return 1
                else
                    echo -e "${SUCCESS}Integration tests passed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Passed"
                fi
                ;;
            token-onsocial)
                # Run near-workspaces integration tests for token-onsocial
                rm -rf /tmp/.tmp* 2>/dev/null || true
                
                local test_filter="token_onsocial_tests"
                if [ -n "$test_name" ]; then
                    test_filter="$test_name"
                    echo "Running specific integration test: $test_name"
                fi
                
                run_integration_test "$test_filter"
                local test_exit_code=$?
                
                if [ $test_exit_code -ne 0 ]; then
                    echo -e "${ERROR}Integration tests failed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Failed"
                    ((INTEGRATION_FAILURES++))
                    return 1
                else
                    echo -e "${SUCCESS}Integration tests passed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Passed"
                fi
                ;;
            scarces-onsocial)
                # Run near-workspaces integration tests for scarces-onsocial
                rm -rf /tmp/.tmp* 2>/dev/null || true
                
                local test_filter="scarces::"
                if [ -n "$test_name" ]; then
                    test_filter="$test_name"
                    echo "Running specific integration test: $test_name"
                fi
                
                run_integration_test "$test_filter"
                local test_exit_code=$?
                
                if [ $test_exit_code -ne 0 ]; then
                    echo -e "${ERROR}Integration tests failed for $module${test_name:+ (test: $test_name)}${RESET}"
                    INTEGRATION_RESULTS["$module"]="Failed"
                    ((INTEGRATION_FAILURES++))
                    return 1
                else
                    echo -e "${SUCCESS}Integration tests passed for $module${test_name:+ (test: $test_name)}${RESET}"
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
        # Handle specific test name for all contracts
        local test_cmd="cargo test --release --color always"
        if [ -n "$test_name" ]; then
            test_cmd="$test_cmd -- $test_name"
            echo "Running specific integration test: $test_name"
        fi
        
        [ "$VERBOSE" = "1" ] && echo "Running: $test_cmd"
        for contract in "${CONTRACT_LIST[@]}" cross-contract; do
            INTEGRATION_RESULTS["$contract"]="Not Run"
        done
        if ! eval "$test_cmd"; then
            echo -e "${ERROR}Integration tests failed${test_name:+ (test: $test_name)}${RESET}"
            TEST_OUTPUT=$(eval "$test_cmd" 2>&1)
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
            echo -e "${SUCCESS}Integration tests passed${test_name:+ (test: $test_name)}${RESET}"
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
    VERBOSE_FLAG=0
    # Accept --verbose as second or third argument
    if [ "$2" = "--verbose" ] || [ "$3" = "--verbose" ]; then
      VERBOSE_FLAG=1
    fi
    if [ -n "$2" ] && [ "$2" != "--verbose" ]; then
      PKG_PATH="/code/packages/$2"
      if [ -d "$PKG_PATH" ] && [ -f "$PKG_PATH/Cargo.toml" ]; then
        echo "Running unit tests for Rust package: $2..."
        cd /code || { echo -e "${ERROR}Workspace root not found${RESET}"; exit 1; }
        # Support for specific test name in packages
        local test_cmd="cargo test -p \"$2\" --color always --"
        if [ -n "$3" ] && [ "$3" != "--verbose" ]; then
            test_cmd="cargo test -p \"$2\" --color always -- $3"
            echo "Running specific test: $3"
        fi
        if [ $VERBOSE_FLAG -eq 1 ]; then
            test_cmd="$test_cmd --nocapture"
        fi
        eval "$test_cmd"
        exit $?
      else
        test_unit "$2" "$3" $VERBOSE_FLAG
        print_summary "unit"
        exit $?
      fi
    else
      test_unit "" "$3" $VERBOSE_FLAG
      print_summary "unit"
      exit $?
    fi
    ;;
  integration)
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration "$2" "$3"
      print_summary "integration"
      exit $?
    else
      handle_error "Tests directory or valid Cargo.toml not found"
    fi
    ;;
  all)
    UNIT_STATUS=0
    INTEGRATION_STATUS=0
    test_unit "$2" "$3" || UNIT_STATUS=1
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration "$2" "$3" || INTEGRATION_STATUS=1
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
    test_unit "" "$2" || UNIT_STATUS=1
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration "" "$2" || INTEGRATION_STATUS=1
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