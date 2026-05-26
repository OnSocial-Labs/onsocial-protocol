-- ============================================================================
-- OnSocial Core – Live Views
-- ============================================================================
-- Layer 2: current-state entity views on top of the raw append-only
-- data_updates event log.
--
-- Core views are regular views so Hasura/OnAPI reads reflect indexed rows
-- immediately after ingestion. Performance depends on the indexes below.
--
-- Current-state views dedupe across all operations first, then filter to
-- active rows where needed.
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

CREATE INDEX IF NOT EXISTS idx_data_updates_graph_edge_dedup
  ON data_updates(path, block_height DESC)
  WHERE data_type IN ('standing', 'reaction', 'endorsement', 'claims');

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
-- 3. standings_current - standing relationships
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
-- 6. standing_counts — incoming standing counts per account
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
-- 6b. profile_search — one row per profile for discovery/search
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW profile_search AS
WITH active_profile_fields AS (
  SELECT
    account_id,
    field,
    value,
    block_height,
    block_timestamp
  FROM profiles_current
  WHERE operation = 'set'
    AND value IS NOT NULL
),
profile_rows AS (
  SELECT
    account_id,
    MAX(value) FILTER (WHERE field = 'name')   AS name,
    MAX(value) FILTER (WHERE field = 'bio')    AS bio,
    MAX(value) FILTER (WHERE field = 'avatar') AS avatar,
    MAX(value) FILTER (WHERE field = 'banner') AS banner,
    MAX(block_height)                          AS last_profile_block,
    MAX(block_timestamp)                       AS last_profile_timestamp
  FROM active_profile_fields
  GROUP BY account_id
),
profile_since AS (
  SELECT
    account_id,
    MIN(block_timestamp) AS first_profile_timestamp
  FROM data_updates
  WHERE data_type = 'profile'
    AND operation = 'set'
    AND value IS NOT NULL
    AND data_id IN ('name', 'bio', 'avatar', 'banner')
  GROUP BY account_id
),
mutual_standing_counts AS (
  SELECT
    s.account_id,
    COUNT(*) AS mutual_standing_count
  FROM standings_current s
  JOIN standings_current reverse_s
    ON reverse_s.account_id = s.target_account
   AND reverse_s.target_account = s.account_id
  GROUP BY s.account_id
),
endorsement_latest AS (
  SELECT DISTINCT ON (account_id, path)
    account_id      AS issuer,
    target_account  AS target,
    block_height,
    operation
  FROM data_updates
  WHERE data_type = 'endorsement'
    AND account_id IS NOT NULL
    AND account_id != ''
    AND target_account IS NOT NULL
    AND target_account != ''
    AND path IS NOT NULL
    AND path != ''
  ORDER BY account_id, path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
),
endorsement_received_counts AS (
  SELECT
    target AS account_id,
    COUNT(*)          AS endorsements_received_count,
    MAX(block_height) AS last_endorsement_block
  FROM endorsement_latest
  WHERE operation = 'set'
  GROUP BY target
),
endorsement_given_counts AS (
  SELECT
    issuer AS account_id,
    COUNT(*)          AS endorsements_given_count,
    MAX(block_height) AS last_endorsement_block
  FROM endorsement_latest
  WHERE operation = 'set'
  GROUP BY issuer
)
SELECT
  p.account_id,
  p.name,
  p.bio,
  p.avatar,
  p.banner,
  COALESCE(sc.standing_with_count, 0)         AS standing_count,
  COALESCE(soc.standing_with_others_count, 0) AS standing_with_count,
  p.last_profile_block,
  p.last_profile_timestamp,
  GREATEST(
    COALESCE(p.last_profile_block, 0),
    COALESCE(sc.last_standing_block, 0),
    COALESCE(soc.last_standing_block, 0),
    COALESCE(erc.last_endorsement_block, 0),
    COALESCE(egc.last_endorsement_block, 0)
  ) AS last_activity_block,
  LOWER(CONCAT_WS(' ', p.account_id, p.name, p.bio)) AS search_text,
  COALESCE(msc.mutual_standing_count, 0)      AS mutual_standing_count,
  COALESCE(erc.endorsements_received_count, 0) AS endorsements_received_count,
  COALESCE(egc.endorsements_given_count, 0)   AS endorsements_given_count,
  ps.first_profile_timestamp
FROM profile_rows p
LEFT JOIN profile_since ps ON ps.account_id = p.account_id
LEFT JOIN standing_counts sc ON sc.account_id = p.account_id
LEFT JOIN standing_out_counts soc ON soc.account_id = p.account_id
LEFT JOIN mutual_standing_counts msc ON msc.account_id = p.account_id
LEFT JOIN endorsement_received_counts erc ON erc.account_id = p.account_id
LEFT JOIN endorsement_given_counts egc ON egc.account_id = p.account_id
WHERE p.name IS NOT NULL
   OR p.bio IS NOT NULL
   OR p.avatar IS NOT NULL
   OR p.banner IS NOT NULL;

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
-- 9. edges_current - latest unified social graph relationships
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW edges_current AS
WITH graph_updates AS (
  SELECT
    path                                                               AS edge_id,
    account_id                                                         AS source_account,
    CASE
      WHEN data_type = 'claims' THEN NULLIF(split_part(path, '/', 3), '')
      ELSE COALESCE(NULLIF(target_account, ''), NULLIF(split_part(path, '/', 3), ''))
    END                                                                AS target_account,
    CASE
      WHEN data_type = 'reaction' THEN 'content'
      ELSE 'account'
    END                                                                AS target_type,
    CASE
      WHEN data_type = 'reaction'
        THEN regexp_replace(path, '^[^/]+/reaction/[^/]+/[^/]+/', '')
      ELSE ''
    END                                                                AS target_path,
    data_type                                                          AS edge_type,
    COALESCE(
      CASE
        WHEN data_type = 'reaction' THEN NULLIF(reaction_kind, '')
        WHEN data_type = 'endorsement' THEN NULLIF(split_part(path, '/', 4), '')
        WHEN data_type = 'claims' THEN NULLIF(split_part(path, '/', 4), '')
        ELSE NULL
      END,
      ''
    )                                                                  AS edge_kind,
    value,
    block_height,
    block_timestamp,
    operation,
    group_id,
    receipt_id,
    id
  FROM data_updates
  WHERE data_type IN ('standing', 'reaction', 'endorsement', 'claims')
    AND account_id IS NOT NULL
    AND account_id != ''
    AND path IS NOT NULL
    AND path != ''
), latest AS (
  SELECT DISTINCT ON (edge_id)
    edge_id,
    source_account,
    target_account,
    target_type,
    target_path,
    edge_type,
    edge_kind,
    value,
    block_height,
    block_timestamp,
    operation,
    group_id,
    receipt_id,
    id
  FROM graph_updates
  WHERE target_account IS NOT NULL
    AND target_account != ''
  ORDER BY edge_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
)
SELECT
  edge_id,
  source_account,
  target_account,
  target_type,
  target_path,
  edge_type,
  edge_kind,
  source_account                                                     AS source,
  target_account                                                     AS target,
  value,
  block_height,
  block_timestamp,
  operation,
  group_id
FROM latest
WHERE operation = 'set';

-- ────────────────────────────────────────────────────────────────────────────
-- 10. edge_counts — inbound graph counts per account/type/kind
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW edge_counts AS
SELECT
  target_account               AS account_id,
  target_type,
  edge_type,
  edge_kind,
  COUNT(*)                     AS inbound_count,
  MAX(block_height)            AS last_block
FROM edges_current
GROUP BY target_account, target_type, edge_type, edge_kind;

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
