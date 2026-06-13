#!/usr/bin/env bash
# Validate Substreams SQL schemas and views against a clean PostgreSQL 16 database.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBSTREAMS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKER_BIN="${DOCKER:-docker}"
POSTGRES_IMAGE="${SUBSTREAMS_SQL_IMAGE:-postgres:16-alpine}"

if ! command -v "${DOCKER_BIN}" >/dev/null 2>&1; then
  echo "error: docker is required for SQL validation" >&2
  exit 1
fi

if ! "${DOCKER_BIN}" info >/dev/null 2>&1; then
  echo "error: docker is not running or is not accessible" >&2
  exit 1
fi

echo ">>> Validating Substreams SQL with ${POSTGRES_IMAGE}"

"${DOCKER_BIN}" run --rm \
  --user postgres \
  -v "${SUBSTREAMS_DIR}:/work:ro" \
  "${POSTGRES_IMAGE}" \
  sh -lc '
    set -eu

    initdb -D /tmp/pgdata >/dev/null
    pg_ctl -D /tmp/pgdata -o "-k /tmp -c listen_addresses='"'"''"'"'" -w start >/dev/null
    trap "pg_ctl -D /tmp/pgdata -m fast -w stop >/dev/null 2>&1 || true" EXIT

    apply_sql() {
      db="$1"
      sql="$2"
      if [ -f "$sql" ]; then
        echo "    ${db}: $(basename "$sql")"
        psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -f "$sql" >/dev/null
      fi
    }

    apply_migrations() {
      db="$1"
      for migration in /work/migrations/*.sql; do
        [ -e "$migration" ] || continue
        apply_sql "$db" "$migration"
      done
    }

    apply_views() {
      db="$1"
      apply_sql "$db" /work/core_schema_views.sql
      apply_sql "$db" /work/leaderboard_schema_views.sql
    }

    validate_expected_objects() {
      db="$1"
      view_count="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
        SELECT '"'"'views='"'"' || COUNT(*)
        FROM information_schema.views
        WHERE table_schema = '"'"'public'"'"';
      ")"
      snapshot_count="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
        SELECT '"'"'snapshot_leaderboard_functions='"'"' || COUNT(*)
        FROM pg_proc
        WHERE proname = '"'"'snapshot_leaderboard'"'"';
      ")"
      echo "$view_count"
      echo "$snapshot_count"

      views_num="${view_count#views=}"
      snapshots_num="${snapshot_count#snapshot_leaderboard_functions=}"
      if [ "$views_num" -lt 20 ]; then
        echo "error: expected at least 20 public views in $db, found $views_num" >&2
        exit 1
      fi
      if [ "$snapshots_num" -ne 1 ]; then
        echo "error: expected snapshot_leaderboard() in $db" >&2
        exit 1
      fi

      for view_name in posts_current standing_counts leaderboard_rewards reputation_scores leaderboard_agent_features app_reputation; do
        exists="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
          SELECT to_regclass('"'"'public.${view_name}'"'"') IS NOT NULL;
        ")"
        if [ "$exists" != "t" ]; then
          echo "error: expected view public.${view_name} in $db" >&2
          exit 1
        fi
      done

      for column_name in mutual_standing endorsements_received confidence_score; do
        exists="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = '"'"'public'"'"'
              AND table_name = '"'"'reputation_scores'"'"'
              AND column_name = '"'"'${column_name}'"'"'
          );
        ")"
        if [ "$exists" != "t" ]; then
          echo "error: expected reputation_scores.${column_name} in $db" >&2
          exit 1
        fi
      done
    }

    validate_reputation_view_upgrade() {
      db="$1"
      echo ">>> Reputation view upgrade (column reorder)"
      psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 <<SQLEOF >/dev/null
DROP VIEW IF EXISTS app_reputation CASCADE;
DROP VIEW IF EXISTS leaderboard_agent_features CASCADE;
DROP VIEW IF EXISTS reputation_scores CASCADE;
CREATE VIEW reputation_scores AS
SELECT
  NULL::text AS account_id,
  0::bigint AS standing_with,
  0::bigint AS standing_out,
  0::numeric AS boost,
  0::integer AS lock_months,
  0::numeric AS rewards_earned,
  0::bigint AS total_posts,
  0::bigint AS reply_count,
  0::bigint AS reactions_received,
  0::numeric AS avg_reactions,
  0::bigint AS active_days,
  0::bigint AS unique_conversations,
  0::bigint AS scarces_created,
  0::bigint AS scarces_sold,
  0::numeric AS scarces_revenue_near,
  0::numeric AS social_score,
  0::numeric AS commitment_score,
  0::numeric AS quality_score,
  0::numeric AS consistency_score,
  0::numeric AS scarces_score,
  0::numeric AS reputation,
  1::bigint AS rank
WHERE false;
SQLEOF
      apply_sql "$db" /work/leaderboard_schema_views.sql
      validate_expected_objects "$db"
    }

    validate_notifications_schema() {
      db="$1"

      for relation in notifications notification_counts notification_cursors app_notification_events; do
        exists="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
          SELECT to_regclass('"'"'public.${relation}'"'"') IS NOT NULL;
        ")"
        if [ "$exists" != "t" ]; then
          echo "error: expected notification relation public.${relation} in $db" >&2
          exit 1
        fi
      done

      id_type="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = '"'"'public'"'"'
          AND table_name = '"'"'notifications'"'"'
          AND column_name = '"'"'id'"'"';
      ")"
      if [ "$id_type" != "uuid" ]; then
        echo "error: expected notifications.id to be uuid in $db, found ${id_type:-missing}" >&2
        exit 1
      fi

      for column_name in owner_account_id app_id dedupe_key; do
        exists="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = '"'"'public'"'"'
              AND table_name = '"'"'notifications'"'"'
              AND column_name = '"'"'${column_name}'"'"'
          );
        ")"
        if [ "$exists" != "t" ]; then
          echo "error: expected notifications.${column_name} in $db" >&2
          exit 1
        fi
      done

      for index_name in idx_notifications_dedupe idx_app_notification_events_dedupe; do
        exists="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
          SELECT to_regclass('"'"'public.${index_name}'"'"') IS NOT NULL;
        ")"
        if [ "$exists" != "t" ]; then
          echo "error: expected index public.${index_name} in $db" >&2
          exit 1
        fi
      done

      cursor_count="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
        SELECT COUNT(*)
        FROM notification_cursors
        WHERE source_table IN (
          '"'"'data_updates'"'"',
          '"'"'group_updates'"'"',
          '"'"'rewards_events'"'"',
          '"'"'boost_events'"'"',
          '"'"'scarces_events'"'"',
          '"'"'app_notification_events'"'"'
        );
      ")"
      if [ "$cursor_count" -ne 6 ]; then
        echo "error: expected six notification cursor seeds in $db, found $cursor_count" >&2
        exit 1
      fi

      read_function_count="$(psql -h /tmp -d "$db" -v ON_ERROR_STOP=1 -Atc "
        SELECT COUNT(*)
        FROM pg_proc
        WHERE proname = '"'"'mark_notifications_read'"'"'
          AND pronargs = 3;
      ")"
      if [ "$read_function_count" -ne 1 ]; then
        echo "error: expected mark_notifications_read(owner, app, recipient) in $db" >&2
        exit 1
      fi
    }

    echo ">>> Combined deploy schema"
    createdb -h /tmp combined_validate
    apply_sql combined_validate /work/combined_schema.sql
    apply_migrations combined_validate
    apply_views combined_validate
    validate_expected_objects combined_validate
    validate_reputation_view_upgrade combined_validate

    echo ">>> Standalone package schemas"
    createdb -h /tmp standalone_validate
    apply_sql standalone_validate /work/core_schema.sql
    apply_sql standalone_validate /work/boost_schema.sql
    apply_sql standalone_validate /work/rewards_schema.sql
    apply_sql standalone_validate /work/token_schema.sql
    apply_sql standalone_validate /work/scarces_schema.sql
    apply_sql standalone_validate /work/notifications_schema.sql
    apply_migrations standalone_validate
    apply_views standalone_validate
    validate_expected_objects standalone_validate
    validate_notifications_schema standalone_validate
  '

echo ">>> Substreams SQL validation passed"