#!/bin/bash

BASE_DIR="$(pwd)/contracts"
TEST_DIR="$(pwd)/tests"
CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Arrays to store test results
declare -A UNIT_RESULTS
declare -A INTEGRATION_RESULTS
UNIT_FAILURES=0
INTEGRATION_FAILURES=0

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  exit 1
}

test_unit() {
    local contract=$1
    local ERROR_FLAG=0
    if [ -n "$contract" ]; then
        echo "Running unit tests for $contract..."
        cd "$BASE_DIR/$contract" || { echo -e "${RED}Directory $contract not found${NC}"; UNIT_RESULTS["$contract"]="Failed"; ((UNIT_FAILURES++)); return 1; }
        [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run --no-fail-fast"
        if ! cargo nextest run --no-fail-fast; then
            echo -e "${RED}Unit tests failed for $contract${NC}"
            UNIT_RESULTS["$contract"]="Failed"
            ERROR_FLAG=1
            ((UNIT_FAILURES++))
        else
            echo -e "${GREEN}Unit tests passed for $contract${NC}"
            UNIT_RESULTS["$contract"]="Passed"
        fi
    else
        echo "Running unit tests for all contracts..."
        for contract in "${CONTRACTS[@]}"; do
            echo "Running unit tests for $contract..."
            cd "$BASE_DIR/$contract" || { echo -e "${RED}Directory $contract not found${NC}"; UNIT_RESULTS["$contract"]="Failed"; ((UNIT_FAILURES++)); ERROR_FLAG=1; continue; }
            [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run --no-fail-fast"
            if ! cargo nextest run --no-fail-fast; then
                echo -e "${RED}Unit tests failed for $contract${NC}"
                UNIT_RESULTS["$contract"]="Failed"
                ERROR_FLAG=1
                ((UNIT_FAILURES++))
            else
                echo -e "${GREEN}Unit tests passed for $contract${NC}"
                UNIT_RESULTS["$contract"]="Passed"
            fi
        done
    fi
    return $ERROR_FLAG
}

test_integration() {
    local module=$1
    echo "Running integration tests${module:+ for $module}..."
    cd "$TEST_DIR" || { echo -e "${RED}Tests directory not found${NC}"; INTEGRATION_RESULTS["${module:-all}"]="Failed"; ((INTEGRATION_FAILURES++)); return 1; }
    for i in {1..60}; do
        if curl -s http://localhost:3030/status >/dev/null; then
            echo "Sandbox is ready"
            break
        fi
        echo "Sandbox not ready, retrying ($i/60)..."
        sleep 2
    done
    if ! curl -s http://localhost:3030/status >/dev/null; then
        echo -e "${RED}Skipping integration tests: NEAR Sandbox not running or not responding${NC}"
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
            ft-wrapper-onsocial|relayer-onsocial|cross-contract)
                module_name=$(echo "$module" | tr '-' '_')
                [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run --no-fail-fast -- ${module_name}_tests"
                if ! cargo nextest run --no-fail-fast -- "${module_name}_tests"; then
                    echo -e "${RED}Integration tests failed for $module${NC}"
                    INTEGRATION_RESULTS["$module"]="Failed"
                    ((INTEGRATION_FAILURES++))
                    return 1
                else
                    echo -e "${GREEN}Integration tests passed for $module${NC}"
                    INTEGRATION_RESULTS["$module"]="Passed"
                fi
                ;;
            *)
                echo -e "${RED}Unknown contract: $module${NC}"
                INTEGRATION_RESULTS["$module"]="Failed"
                ((INTEGRATION_FAILURES++))
                return 1
                ;;
        esac
    else
        [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run --no-fail-fast"
        for contract in "${CONTRACTS[@]}" cross-contract; do
            INTEGRATION_RESULTS["$contract"]="Not Run"
        done
        if ! cargo nextest run --no-fail-fast; then
            echo -e "${RED}Integration tests failed${NC}"
            TEST_OUTPUT=$(cargo nextest run --no-capture --no-fail-fast 2>&1)
            for contract in "${CONTRACTS[@]}" cross-contract; do
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
            echo -e "${GREEN}Integration tests passed${NC}"
            for contract in "${CONTRACTS[@]}" cross-contract; do
                INTEGRATION_RESULTS["$contract"]="Passed"
            done
        fi
    fi
    return 0
}

print_summary() {
    echo -e "\n### NEAR Contract Test Summary\n"
    echo "Environment: NEAR Sandbox"
    echo "Command: test $1${CONTRACT:+ (CONTRACT=$CONTRACT)}"
    echo -e "\n#### Test Results\n"
    
    # Print table header
    printf "| %-19s | %-25s | %-25s |\n" "Contract" "Unit Tests" "Integration Tests"
    printf "| %-19s | %-25s | %-25s |\n" "-------------------" "-------------------------" "-------------------------"

    TOTAL_UNIT_TESTS=0
    TOTAL_INTEGRATION_TESTS=0
    TOTAL_UNIT_PASSED=0
    TOTAL_INTEGRATION_PASSED=0
    TOTAL_UNIT_FAILED=0
    TOTAL_INTEGRATION_FAILED=0
    ISSUES=()

    if [ -n "$CONTRACT" ] && [ "$CONTRACT" != "cross-contract" ]; then
        DISPLAY_CONTRACTS=("$CONTRACT")
        if [ "$1" = "integration" ] || [ "$1" = "all" ]; then
            DISPLAY_CONTRACTS+=("cross-contract")
        fi
    else
        DISPLAY_CONTRACTS=("${CONTRACTS[@]}" "cross-contract")
    fi

    for contract in "${DISPLAY_CONTRACTS[@]}"; do
        if [ "$contract" = "cross-contract" ] && [ "$1" != "integration" ] && [ "$1" != "all" ]; then
            continue
        fi

        UNIT_STATUS="${UNIT_RESULTS[$contract]:-Not Run}"
        INTEGRATION_STATUS="${INTEGRATION_RESULTS[$contract]:-Not Run}"

        # Only show pass/fail, do not show fake test counts
        UNIT_TEST_STR="- Not Run"
        if [ "$UNIT_STATUS" = "Passed" ]; then
            UNIT_TEST_STR="✅ Passed"
        elif [ "$UNIT_STATUS" = "Failed" ]; then
            UNIT_TEST_STR="❌ Failed"
            ISSUES+=("$contract: Unit test(s) failed. Check test-all.log or run \`make test-unit CONTRACT=$contract\` for details.")
        fi

        INTEGRATION_TEST_STR="- Not Run"
        if [ "$INTEGRATION_STATUS" = "Passed" ]; then
            INTEGRATION_TEST_STR="✅ Passed"
        elif [ "$INTEGRATION_STATUS" = "Failed" ]; then
            INTEGRATION_TEST_STR="❌ Failed"
            ISSUES+=("$contract: Integration test(s) failed. Check test-all.log or run \`make test-integration CONTRACT=$contract\` for details.")
        fi

        printf "| %-19s | %-25s | %-25s |\n" "$contract" "$UNIT_TEST_STR" "$INTEGRATION_TEST_STR"
    done

    echo -e "\n#### Summary\n"
    echo "- Unit Tests: pass/fail status only (test counts not shown; see test-all.log for details)"
    echo "- Integration Tests: pass/fail status only (test counts not shown; see test-all.log for details)"

    if [ ${#ISSUES[@]} -gt 0 ]; then
        echo -e "\nIssues Found:"
        for issue in "${ISSUES[@]}"; do
            echo "- $issue"
        done
    fi

    echo -e "\nNext Steps:"
    echo "- Review test-all.log for detailed error messages."
    echo "- Debug failing tests using the commands above."
    echo "- Ensure sandbox is running (\`make start-sandbox\`) before retesting."

    if [ $UNIT_FAILURES -ne 0 ] || [ $INTEGRATION_FAILURES -ne 0 ]; then
        echo -e "\n${RED}Test Failures: Unit ($UNIT_FAILURES), Integration ($INTEGRATION_FAILURES)${NC}"
        exit 1
    else
        echo -e "\n${GREEN}All executed tests passed successfully${NC}"
        exit 0
    fi
}

case "$1" in
  unit)
    test_unit "$2"
    print_summary "unit"
    exit $?
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
      echo -e "${RED}Skipping integration tests: tests/ directory or valid Cargo.toml not found${NC}"
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
      echo -e "${RED}Skipping integration tests: tests/ directory or valid Cargo.toml not found${NC}"
      INTEGRATION_RESULTS["all"]="Failed"
      ((INTEGRATION_FAILURES++))
      INTEGRATION_STATUS=1
    fi
    print_summary "all"
    exit $?
    ;;
esac