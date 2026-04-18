-- ============================================================================
-- OnSocial Core – Materialized Views
-- ============================================================================
-- Layer 2 materialization: current-state entity views on top of the raw
-- append-only data_updates event log.
--
-- Refresh strategy: REFRESH MATERIALIZED VIEW CONCURRENTLY via pg_cron or
-- a backend worker every 30s–5min. The UNIQUE indexes enable concurrent
-- (zero-downtime) refresh.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Additional indexes required for efficient view refresh
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_data_updates_data_type_account
  ON data_updates(data_type, account_id);

CREATE INDEX IF NOT EXISTS idx_data_updates_target_account
  ON data_updates(target_account) WHERE target_account IS NOT NULL AND target_account != '';

CREATE INDEX IF NOT EXISTS idx_data_updates_data_type_block_height
  ON data_updates(data_type, block_height DESC);

CREATE INDEX IF NOT EXISTS idx_data_updates_parent_author
  ON data_updates(parent_author) WHERE parent_author IS NOT NULL AND parent_author != '';

CREATE INDEX IF NOT EXISTS idx_data_updates_group_id_data_type
  ON data_updates(group_id, data_type) WHERE group_id IS NOT NULL AND group_id != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. profiles_current — latest profile fields per account
-- ────────────────────────────────────────────────────────────────────────────
-- Each profile field (name, bio, avatar, …) is a separate data_updates row
-- with data_type = 'profile'.  This view deduplicates to the latest value
-- per (account, field) pair.
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS profiles_current AS
SELECT DISTINCT ON (account_id, data_id)
  account_id,
  data_id        AS field,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'profile'
ORDER BY account_id, data_id, block_height DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_current_pk
  ON profiles_current(account_id, field);
CREATE INDEX IF NOT EXISTS idx_profiles_current_account
  ON profiles_current(account_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. posts_current — latest state of each post (deduped edits + deletes)
-- ────────────────────────────────────────────────────────────────────────────
-- data_type = 'post', path = {account}/post/{id}
-- A post edited 5 times produces 5 data_updates rows; this collapses to 1.
-- Posts with operation = 'remove' are excluded (soft-deleted).
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS posts_current AS
SELECT DISTINCT ON (account_id, data_id)
  account_id,
  data_id                      AS post_id,
  value,
  block_height,
  block_timestamp,
  receipt_id,
  -- Thread fields (populated if post is a reply or quote)
  parent_path,
  parent_author,
  parent_type,
  ref_path,
  ref_author,
  ref_type,
  -- Group context
  group_id,
  is_group_content
FROM data_updates
WHERE data_type = 'post'
  AND operation = 'set'
ORDER BY account_id, data_id, block_height DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_current_pk
  ON posts_current(account_id, post_id);
CREATE INDEX IF NOT EXISTS idx_posts_current_block
  ON posts_current(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_posts_current_parent_author
  ON posts_current(parent_author) WHERE parent_author IS NOT NULL AND parent_author != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_group
  ON posts_current(group_id) WHERE group_id IS NOT NULL AND group_id != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. standings_current — social graph (who stands with whom)
-- ────────────────────────────────────────────────────────────────────────────
-- data_type = 'standing', path = {account}/standing/{target}
-- Latest write per (account, target) pair. If last operation is 'remove'
-- the row is excluded (un-stood).
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS standings_current AS
SELECT DISTINCT ON (account_id, target_account)
  account_id,
  target_account,
  value,
  block_height,
  block_timestamp
FROM data_updates
WHERE data_type = 'standing'
  AND target_account IS NOT NULL
  AND target_account != ''
  AND operation = 'set'
ORDER BY account_id, target_account, block_height DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_standings_current_pk
  ON standings_current(account_id, target_account);
CREATE INDEX IF NOT EXISTS idx_standings_current_target
  ON standings_current(target_account);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. reactions_current — per-user reaction state on a target post
-- ────────────────────────────────────────────────────────────────────────────
-- data_type = 'reaction', path = {account}/reaction/{target_owner}/{kind}/post/{id}
-- target_account = the post owner; reaction_kind = 'like' | 'bookmark' | …
-- A single reactor may emit multiple reactions of different kinds against the
-- same target (each occupies its own row).
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS reactions_current AS
SELECT DISTINCT ON (account_id, path)
  account_id,
  target_account               AS post_owner,
  reaction_kind,
  path,
  value,
  block_height,
  block_timestamp,
  operation   -- 'set' = reacted, 'remove' = un-reacted
FROM data_updates
WHERE data_type = 'reaction'
ORDER BY account_id, path, block_height DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_current_pk
  ON reactions_current(account_id, path);
CREATE INDEX IF NOT EXISTS idx_reactions_current_post_owner
  ON reactions_current(post_owner) WHERE post_owner IS NOT NULL AND post_owner != '';
CREATE INDEX IF NOT EXISTS idx_reactions_current_kind
  ON reactions_current(reaction_kind) WHERE reaction_kind IS NOT NULL AND reaction_kind != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. reaction_counts — aggregate reaction counts per target post, per kind
-- ────────────────────────────────────────────────────────────────────────────
-- Depends on reactions_current; counts only active reactions (operation='set').
-- v1 path: {account}/reaction/{owner}/{kind}/{post_path}
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS reaction_counts AS
SELECT
  post_owner,
  reaction_kind,
  -- Extract the post path portion after "reaction/{owner}/{kind}/"
  SUBSTRING(path FROM '/reaction/[^/]+/[^/]+/(.+)$') AS post_path,
  COUNT(*)                                            AS reaction_count,
  MAX(block_height)                                   AS last_reaction_block
FROM reactions_current
WHERE operation = 'set'
GROUP BY post_owner, reaction_kind, SUBSTRING(path FROM '/reaction/[^/]+/[^/]+/(.+)$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_counts_pk
  ON reaction_counts(post_owner, reaction_kind, post_path);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. standing_counts — follower / standing-with counts per account
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS standing_counts AS
SELECT
  target_account                AS account_id,
  COUNT(*)                      AS standing_with_count, -- people standing with this account
  MAX(block_height)             AS last_standing_block
FROM standings_current
GROUP BY target_account;

CREATE UNIQUE INDEX IF NOT EXISTS idx_standing_counts_pk
  ON standing_counts(account_id);

-- Also: how many people each account stands with
CREATE MATERIALIZED VIEW IF NOT EXISTS standing_out_counts AS
SELECT
  account_id,
  COUNT(*)                      AS standing_with_others_count,
  MAX(block_height)             AS last_standing_block
FROM standings_current
GROUP BY account_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_standing_out_counts_pk
  ON standing_out_counts(account_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. thread_replies — posts that reply to a parent post
-- ────────────────────────────────────────────────────────────────────────────
-- Joins posts_current where parent_author IS NOT NULL. Allows efficient
-- "get all replies to this post" queries.
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS thread_replies AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_replies_pk
  ON thread_replies(reply_author, reply_id);
CREATE INDEX IF NOT EXISTS idx_thread_replies_parent
  ON thread_replies(parent_author, parent_path);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. quotes — posts that quote/reference another post
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS quotes AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_pk
  ON quotes(quote_author, quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_ref
  ON quotes(ref_author, ref_path);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. edges_current — generic directed relationships (endorsement, attestation…)
-- ────────────────────────────────────────────────────────────────────────────
-- Covers all target_account data types NOT already materialised in
-- standings_current or reactions_current.
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS edges_current AS
SELECT DISTINCT ON (account_id, target_account, data_type)
  account_id       AS source,
  target_account   AS target,
  data_type        AS edge_type,
  value,
  block_height,
  block_timestamp,
  operation,
  group_id
FROM data_updates
WHERE target_account IS NOT NULL
  AND target_account != ''
  AND data_type NOT IN ('standing', 'reaction', 'post', 'profile')
ORDER BY account_id, target_account, data_type, block_height DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_current_pk
  ON edges_current(source, target, edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_current_target
  ON edges_current(target);

-- ────────────────────────────────────────────────────────────────────────────
-- 10. edge_counts — aggregate inbound edge counts per type
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS edge_counts AS
SELECT
  target           AS account_id,
  edge_type,
  COUNT(*)         AS inbound_count,
  MAX(block_height) AS last_block
FROM edges_current
WHERE operation = 'set'
GROUP BY target, edge_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_counts_pk
  ON edge_counts(account_id, edge_type);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. thread_replies — posts that are replies (have a parent)
-- ────────────────────────────────────────────────────────────────────────────
-- Useful for fetching "replies to post X" without scanning all posts.
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS thread_replies AS
SELECT
  account_id                   AS reply_author,
  post_id                      AS reply_id,
  parent_author,
  parent_path,
  parent_type,
  value,
  block_height,
  block_timestamp,
  group_id
FROM posts_current
WHERE parent_author IS NOT NULL AND parent_author != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_replies_pk
  ON thread_replies(reply_author, reply_id);
CREATE INDEX IF NOT EXISTS idx_thread_replies_parent
  ON thread_replies(parent_author, parent_path);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. quotes — posts that quote another post (have a ref)
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS quotes AS
SELECT
  account_id                   AS quote_author,
  post_id                      AS quote_id,
  ref_author,
  ref_path,
  ref_type,
  value,
  block_height,
  block_timestamp,
  group_id
FROM posts_current
WHERE ref_author IS NOT NULL AND ref_author != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_pk
  ON quotes(quote_author, quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_ref
  ON quotes(ref_author, ref_path);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. edges_current — generic social graph (ALL relationship types)
-- ────────────────────────────────────────────────────────────────────────────
-- Captures every path where target_account is populated:
--   standing/{target}           → edge_type = 'standing'
--   reaction/{target}/...       → edge_type = 'reaction'
--   endorsement/{target}        → edge_type = 'endorsement'
--   delegate/{target}           → edge_type = 'delegate'
--   mentor/{target}             → edge_type = 'mentor'
--   block/{target}              → edge_type = 'block'
--   ...any future relationship type works automatically
--
-- This is the universal graph primitive. Specific views (standings_current,
-- reactions_current) are convenience layers on top.
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS edges_current AS
SELECT DISTINCT ON (account_id, data_type, target_account)
  account_id                   AS source,
  target_account               AS target,
  data_type                    AS edge_type,
  value,
  block_height,
  block_timestamp,
  operation,                             -- 'set' = active, 'remove' = deleted
  group_id                               -- NULL for user→user, set for group-scoped edges
FROM data_updates
WHERE target_account IS NOT NULL
  AND target_account != ''
ORDER BY account_id, data_type, target_account, block_height DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_current_pk
  ON edges_current(source, edge_type, target);
CREATE INDEX IF NOT EXISTS idx_edges_current_target
  ON edges_current(target, edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_current_type
  ON edges_current(edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_current_group
  ON edges_current(group_id) WHERE group_id IS NOT NULL AND group_id != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 10. edge_counts — per (account, edge_type) counts
-- ────────────────────────────────────────────────────────────────────────────
-- "How many people endorse alice?" → edge_counts WHERE account_id = 'alice' AND edge_type = 'endorsement'
-- Replaces the need for separate standing_counts, endorsement_counts, etc.
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS edge_counts AS
SELECT
  target                       AS account_id,
  edge_type,
  COUNT(*)                     AS inbound_count,
  MAX(block_height)            AS last_block
FROM edges_current
WHERE operation = 'set'
GROUP BY target, edge_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_counts_pk
  ON edge_counts(account_id, edge_type);

-- ────────────────────────────────────────────────────────────────────────────
-- 11. claims_current — latest attestation per (issuer, subject, type, claimId)
-- ────────────────────────────────────────────────────────────────────────────
-- data_type = 'claims', path = {issuer}/claims/{subject}/{type}/{claimId}
-- The issuing account is `account_id` (first path segment).
-- Subject / type / claimId parsed from the rest. operation='set' means active,
-- 'remove' means revoked.
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS claims_current AS
SELECT DISTINCT ON (account_id, path)
  account_id                                                              AS issuer,
  (regexp_match(path, '/claims/([^/]+)/([^/]+)/(.+)$'))[1]                AS subject,
  (regexp_match(path, '/claims/([^/]+)/([^/]+)/(.+)$'))[2]                AS claim_type,
  (regexp_match(path, '/claims/([^/]+)/([^/]+)/(.+)$'))[3]                AS claim_id,
  path,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'claims'
ORDER BY account_id, path, block_height DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_current_pk
  ON claims_current(account_id, path);
CREATE INDEX IF NOT EXISTS idx_claims_current_subject
  ON claims_current(subject) WHERE subject IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_current_type
  ON claims_current(claim_type) WHERE claim_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_current_subject_type
  ON claims_current(subject, claim_type) WHERE subject IS NOT NULL AND claim_type IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. post_hashtags — hashtag-to-post junction (extracted from value JSON)
-- ────────────────────────────────────────────────────────────────────────────
-- Posts store hashtags in value JSON as `"hashtags": ["tag1", "tag2"]`.
-- This view unnests the array into one row per (hashtag, post) for efficient
-- tag-based discovery and trending aggregation.
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS post_hashtags AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_hashtags_pk
  ON post_hashtags(hashtag, account_id, post_id);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag
  ON post_hashtags(hashtag);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag_block
  ON post_hashtags(hashtag, block_height DESC);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_account
  ON post_hashtags(account_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 13. hashtag_counts — aggregate post count per hashtag
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS hashtag_counts AS
SELECT
  hashtag,
  count(*)          AS post_count,
  max(block_height) AS last_block
FROM post_hashtags
GROUP BY hashtag;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hashtag_counts_pk
  ON hashtag_counts(hashtag);
CREATE INDEX IF NOT EXISTS idx_hashtag_counts_popular
  ON hashtag_counts(post_count DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- Refresh helper (call from pg_cron or backend worker)
-- ────────────────────────────────────────────────────────────────────────────
-- Example pg_cron: SELECT cron.schedule('refresh-core-views', '*/1 * * * *',
--   $$SELECT refresh_core_views()$$);
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_core_views() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY profiles_current;
  REFRESH MATERIALIZED VIEW CONCURRENTLY posts_current;
  REFRESH MATERIALIZED VIEW CONCURRENTLY standings_current;
  REFRESH MATERIALIZED VIEW CONCURRENTLY reactions_current;
  -- These depend on the above, refresh after
  REFRESH MATERIALIZED VIEW CONCURRENTLY reaction_counts;
  REFRESH MATERIALIZED VIEW CONCURRENTLY standing_counts;
  REFRESH MATERIALIZED VIEW CONCURRENTLY standing_out_counts;
  REFRESH MATERIALIZED VIEW CONCURRENTLY thread_replies;
  REFRESH MATERIALIZED VIEW CONCURRENTLY quotes;
  REFRESH MATERIALIZED VIEW CONCURRENTLY edges_current;
  REFRESH MATERIALIZED VIEW CONCURRENTLY edge_counts;
  REFRESH MATERIALIZED VIEW CONCURRENTLY claims_current;
  -- Hashtags depend on posts_current
  REFRESH MATERIALIZED VIEW CONCURRENTLY post_hashtags;
  REFRESH MATERIALIZED VIEW CONCURRENTLY hashtag_counts;
END;
$$ LANGUAGE plpgsql;
