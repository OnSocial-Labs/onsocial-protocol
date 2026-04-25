-- ============================================================================
-- OnSocial Core – Live Views
-- ============================================================================
-- Layer 2: current-state entity views on top of the raw append-only
-- data_updates event log.
--
-- All core views are regular (non-materialized) views so that reads through
-- Hasura/OnAPI return live data with zero lag after substreams ingestion.
-- Performance relies on indexes on data_updates; at current scale the
-- DISTINCT ON queries execute in single-digit milliseconds.
--
-- Important semantic rule for current-state views:
--   1. dedupe across ALL operations first (set, remove, revoke, etc.)
--   2. then filter to active rows where needed
--
-- This avoids stale positive state surviving after a later tombstone event.
-- Ordering includes receipt_id and id as deterministic tie-breakers so
-- multiple writes to the same logical key within one block resolve correctly.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Indexes on data_updates for efficient view queries
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_data_updates_data_type_account
  ON data_updates(data_type, account_id);

-- Composite index optimised for the dominant `os.query.raw.byType` shape:
--   WHERE data_type = $1 AND account_id = $2 ORDER BY block_height DESC LIMIT N
-- Lets PG do an index-only walk and stop at LIMIT, regardless of how many
-- other accounts wrote the same data_type.
CREATE INDEX IF NOT EXISTS idx_data_updates_data_type_account_block
  ON data_updates(data_type, account_id, block_height DESC);

CREATE INDEX IF NOT EXISTS idx_data_updates_target_account
  ON data_updates(target_account) WHERE target_account IS NOT NULL AND target_account != '';

CREATE INDEX IF NOT EXISTS idx_data_updates_data_type_block_height
  ON data_updates(data_type, block_height DESC);

CREATE INDEX IF NOT EXISTS idx_data_updates_parent_author
  ON data_updates(parent_author) WHERE parent_author IS NOT NULL AND parent_author != '';

CREATE INDEX IF NOT EXISTS idx_data_updates_group_id_data_type
  ON data_updates(group_id, data_type) WHERE group_id IS NOT NULL AND group_id != '';

CREATE INDEX IF NOT EXISTS idx_data_updates_post_group_channel
  ON data_updates(group_id, channel, block_height DESC)
  WHERE data_type = 'post' AND group_id IS NOT NULL AND group_id != '' AND channel IS NOT NULL AND channel != '';

CREATE INDEX IF NOT EXISTS idx_data_updates_post_group_kind
  ON data_updates(group_id, kind, block_height DESC)
  WHERE data_type = 'post' AND group_id IS NOT NULL AND group_id != '' AND kind IS NOT NULL AND kind != '';

-- Composite index for DISTINCT ON queries (covers the common sort order)
CREATE INDEX IF NOT EXISTS idx_data_updates_profile_dedup
  ON data_updates(account_id, data_id, block_height DESC) WHERE data_type = 'profile';

CREATE INDEX IF NOT EXISTS idx_data_updates_post_dedup
  ON data_updates(account_id, data_id, block_height DESC) WHERE data_type = 'post';

CREATE INDEX IF NOT EXISTS idx_data_updates_standing_dedup
  ON data_updates(account_id, target_account, block_height DESC) WHERE data_type = 'standing';

CREATE INDEX IF NOT EXISTS idx_data_updates_reaction_dedup
  ON data_updates(account_id, path, block_height DESC) WHERE data_type = 'reaction';

CREATE INDEX IF NOT EXISTS idx_data_updates_claims_dedup
  ON data_updates(account_id, path, block_height DESC) WHERE data_type = 'claims';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. profiles_current — latest profile fields per account
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW profiles_current AS
SELECT DISTINCT ON (account_id, data_id)
  account_id,
  data_id        AS field,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'profile'
ORDER BY account_id, data_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. posts_current — latest state of each post (deduped edits + deletes)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW posts_current AS
SELECT
  account_id,
  data_id                      AS post_id,
  value,
  block_height,
  block_timestamp,
  receipt_id,
  parent_path,
  parent_author,
  parent_type,
  ref_path,
  ref_author,
  ref_type,
  channel,
  kind,
  audiences,
  group_id,
  is_group_content
FROM (
  SELECT DISTINCT ON (account_id, data_id)
    account_id,
    data_id,
    value,
    block_height,
    block_timestamp,
    receipt_id,
    parent_path,
    parent_author,
    parent_type,
    ref_path,
    ref_author,
    ref_type,
    channel,
    kind,
    audiences,
    group_id,
    is_group_content,
    operation,
    id
  FROM data_updates
  WHERE data_type = 'post'
  ORDER BY account_id, data_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
) latest
WHERE operation = 'set';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. standings_current — social graph (who stands with whom)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW standings_current AS
SELECT
  account_id,
  target_account,
  value,
  block_height,
  block_timestamp
FROM (
  SELECT DISTINCT ON (account_id, target_account)
    account_id,
    target_account,
    value,
    block_height,
    block_timestamp,
    operation,
    receipt_id,
    id
  FROM data_updates
  WHERE data_type = 'standing'
    AND target_account IS NOT NULL
    AND target_account != ''
  ORDER BY account_id, target_account, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
) latest
WHERE operation = 'set';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. reactions_current — per-user reaction state on a target post
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW reactions_current AS
SELECT DISTINCT ON (account_id, path)
  account_id,
  target_account               AS post_owner,
  reaction_kind,
  path,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'reaction'
ORDER BY account_id, path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. reaction_counts — aggregate reaction counts per target post, per kind
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW reaction_counts AS
SELECT
  post_owner,
  reaction_kind,
  SUBSTRING(path FROM '/reaction/[^/]+/[^/]+/(.+)$') AS post_path,
  COUNT(*)                                            AS reaction_count,
  MAX(block_height)                                   AS last_reaction_block
FROM reactions_current
WHERE operation = 'set'
GROUP BY post_owner, reaction_kind, SUBSTRING(path FROM '/reaction/[^/]+/[^/]+/(.+)$');

-- ────────────────────────────────────────────────────────────────────────────
-- 6. standing_counts — follower counts per account
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW standing_counts AS
SELECT
  target_account                AS account_id,
  COUNT(*)                      AS standing_with_count,
  MAX(block_height)             AS last_standing_block
FROM standings_current
GROUP BY target_account;

CREATE OR REPLACE VIEW standing_out_counts AS
SELECT
  account_id,
  COUNT(*)                      AS standing_with_others_count,
  MAX(block_height)             AS last_standing_block
FROM standings_current
GROUP BY account_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. thread_replies — posts that are replies
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW thread_replies AS
SELECT
  account_id     AS reply_author,
  post_id        AS reply_id,
  parent_author,
  parent_path,
  parent_type,
  value,
  block_height,
  block_timestamp,
  group_id
FROM posts_current
WHERE parent_author IS NOT NULL
  AND parent_author != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 8. quotes — posts that quote another post
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW quotes AS
SELECT
  account_id     AS quote_author,
  post_id        AS quote_id,
  ref_author,
  ref_path,
  ref_type,
  value,
  block_height,
  block_timestamp,
  group_id
FROM posts_current
WHERE ref_author IS NOT NULL
  AND ref_author != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 9. edges_current — generic social graph (ALL relationship types)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW edges_current AS
SELECT DISTINCT ON (account_id, data_type, target_account)
  account_id                   AS source,
  target_account               AS target,
  data_type                    AS edge_type,
  value,
  block_height,
  block_timestamp,
  operation,
  group_id
FROM data_updates
WHERE target_account IS NOT NULL
  AND target_account != ''
ORDER BY account_id, data_type, target_account, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. edge_counts — per (account, edge_type) counts
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW edge_counts AS
SELECT
  target                       AS account_id,
  edge_type,
  COUNT(*)                     AS inbound_count,
  MAX(block_height)            AS last_block
FROM edges_current
WHERE operation = 'set'
GROUP BY target, edge_type;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. claims_current — latest attestation per (issuer, subject, type, claimId)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW claims_current AS
SELECT DISTINCT ON (account_id, path)
  account_id                                                    AS issuer,
  (regexp_match(path, '/claims/([^/]+)/([^/]+)/(.+)$'))[1]      AS subject,
  (regexp_match(path, '/claims/([^/]+)/([^/]+)/(.+)$'))[2]      AS claim_type,
  (regexp_match(path, '/claims/([^/]+)/([^/]+)/(.+)$'))[3]      AS claim_id,
  path,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'claims'
ORDER BY account_id, path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. post_hashtags — hashtag-to-post junction
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW post_hashtags AS
SELECT
  p.account_id,
  p.post_id,
  lower(trim(ht.tag)) AS hashtag,
  p.block_height,
  p.block_timestamp,
  p.group_id
FROM posts_current p,
  LATERAL jsonb_array_elements_text(
    (p.value::jsonb) -> 'hashtags'
  ) AS ht(tag)
WHERE p.value IS NOT NULL
  AND p.value != ''
  AND (p.value::jsonb) -> 'hashtags' IS NOT NULL
  AND jsonb_typeof((p.value::jsonb) -> 'hashtags') = 'array';

-- ────────────────────────────────────────────────────────────────────────────
-- 13. hashtag_counts — aggregate post count per hashtag
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW hashtag_counts AS
SELECT
  hashtag,
  count(*)          AS post_count,
  max(block_height) AS last_block
FROM post_hashtags
GROUP BY hashtag;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. saves_current — latest save state per (account, path)
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_data_updates_saved_dedup
  ON data_updates(account_id, path, block_height DESC) WHERE data_type = 'saved';

CREATE OR REPLACE VIEW saves_current AS
SELECT DISTINCT ON (account_id, path)
  account_id,
  path                         AS content_path,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'saved'
ORDER BY account_id, path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 15. endorsements_current — latest endorsement per (issuer, target[, topic])
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_data_updates_endorsement_dedup
  ON data_updates(account_id, path, block_height DESC) WHERE data_type = 'endorsement';

CREATE OR REPLACE VIEW endorsements_current AS
SELECT DISTINCT ON (account_id, path)
  account_id                   AS issuer,
  target_account               AS target,
  data_id                      AS topic_or_target,
  path,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'endorsement'
ORDER BY account_id, path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- refresh_core_views() — no-op kept for backward compatibility
-- ────────────────────────────────────────────────────────────────────────────
-- Regular views are always live. This function is retained so that any
-- existing callers (backend workers, scripts) don't break.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_core_views() RETURNS void AS $$
BEGIN
  -- No-op: all core views are now regular (live) views.
  RAISE NOTICE 'refresh_core_views() is a no-op — core views are live';
END;
$$ LANGUAGE plpgsql;
