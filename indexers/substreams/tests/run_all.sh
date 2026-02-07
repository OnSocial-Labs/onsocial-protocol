#!/bin/bash
# =============================================================================
# Run All Hasura Indexer Tests
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       OnSocial Hasura Indexer Test Suite                      ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Hasura:   $HASURA_URL"
echo "║  Contract: $CONTRACT"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

check_deps
check_hasura_health || exit 1

mode="${1:-query}"
contracts="${2:-core staking token}"

if [ "$mode" = "help" ] || [ "$mode" = "-h" ] || [ "$mode" = "--help" ]; then
    echo "Usage: $0 [mode] [contracts]"
    echo ""
    echo "Modes:"
    echo "  query    - Read-only tests (default, safe)"
    echo "  write    - Tests that write to contract (requires signer)"
    echo "  speed    - Indexing speed tests"
    echo "  all      - Run all tests including writes"
    echo ""
    echo "Contracts (space-separated):"
    echo "  core     - Core contract tests (data, storage, group, contract, permission)"
    echo "  staking  - Staking contract tests (events, staker_state, credit_purchases)"
    echo "  token    - Token contract tests (events, balances)"
    echo ""
    echo "Environment variables:"
    echo "  HASURA_URL          - Hasura endpoint (default: http://135.181.110.183:8080)"
    echo "  HASURA_ADMIN_SECRET - Admin secret (required, no default)"
    echo "  CONTRACT            - Contract to test (default: core.onsocial.testnet)"
    echo "  SIGNER              - Account to sign transactions (default: onsocial.testnet)"
    echo ""
    echo "Examples:"
    echo "  $0                       # Query tests, all contracts"
    echo "  $0 query core            # Query tests for core contract only"
    echo "  $0 all                   # Full test suite, all contracts"
    echo "  $0 query 'core staking'  # Query tests for core and staking"
    exit 0
fi

# Run health check first (cross-contract)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Running: test_health.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bash "$SCRIPT_DIR/test_health.sh"

# Run each contract's tests
for contract in $contracts; do
    contract_dir="$SCRIPT_DIR/$contract"
    if [ -d "$contract_dir" ]; then
        for script in "$contract_dir"/test_*.sh; do
            [ -f "$script" ] || continue
            script_name=$(basename "$script")
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "  Running: $contract/$script_name ($mode)"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            bash "$script" "$mode"
        done
    else
        log_warn "Contract test directory not found: $contract_dir"
    fi
done

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    Test Suite Complete                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
