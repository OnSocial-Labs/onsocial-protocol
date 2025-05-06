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
    local ERROR_FLAG=0
    if [ -n "$contract" ]; then
        echo "Running unit tests for $contract..."
        cd "$BASE_DIR/$contract" || { echo -e "${RED}Directory $contract not found${NC}"; return 1; }
        [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run"
        if ! cargo nextest run; then
            echo -e "${RED}Unit tests failed for $contract${NC}"
            ERROR_FLAG=1
        else
            echo -e "${GREEN}Unit tests passed for $contract${NC}"
        fi
    else
        echo "Running unit tests for all contracts..."
        for contract in "${CONTRACTS[@]}"; do
            echo "Running unit tests for $contract..."
            cd "$BASE_DIR/$contract" || { echo -e "${RED}Directory $contract not found${NC}"; ERROR_FLAG=1; continue; }
            [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run"
            if ! cargo nextest run; then
                echo -e "${RED}Unit tests failed for $contract${NC}"
                ERROR_FLAG=1
            else
                echo -e "${GREEN}Unit tests passed for $contract${NC}"
            fi
        done
    fi
    return $ERROR_FLAG
}

test_integration() {
    local module=$1
    echo "Running integration tests${module:+ for $module}..."
    cd "$TEST_DIR" || { echo -e "${RED}Tests directory not found${NC}"; return 1; }
    # Retry sandbox check up to 60 times (120 seconds)
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
        return 1
    fi
    if [ -n "$module" ]; then
        case $module in
            auth-onsocial|ft-wrapper-onsocial|relayer-onsocial|cross-contract)
                module_name=$(echo "$module" | tr '-' '_')
                [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run -- ${module_name}_tests"
                if ! cargo nextest run -- "${module_name}_tests"; then
                    echo -e "${RED}Integration tests failed for $module${NC}"
                    return 1
                fi
                ;;
            *)
                echo -e "${RED}Unknown contract: $module${NC}"
                return 1
                ;;
        esac
    else
        [ "$VERBOSE" = "1" ] && echo "Running: cargo nextest run"
        if ! cargo nextest run; then
            echo -e "${RED}Integration tests failed${NC}"
            return 1
        fi
    fi
    echo -e "${GREEN}Integration tests passed${NC}"
    return 0
}

case "$1" in
  unit)
    test_unit "$2"
    exit $?
    ;;
  integration)
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration "$2"
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
      INTEGRATION_STATUS=1
    fi
    if [ $UNIT_STATUS -ne 0 ] || [ $INTEGRATION_STATUS -ne 0 ]; then
      echo -e "${RED}One or more test suites failed (Unit: $UNIT_STATUS, Integration: $INTEGRATION_STATUS)${NC}"
      exit 1
    fi
    ;;
  *)
    UNIT_STATUS=0
    INTEGRATION_STATUS=0
    test_unit || UNIT_STATUS=1
    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/Cargo.toml" ] && cargo check -q --manifest-path "$TEST_DIR/Cargo.toml" 2>/dev/null; then
      test_integration || INTEGRATION_STATUS=1
    else
      echo -e "${RED}Skipping integration tests: tests/ directory or valid Cargo.toml not found${NC}"
      INTEGRATION_STATUS=1
    fi
    if [ $UNIT_STATUS -ne 0 ] || [ $INTEGRATION_STATUS -ne 0 ]; then
      echo -e "${RED}One or more test suites failed (Unit: $UNIT_STATUS, Integration: $INTEGRATION_STATUS)${NC}"
      exit 1
    fi
    ;;
esac

echo -e "${GREEN}All tests complete!${NC}"
exit 0