#!/usr/bin/env bash
# =============================================================================
# run_sinks.sh — Launch OnSocial Substreams SQL sink (combined mode)
# =============================================================================
# Runs a single combined sink that indexes all 5 contracts in one stream,
# staying within the StreamingFast Scaling plan's concurrent stream limit.
#
# Usage:
#   SUBSTREAMS_ENDPOINT=... DATABASE_URL=... ./run_sinks.sh          # testnet
#   NEAR_NETWORK=mainnet SUBSTREAMS_ENDPOINT=... ./run_sinks.sh      # mainnet
#   MODE=per-contract ./run_sinks.sh                                 # legacy 5-sink mode
#
# Environment:
#   SUBSTREAMS_ENDPOINT  (required) e.g. mainnet.near.streamingfast.io:443
#   DATABASE_URL         (optional) default: postgres://onsocial:onsocial@localhost:5432/onsocial
#   NEAR_NETWORK         (optional) "testnet" (default) or "mainnet"
#   MODE                 (optional) "combined" (default) or "per-contract"
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENDPOINT="${SUBSTREAMS_ENDPOINT:?Set SUBSTREAMS_ENDPOINT (e.g. mainnet.near.streamingfast.io:443)}"
DB_URL="${DATABASE_URL:-postgres://onsocial:onsocial@localhost:5432/onsocial}"
NETWORK="${NEAR_NETWORK:-testnet}"
MODE="${MODE:-combined}"

# Extract version from substreams.yaml
VERSION=$(grep -m1 'version:' "$SCRIPT_DIR/substreams.yaml" | awk '{print $2}')

# Set contract suffix based on network
if [ "$NETWORK" = "mainnet" ]; then
  SUFFIX="near"
else
  SUFFIX="testnet"
fi

echo "=== OnSocial Substreams Sink Runner ==="
echo "Endpoint : $ENDPOINT"
echo "Database : ${DB_URL%%@*}@***"
echo "Network  : $NETWORK"
echo "Version  : $VERSION"
echo "Mode     : $MODE"
echo ""

# Apply combined schema
echo ">>> Applying combined schema..."
psql "$DB_URL" -f "$SCRIPT_DIR/combined_schema.sql" 2>/dev/null || true
echo ""

if [ "$MODE" = "combined" ]; then
  # =========================================================================
  # COMBINED MODE: 1 stream for all 5 contracts (recommended)
  # =========================================================================
  SPKG="$SCRIPT_DIR/onsocial-events-${VERSION}-combined.spkg"
  if [ ! -f "$SPKG" ]; then
    echo "❌ Package not found: $SPKG"
    echo "   Run ./pack.sh combined first."
    exit 1
  fi

  PARAMS="core=core.onsocial.${SUFFIX}&boost=boost.onsocial.${SUFFIX}&rewards=rewards.onsocial.${SUFFIX}&token=token.onsocial.${SUFFIX}&scarces=scarces.onsocial.${SUFFIX}"

  echo ">>> Starting combined sink → all contracts"
  echo "    Params: $PARAMS"
  echo ""
  exec substreams-sink-sql run \
    "$DB_URL" \
    "$SPKG" \
    -e "$ENDPOINT" \
    -p "map_combined_output=${PARAMS}" \
    --on-module-hash-mistmatch warn \
    --infinite-retry

else
  # =========================================================================
  # PER-CONTRACT MODE: 5 separate streams (legacy, uses 5 concurrent streams)
  # =========================================================================
  CONTRACTS=(
    "core|map_core_output|core_db_out|core.onsocial.${SUFFIX}"
    "boost|map_boost_output|boost_db_out|boost.onsocial.${SUFFIX}"
    "rewards|map_rewards_output|rewards_db_out|rewards.onsocial.${SUFFIX}"
    "token|map_token_output|token_db_out|token.onsocial.${SUFFIX}"
    "scarces|map_scarces_output|scarces_db_out|scarces.onsocial.${SUFFIX}"
  )

  PIDS=()
  NAMES=()
  for entry in "${CONTRACTS[@]}"; do
    IFS='|' read -r name map_module db_module contract_id <<< "$entry"
    SPKG="$SCRIPT_DIR/onsocial-events-${VERSION}-${name}.spkg"

    if [ ! -f "$SPKG" ]; then
      echo "❌ Package not found: $SPKG"
      echo "   Run ./pack.sh ${name} first."
      exit 1
    fi

    echo ">>> Starting ${name} sink (${db_module}) → ${contract_id}"
    substreams-sink-sql run \
      "$DB_URL" \
      "$SPKG" \
      -e "$ENDPOINT" \
      -p "${map_module}=contract_id=${contract_id}" \
      --infinite-retry &
    PIDS+=($!)
    NAMES+=("$name")
  done

  echo ""
  echo "=== All sinks running ==="
  for i in "${!NAMES[@]}"; do
    printf "  %-8s PID=%s\n" "${NAMES[$i]}" "${PIDS[$i]}"
  done
  echo ""
  echo "Press Ctrl+C to stop all sinks."

  cleanup() {
    echo ""
    echo ">>> Stopping sinks..."
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
    wait
    echo ">>> All sinks stopped."
  }
  trap cleanup INT TERM

  wait -n
  EXIT_CODE=$?
  echo ">>> A sink exited with code $EXIT_CODE. Stopping remaining..."
  cleanup
  exit "$EXIT_CODE"
fi
