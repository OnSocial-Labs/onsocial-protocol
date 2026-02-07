#!/usr/bin/env bash
# =============================================================================
# run_sinks.sh — Launch all Substreams SQL sink processes
# =============================================================================
# Each contract gets its own sink process writing to the same Postgres DB.
#
# Usage:
#   SUBSTREAMS_ENDPOINT=... DATABASE_URL=... ./run_sinks.sh
#
# Or with defaults for local development:
#   ./run_sinks.sh
# =============================================================================

set -euo pipefail

ENDPOINT="${SUBSTREAMS_ENDPOINT:?Set SUBSTREAMS_ENDPOINT (e.g. mainnet.near.streamingfast.io:443)}"
DB_URL="${DATABASE_URL:-postgres://onsocial:onsocial@localhost:5432/onsocial}"
SPKG="${SPKG_PATH:-./onsocial-events-v0.7.0.spkg}"

echo "=== OnSocial Substreams Sink Runner ==="
echo "Endpoint : $ENDPOINT"
echo "Database : ${DB_URL%%@*}@***"
echo "Package  : $SPKG"
echo ""

# Apply combined schema
echo ">>> Applying combined schema..."
psql "$DB_URL" -f "$(dirname "$0")/combined_schema.sql" 2>/dev/null || true
echo ""

# Core-onsocial sink
echo ">>> Starting core-onsocial sink (core_db_out)..."
substreams-sink-sql run \
  "$ENDPOINT" \
  "$SPKG" \
  "$DB_URL" \
  --module=core_db_out \
  --params="map_core_output=contract_id=core.onsocial.testnet" &
CORE_PID=$!

# Staking-onsocial sink
echo ">>> Starting staking-onsocial sink (staking_db_out)..."
substreams-sink-sql run \
  "$ENDPOINT" \
  "$SPKG" \
  "$DB_URL" \
  --module=staking_db_out \
  --params="map_staking_output=contract_id=staking.onsocial.testnet" &
STAKING_PID=$!

# Token-onsocial sink
echo ">>> Starting token-onsocial sink (token_db_out)..."
substreams-sink-sql run \
  "$ENDPOINT" \
  "$SPKG" \
  "$DB_URL" \
  --module=token_db_out \
  --params="map_token_output=contract_id=token.onsocial.testnet" &
TOKEN_PID=$!

echo ""
echo "=== All sinks running ==="
echo "  core    PID=$CORE_PID"
echo "  staking PID=$STAKING_PID"
echo "  token   PID=$TOKEN_PID"
echo ""
echo "Press Ctrl+C to stop all sinks."

# Trap SIGINT/SIGTERM → kill all children
cleanup() {
  echo ""
  echo ">>> Stopping sinks..."
  kill "$CORE_PID" "$STAKING_PID" "$TOKEN_PID" 2>/dev/null || true
  wait
  echo ">>> All sinks stopped."
}
trap cleanup INT TERM

# Wait for any child to exit
wait -n
EXIT_CODE=$?
echo ">>> A sink exited with code $EXIT_CODE. Stopping remaining..."
cleanup
exit "$EXIT_CODE"
