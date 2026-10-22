#!/usr/bin/env bash
# Apply indexer SQL and gateway migrations to a Postgres database.
# Used by Gateway CI to exercise apply-hasura-permissions sync against deploy-parity schema.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUBSTREAMS="${ROOT}/indexers/chain-index"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-onsocial}"
PGPASSWORD="${PGPASSWORD:-onsocial}"
PGDATABASE="${PGDATABASE:-onsocial}"
export PGPASSWORD

psql_apply() {
  local file="$1"
  echo "  $(basename "$file")"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -v ON_ERROR_STOP=1 -f "$file" >/dev/null
}

echo ">>> Applying indexer schema"
psql_apply "${SUBSTREAMS}/combined_schema.sql"

echo ">>> Applying indexer migrations"
for migration in "${SUBSTREAMS}"/migrations/*.sql; do
  [ -f "$migration" ] || continue
  psql_apply "$migration"
done

echo ">>> Applying indexer view files"
for view in core_schema_views leaderboard_schema_views scarces_schema_views; do
  psql_apply "${SUBSTREAMS}/${view}.sql"
done

if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -Atc \
  "SELECT to_regclass('public.social_spend_events') IS NOT NULL;" | grep -qx 't'; then
  psql_apply "${SUBSTREAMS}/social_spend_schema_views.sql"
fi

echo ">>> Applying gateway migrations"
for migration in "${ROOT}/packages/onsocial-gateway/migrations/"*.sql; do
  [ -f "$migration" ] || continue
  psql_apply "$migration"
done

echo ">>> Indexer + gateway schema ready on ${PGDATABASE}"
