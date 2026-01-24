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
modules="${2:-data storage group contract permission}"

if [ "$mode" = "help" ] || [ "$mode" = "-h" ] || [ "$mode" = "--help" ]; then
    echo "Usage: $0 [mode] [modules]"
    echo ""
    echo "Modes:"
    echo "  query    - Read-only tests (default, safe)"
    echo "  write    - Tests that write to contract (requires signer)"
    echo "  speed    - Indexing speed tests"
    echo "  all      - Run all tests including writes"
    echo ""
    echo "Modules (space-separated):"
    echo "  data       - DATA_UPDATE tests"
    echo "  storage    - STORAGE_UPDATE tests"
    echo "  group      - GROUP_UPDATE tests"
    echo "  contract   - CONTRACT_UPDATE tests"
    echo "  permission - PERMISSION_UPDATE tests"
    echo ""
    echo "Environment variables:"
    echo "  HASURA_URL          - Hasura endpoint (default: http://135.181.110.183:8080)"
    echo "  HASURA_ADMIN_SECRET - Admin secret (required, no default)"
    echo "  CONTRACT            - Contract to test (default: core.onsocial.testnet)"
    echo "  SIGNER              - Account to sign transactions (default: onsocial.testnet)"
    echo ""
    echo "Examples:"
    echo "  $0                       # Query tests only"
    echo "  $0 query data            # Query tests for data module only"
    echo "  $0 all                   # Full test suite"
    echo "  $0 write data storage    # Write tests for data and storage"
    exit 0
fi

# Run each module's tests
for module in $modules; do
    script="$SCRIPT_DIR/test_${module}.sh"
    if [ -f "$script" ]; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Running: test_${module}.sh ($mode)"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        bash "$script" "$mode"
    else
        log_warn "Test script not found: $script"
    fi
done

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    Test Suite Complete                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
