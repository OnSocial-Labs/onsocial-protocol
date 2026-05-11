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

echo "Dropping inconsistent Hasura metadata, if any..."
metadata_api '{"type":"drop_inconsistent_metadata","args":{}}' >/dev/null

drop_select_permission() {
  local relation="$1"
  local role="$2"
  local payload
  local response_file
  local status

  payload="{\"type\":\"pg_drop_select_permission\",\"args\":{\"source\":\"${SOURCE_NAME}\",\"table\":{\"schema\":\"public\",\"name\":\"${relation}\"},\"role\":\"${role}\"}}"
  response_file="$(mktemp)"
  status=$(curl -sS -o "$response_file" -w '%{http_code}' "$HASURA_METADATA_URL" \
    -H 'Content-Type: application/json' \
    -H "x-hasura-admin-secret: ${HASURA_ADMIN_SECRET}" \
    -d "$payload")

  if [[ "$status" =~ ^2 ]]; then
    echo "drop: ${relation} ${role} select permission"
    rm -f "$response_file"
    return 0
  fi

  if grep -Eqi 'not[ _-]?(found|exist)|does not exist|not tracked|not-tracked' "$response_file"; then
    rm -f "$response_file"
    return 0
  fi

  echo "error: failed to drop ${relation} ${role} select permission (HTTP $status)" >&2
  cat "$response_file" >&2
  echo >&2
  rm -f "$response_file"
  return 1
}

# Older gateway permission metadata can reference columns that the upgraded
# Substreams schemas intentionally removed (for example scarces_events.executor).
# Hasura may not flag those permissions as inconsistent until the next metadata
# mutation, so drop them explicitly before tracking any newly deployed views.
echo "Dropping stale Substreams select permissions, if present..."
for stale_relation in scarces_events rewards_events; do
  for role in free pro scale service; do
    drop_select_permission "$stale_relation" "$role"
  done
done

track_relation() {
  local relation="$1"
  local payload
  local response_file
  local status

  payload="{\"type\":\"pg_track_table\",\"args\":{\"source\":\"${SOURCE_NAME}\",\"table\":{\"schema\":\"public\",\"name\":\"${relation}\"}}}"
  response_file="$(mktemp)"
  status=$(curl -sS -o "$response_file" -w '%{http_code}' "$HASURA_METADATA_URL" \
    -H 'Content-Type: application/json' \
    -H "x-hasura-admin-secret: ${HASURA_ADMIN_SECRET}" \
    -d "$payload")

  if [[ "$status" =~ ^2 ]]; then
    rm -f "$response_file"
    return 0
  fi

  if grep -Eqi 'already[ _-]?(tracked|exists)|already-tracked|already-exists' "$response_file"; then
    echo "skip: $relation already tracked (metadata race)"
    rm -f "$response_file"
    return 2
  fi

  echo "error: failed to track $relation (HTTP $status)" >&2
  cat "$response_file" >&2
  echo >&2
  rm -f "$response_file"
  return 1
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
  if track_relation "$relation"; then
    created=$((created + 1))
  else
    status=$?
    if [ "$status" -eq 2 ]; then
      skipped=$((skipped + 1))
    else
      exit "$status"
    fi
  fi
done <<< "$PUBLIC_RELATIONS"

echo "Reloading metadata cache..."
# reload_sources must be true after CREATE OR REPLACE VIEW column changes.
metadata_api '{"type":"reload_metadata","args":{"reload_remote_schemas":true,"reload_sources":true,"recreate_event_triggers":false}}' >/dev/null

echo "Hasura substreams metadata sync complete: created=${created} skipped=${skipped}"