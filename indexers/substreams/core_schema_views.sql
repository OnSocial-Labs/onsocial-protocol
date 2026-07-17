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

CREATE INDEX IF NOT EXISTS idx_group_updates_group_block
  ON group_updates(group_id, block_height DESC)
  WHERE group_id IS NOT NULL AND group_id != '';

CREATE INDEX IF NOT EXISTS idx_group_updates_member_current
  ON group_updates(group_id, member_id, block_height DESC)
  WHERE group_id IS NOT NULL AND group_id != '' AND member_id IS NOT NULL AND member_id != '';

CREATE INDEX IF NOT EXISTS idx_group_updates_member_lookup
  ON group_updates(member_id, block_height DESC)
  WHERE member_id IS NOT NULL AND member_id != '';

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
-- 1b. pages_current — latest page KV entries per account (e.g. page/main)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW pages_current AS
SELECT DISTINCT ON (account_id, data_id)
  account_id,
  data_id,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'page'
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
-- 3b. mutual_standings_current — stands with a reciprocal edge (paginated reads)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW mutual_standings_current AS
SELECT
  s.account_id,
  s.target_account               AS mutual_account,
  s.value,
  s.block_height,
  s.block_timestamp
FROM standings_current s
WHERE EXISTS (
  SELECT 1
  FROM standings_current r
  WHERE r.account_id = s.target_account
    AND r.target_account = s.account_id
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3c. groups_current — latest indexed group metadata per group
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW groups_current AS
WITH config_events AS (
  SELECT
    group_id,
    author,
    name,
    is_public,
    creator_role,
    storage_allocation,
    block_height,
    block_timestamp,
    receipt_id,
    id,
    operation,
    extra_data,
    value,
    COALESCE(
      NULLIF(value, '')::jsonb,
      CASE
        WHEN extra_data ~ '^[\{]' THEN extra_data::jsonb -> 'value'
        ELSE NULL
      END,
      '{}'::jsonb
    ) AS config_json
  FROM group_updates
  WHERE group_id IS NOT NULL
    AND group_id != ''
    AND operation IN (
      'create_group',
      'group_updated',
      'metadata_updated',
      'privacy_changed'
    )
),
latest AS (
  SELECT DISTINCT ON (group_id)
    group_id,
    author,
    name,
    is_public,
    creator_role,
    storage_allocation,
    block_height,
    block_timestamp,
    operation,
    config_json
  FROM config_events
  ORDER BY group_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
)
SELECT
  group_id,
  author                       AS owner_id,
  COALESCE(
    NULLIF(name, ''),
    NULLIF(config_json ->> 'name', '')
  )                            AS group_name,
  COALESCE(
    is_public,
    NOT COALESCE((config_json ->> 'is_private')::boolean, false)
  )                            AS is_public,
  creator_role,
  storage_allocation,
  block_height,
  block_timestamp,
  operation,
  NULLIF(config_json ->> 'description', '') AS group_description,
  NULLIF(config_json #>> '{avatar,cid}', '') AS group_avatar_cid,
  NULLIF(config_json #>> '{x,onsocial,banner,cid}', '') AS group_banner_cid,
  COALESCE(
    (config_json ->> 'member_driven') = 'true',
    (config_json ->> 'memberDriven') = 'true',
    false
  )                            AS is_member_driven
FROM latest;

-- ────────────────────────────────────────────────────────────────────────────
-- 3d. group_members_current — active group memberships by member
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW group_members_current AS
WITH membership_events AS (
  SELECT
    group_id,
    author                    AS member_id,
    COALESCE(NULLIF(creator_role, ''), 'owner') AS role,
    255                       AS level,
    TRUE                      AS is_owner,
    operation,
    block_height,
    block_timestamp,
    receipt_id,
    id
  FROM group_updates
  WHERE group_id IS NOT NULL
    AND group_id != ''
    AND author IS NOT NULL
    AND author != ''
    AND operation = 'create_group'

  UNION ALL

  SELECT
    group_id,
    member_id,
    role,
    level,
    FALSE                     AS is_owner,
    operation,
    block_height,
    block_timestamp,
    receipt_id,
    id
  FROM group_updates
  WHERE group_id IS NOT NULL
    AND group_id != ''
    AND member_id IS NOT NULL
    AND member_id != ''
    AND operation IN ('add_member', 'remove_member', 'add_to_blacklist')
), latest AS (
  SELECT DISTINCT ON (group_id, member_id)
    group_id,
    member_id,
    role,
    level,
    is_owner,
    operation,
    block_height,
    block_timestamp,
    receipt_id,
    id
  FROM membership_events
  ORDER BY group_id, member_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
)
SELECT
  latest.group_id,
  latest.member_id,
  COALESCE(NULLIF(latest.role, ''), CASE WHEN latest.is_owner THEN 'owner' ELSE 'member' END) AS role,
  latest.level,
  latest.is_owner,
  (latest.is_owner OR latest.level >= 3) AS is_admin,
  (latest.is_owner OR latest.level >= 2) AS can_moderate,
  groups_current.group_name,
  groups_current.is_public,
  latest.block_height,
  latest.block_timestamp,
  groups_current.group_description,
  groups_current.group_avatar_cid,
  groups_current.group_banner_cid,
  groups_current.is_member_driven
FROM latest
LEFT JOIN groups_current ON groups_current.group_id = latest.group_id
WHERE latest.operation IN ('create_group', 'add_member');

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
-- 6c. posts_feed — posts + author shell + optional guild name (Home/list UIs)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW posts_feed AS
SELECT
  p.account_id,
  p.post_id,
  p.value,
  p.block_height,
  p.block_timestamp,
  p.receipt_id,
  p.parent_path,
  p.parent_author,
  p.parent_type,
  p.ref_path,
  p.ref_author,
  p.ref_type,
  p.channel,
  p.kind,
  p.audiences,
  p.group_id,
  p.is_group_content,
  ps.name AS author_name,
  ps.avatar AS author_avatar,
  g.group_name AS group_name
FROM posts_current p
LEFT JOIN profile_search ps
  ON ps.account_id = p.account_id
LEFT JOIN groups_current g
  ON g.group_id = p.group_id
 AND p.group_id IS NOT NULL
 AND p.group_id <> '';

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
-- 8a. thread_reply_counts — aggregate reply counts per parent post
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW thread_reply_counts AS
SELECT
  parent_author,
  parent_path,
  COUNT(*)          AS reply_count,
  MAX(block_height) AS last_reply_block
FROM thread_replies
GROUP BY parent_author, parent_path;

-- ────────────────────────────────────────────────────────────────────────────
-- 8b. quote_counts — aggregate quote counts per referenced post
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW quote_counts AS
SELECT
  ref_author,
  ref_path,
  COUNT(*)          AS quote_count,
  MAX(block_height) AS last_quote_block
FROM quotes
GROUP BY ref_author, ref_path;

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
FROM posts_current p
CROSS JOIN LATERAL jsonb_array_elements_text(
  (
    CASE
      WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
      ELSE NULL
    END
  ) -> 'hashtags'
) AS ht(tag)
WHERE p.value IS NOT NULL
  AND p.value != ''
  AND p.value ~ '^[\[\{]'
  AND jsonb_typeof(
    (
      CASE
        WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
        ELSE NULL
      END
    ) -> 'hashtags'
  ) = 'array'
  AND length(trim(ht.tag)) > 0;

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
-- 13b. post_tickers — ticker/cashtag-to-post junction
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW post_tickers AS
SELECT
  p.account_id,
  p.post_id,
  lower(trim(tk.sym)) AS ticker,
  p.block_height,
  p.block_timestamp,
  p.group_id
FROM posts_current p
CROSS JOIN LATERAL jsonb_array_elements_text(
  (
    CASE
      WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
      ELSE NULL
    END
  ) -> 'tickers'
) AS tk(sym)
WHERE p.value IS NOT NULL
  AND p.value != ''
  AND p.value ~ '^[\[\{]'
  AND jsonb_typeof(
    (
      CASE
        WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
        ELSE NULL
      END
    ) -> 'tickers'
  ) = 'array'
  AND length(trim(tk.sym)) > 0;

-- ────────────────────────────────────────────────────────────────────────────
-- 13c. ticker_counts — aggregate post count per ticker
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW ticker_counts AS
SELECT
  ticker,
  count(*)          AS post_count,
  max(block_height) AS last_block
FROM post_tickers
GROUP BY ticker;

-- ────────────────────────────────────────────────────────────────────────────
-- 13d. profile_hashtags — hashtag-to-profile junction (bio-derived arrays)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW profile_hashtags AS
SELECT
  p.account_id,
  lower(trim(ht.tag)) AS hashtag,
  p.block_height,
  p.block_timestamp
FROM profiles_current p
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN p.value ~ '^\[.*\]$' THEN p.value::jsonb
    ELSE NULL
  END
) AS ht(tag)
WHERE p.field = 'hashtags'
  AND p.value IS NOT NULL
  AND p.value != ''
  AND p.value ~ '^\[.*\]$'
  AND jsonb_typeof(
    CASE
      WHEN p.value ~ '^\[.*\]$' THEN p.value::jsonb
      ELSE NULL
    END
  ) = 'array'
  AND length(trim(ht.tag)) > 0;

-- ────────────────────────────────────────────────────────────────────────────
-- 13e. profile_tickers — ticker-to-profile junction (bio-derived arrays)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW profile_tickers AS
SELECT
  p.account_id,
  lower(trim(tk.sym)) AS ticker,
  p.block_height,
  p.block_timestamp
FROM profiles_current p
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN p.value ~ '^\[.*\]$' THEN p.value::jsonb
    ELSE NULL
  END
) AS tk(sym)
WHERE p.field = 'tickers'
  AND p.value IS NOT NULL
  AND p.value != ''
  AND p.value ~ '^\[.*\]$'
  AND jsonb_typeof(
    CASE
      WHEN p.value ~ '^\[.*\]$' THEN p.value::jsonb
      ELSE NULL
    END
  ) = 'array'
  AND length(trim(tk.sym)) > 0;

-- ────────────────────────────────────────────────────────────────────────────
-- 13f. profile_mentions — mention-to-profile junction (bio-derived arrays)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW profile_mentions AS
SELECT
  p.account_id,
  lower(trim(m.account)) AS mentioned_account_id,
  p.block_height,
  p.block_timestamp
FROM profiles_current p
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN p.value ~ '^\[.*\]$' THEN p.value::jsonb
    ELSE NULL
  END
) AS m(account)
WHERE p.field = 'mentions'
  AND p.value IS NOT NULL
  AND p.value != ''
  AND p.value ~ '^\[.*\]$'
  AND jsonb_typeof(
    CASE
      WHEN p.value ~ '^\[.*\]$' THEN p.value::jsonb
      ELSE NULL
    END
  ) = 'array'
  AND length(trim(m.account)) > 0;

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
