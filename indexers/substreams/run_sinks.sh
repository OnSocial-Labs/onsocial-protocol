#!/usr/bin/env bash
# =============================================================================
# Run OnSocial Substreams SQL sinks.
# =============================================================================
# Default mode indexes all contracts through one combined stream.
# Required: SUBSTREAMS_ENDPOINT. Optional: DATABASE_URL, NEAR_NETWORK, MODE.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENDPOINT="${SUBSTREAMS_ENDPOINT:?Set SUBSTREAMS_ENDPOINT (e.g. mainnet.near.streamingfast.io:443)}"
DB_URL="${DATABASE_URL:-postgres://onsocial:onsocial@localhost:5432/onsocial}"
NETWORK="${NEAR_NETWORK:-testnet}"
MODE="${MODE:-combined}"

# Package version from substreams.yaml.
VERSION=$(grep -m1 'version:' "$SCRIPT_DIR/substreams.yaml" | awk '{print $2}')

# Contract account suffix for testnet/mainnet.
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

if compgen -G "$SCRIPT_DIR/migrations/*.sql" > /dev/null; then
  echo ">>> Applying migrations..."
  for migration in "$SCRIPT_DIR"/migrations/*.sql; do
    echo "    $(basename "$migration")"
    psql "$DB_URL" -f "$migration"
  done
  echo ""
fi

if [ "$MODE" = "combined" ]; then
  # =========================================================================
  # COMBINED MODE: 1 stream for all contracts (recommended)
  # =========================================================================
  SPKG="$SCRIPT_DIR/onsocial-events-${VERSION}-combined.spkg"
  if [ ! -f "$SPKG" ]; then
    echo "❌ Package not found: $SPKG"
    echo "   Run ./pack.sh combined first."
    exit 1
  fi

  PARAMS="core=core.onsocial.${SUFFIX}&boost=boost.onsocial.${SUFFIX}&rewards=rewards.onsocial.${SUFFIX}&token=token.onsocial.${SUFFIX}&scarces=scarces.onsocial.${SUFFIX}&social_spend=social-spend.onsocial.${SUFFIX}"

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
  # PER-CONTRACT MODE: separate streams per contract
  # =========================================================================
  CONTRACTS=(
    "core|map_core_output|core_db_out|core.onsocial.${SUFFIX}"
    "boost|map_boost_output|boost_db_out|boost.onsocial.${SUFFIX}"
    "rewards|map_rewards_output|rewards_db_out|rewards.onsocial.${SUFFIX}"
    "token|map_token_output|token_db_out|token.onsocial.${SUFFIX}"
    "scarces|map_scarces_output|scarces_db_out|scarces.onsocial.${SUFFIX}"
    "social-spend|map_social_spend_output|social_spend_db_out|social-spend.onsocial.${SUFFIX}"
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
