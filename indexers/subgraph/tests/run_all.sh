#!/bin/bash
# =============================================================================
# Run All Subgraph Event Tests
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          OnSocial Subgraph Event Test Suite                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_info "Contract: $CONTRACT"
log_info "Signer: $SIGNER"
log_info "Subgraph: $SUBGRAPH_URL"
log_info "Wait time: ${WAIT_TIME}s"
echo ""

check_deps

# Check subgraph health first
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Checking subgraph health..."
check_indexing_errors || exit 1
echo ""

# Run each module's tests
MODULES=("data" "storage" "group" "permission" "contract")

for module in "${MODULES[@]}"; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    script="$SCRIPT_DIR/test_${module}.sh"
    if [ -f "$script" ]; then
        bash "$script" "${1:-query}"  # Default to query-only mode
    else
        log_warn "Script not found: $script"
    fi
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Test Suite Complete                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Usage
show_help() {
    echo "Usage: $0 [mode]"
    echo ""
    echo "Modes:"
    echo "  query    - Query existing data only (default, no writes)"
    echo "  validate - Run field validation tests (no writes)"
    echo "  all      - Run all tests including writes (requires testnet account)"
    echo ""
    echo "Environment variables:"
    echo "  CONTRACT      - Contract to test (default: core.onsocial.testnet)"
    echo "  SIGNER        - Account for signing transactions"
    echo "  SUBGRAPH_URL  - Subgraph endpoint URL"
    echo "  WAIT_TIME     - Seconds to wait for indexing (default: 30)"
    echo ""
    echo "Examples:"
    echo "  $0 query                    # Query-only mode"
    echo "  $0 validate                 # Validate field mapping"
    echo "  $0 all                      # Full test suite"
    echo "  WAIT_TIME=60 $0 all         # With longer wait"
}

case "${1:-}" in
    help|--help|-h)
        show_help
        ;;
esac
