#!/usr/bin/env bash
set -euo pipefail

HASURA_URL="${HASURA_URL:?HASURA_URL environment variable is required}"
HASURA_ADMIN_SECRET="${HASURA_ADMIN_SECRET:?HASURA_ADMIN_SECRET environment variable is required}"
if [[ "$HASURA_URL" == */v1/graphql ]]; then
  HASURA_METADATA_URL="${HASURA_URL%/v1/graphql}/v1/metadata"
elif [[ "$HASURA_URL" == */v1/metadata ]]; then
  HASURA_METADATA_URL="$HASURA_URL"
else
  HASURA_METADATA_URL="${HASURA_URL%/}/v1/metadata"
fi
SOURCE_NAME="${HASURA_SOURCE_NAME:-default}"
SQL_DIR="${1:-$(pwd)}"

metadata_api() {
  local payload="$1"
  curl -fsS "$HASURA_METADATA_URL" \
    -H 'Content-Type: application/json' \
    -H "x-hasura-admin-secret: ${HASURA_ADMIN_SECRET}" \
    -d "$payload"
}

echo "Exporting current Hasura metadata..."
EXISTING_TRACKED=$(metadata_api '{"type":"export_metadata","args":{}}' | SOURCE_NAME="$SOURCE_NAME" python3 -c '
import json
import os
import sys

source_name = os.environ["SOURCE_NAME"]
data = json.load(sys.stdin)
sources = data.get("metadata", data).get("sources", [])
names = set()

for source in sources:
  if source.get("name") != source_name:
    continue
  for table in source.get("tables", []):
    table_def = table.get("table", {})
    schema = table_def.get("schema")
    name = table_def.get("name")
    if schema == "public" and name:
      names.add(name)

print("\n".join(sorted(names)))
')

echo "Discovering relations from deployed SQL files in ${SQL_DIR}..."
SQL_FILES=()
[ -f "${SQL_DIR}/combined_schema.sql" ] && SQL_FILES+=("${SQL_DIR}/combined_schema.sql")
for view_sql in "${SQL_DIR}"/*_schema_views.sql; do
  [ -f "$view_sql" ] && SQL_FILES+=("$view_sql")
done

if [ ${#SQL_FILES[@]} -eq 0 ]; then
  echo "No combined_schema.sql or *_schema_views.sql files found in ${SQL_DIR}"
  exit 1
fi

PUBLIC_RELATIONS=$(grep -hE 'CREATE (OR REPLACE )?(TABLE|VIEW|MATERIALIZED VIEW) ' "${SQL_FILES[@]}" | \
  sed -E 's/^CREATE (OR REPLACE )?(TABLE|VIEW|MATERIALIZED VIEW) (IF NOT EXISTS )?([a-zA-Z_][a-zA-Z0-9_]*).*/\4/' | \
  sort -u | \
  grep -vx 'schema_migrations' || true)

created=0
skipped=0

while IFS= read -r relation; do
  [ -z "$relation" ] && continue
  if printf '%s\n' "$EXISTING_TRACKED" | grep -Fxq "$relation"; then
    echo "skip: $relation already tracked"
    skipped=$((skipped + 1))
    continue
  fi

  echo "track: $relation"
  metadata_api "{\"type\":\"pg_track_table\",\"args\":{\"source\":\"${SOURCE_NAME}\",\"table\":{\"schema\":\"public\",\"name\":\"${relation}\"}}}" >/dev/null
  created=$((created + 1))
done <<< "$PUBLIC_RELATIONS"

echo "Reloading metadata cache..."
metadata_api '{"type":"reload_metadata","args":{}}' >/dev/null

echo "Hasura substreams metadata sync complete: created=${created} skipped=${skipped}"