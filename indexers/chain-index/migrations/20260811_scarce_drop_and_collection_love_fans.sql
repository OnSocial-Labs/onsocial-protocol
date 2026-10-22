-- Whole-Drop loves (`scarce/{collectionId}`) + discovery union (track ∪ drop).
-- View source of truth: core_schema_views.sql (reapplied on sink deploy).

CREATE INDEX IF NOT EXISTS idx_data_updates_scarce_drop_love
  ON data_updates (
    target_account,
    (SUBSTRING(path FROM '/scarce/([^/]+)$'))
  )
  WHERE data_type = 'reaction'
    AND reaction_kind = 'love'
    AND path ~ '/scarce/[^/]+$';

CREATE OR REPLACE VIEW scarce_drop_love_fans AS
SELECT
  post_owner,
  SUBSTRING(path FROM '/scarce/([^/]+)$') AS collection_id,
  COUNT(DISTINCT account_id) FILTER (
    WHERE lower(account_id) IS DISTINCT FROM lower(post_owner)
  ) AS fan_count,
  MAX(block_height) AS last_love_block
FROM reactions_current
WHERE operation = 'set'
  AND reaction_kind = 'love'
  AND path ~ '/scarce/[^/]+$'
GROUP BY post_owner, SUBSTRING(path FROM '/scarce/([^/]+)$');

CREATE OR REPLACE VIEW scarce_drop_love_fan_ids AS
WITH fan_loves AS (
  SELECT
    post_owner,
    SUBSTRING(path FROM '/scarce/([^/]+)$') AS collection_id,
    account_id,
    MAX(block_height) AS last_love_block
  FROM reactions_current
  WHERE operation = 'set'
    AND reaction_kind = 'love'
    AND path ~ '/scarce/[^/]+$'
    AND lower(account_id) IS DISTINCT FROM lower(post_owner)
  GROUP BY
    post_owner,
    SUBSTRING(path FROM '/scarce/([^/]+)$'),
    account_id
),
ranked AS (
  SELECT
    post_owner,
    collection_id,
    account_id,
    last_love_block,
    ROW_NUMBER() OVER (
      PARTITION BY post_owner, collection_id
      ORDER BY last_love_block DESC, account_id ASC
    ) AS rn
  FROM fan_loves
)
SELECT
  post_owner,
  collection_id,
  COALESCE(
    array_agg(account_id ORDER BY rn) FILTER (WHERE rn <= 5),
    ARRAY[]::text[]
  ) AS fan_account_ids,
  COUNT(*)::bigint AS fan_count,
  MAX(last_love_block) AS last_love_block
FROM ranked
GROUP BY post_owner, collection_id;

CREATE OR REPLACE VIEW scarce_collection_love_fans AS
WITH loves AS (
  SELECT
    post_owner,
    SUBSTRING(path FROM '/scarce/([^/]+)/track/') AS collection_id,
    account_id,
    block_height
  FROM reactions_current
  WHERE operation = 'set'
    AND reaction_kind = 'love'
    AND path LIKE '%/scarce/%/track/%'
    AND lower(account_id) IS DISTINCT FROM lower(post_owner)

  UNION ALL

  SELECT
    post_owner,
    SUBSTRING(path FROM '/scarce/([^/]+)$') AS collection_id,
    account_id,
    block_height
  FROM reactions_current
  WHERE operation = 'set'
    AND reaction_kind = 'love'
    AND path ~ '/scarce/[^/]+$'
    AND lower(account_id) IS DISTINCT FROM lower(post_owner)
),
dedup AS (
  SELECT
    post_owner,
    collection_id,
    account_id,
    MAX(block_height) AS last_love_block
  FROM loves
  WHERE collection_id IS NOT NULL AND collection_id <> ''
  GROUP BY post_owner, collection_id, account_id
)
SELECT
  post_owner,
  collection_id,
  COUNT(*)::bigint AS fan_count,
  MAX(last_love_block) AS last_love_block
FROM dedup
GROUP BY post_owner, collection_id;

CREATE OR REPLACE VIEW scarce_collection_love_fan_ids AS
WITH loves AS (
  SELECT
    post_owner,
    SUBSTRING(path FROM '/scarce/([^/]+)/track/') AS collection_id,
    account_id,
    block_height
  FROM reactions_current
  WHERE operation = 'set'
    AND reaction_kind = 'love'
    AND path LIKE '%/scarce/%/track/%'
    AND lower(account_id) IS DISTINCT FROM lower(post_owner)

  UNION ALL

  SELECT
    post_owner,
    SUBSTRING(path FROM '/scarce/([^/]+)$') AS collection_id,
    account_id,
    block_height
  FROM reactions_current
  WHERE operation = 'set'
    AND reaction_kind = 'love'
    AND path ~ '/scarce/[^/]+$'
    AND lower(account_id) IS DISTINCT FROM lower(post_owner)
),
fan_loves AS (
  SELECT
    post_owner,
    collection_id,
    account_id,
    MAX(block_height) AS last_love_block
  FROM loves
  WHERE collection_id IS NOT NULL AND collection_id <> ''
  GROUP BY post_owner, collection_id, account_id
),
ranked AS (
  SELECT
    post_owner,
    collection_id,
    account_id,
    last_love_block,
    ROW_NUMBER() OVER (
      PARTITION BY post_owner, collection_id
      ORDER BY last_love_block DESC, account_id ASC
    ) AS rn
  FROM fan_loves
)
SELECT
  post_owner,
  collection_id,
  COALESCE(
    array_agg(account_id ORDER BY rn) FILTER (WHERE rn <= 5),
    ARRAY[]::text[]
  ) AS fan_account_ids,
  COUNT(*)::bigint AS fan_count,
  MAX(last_love_block) AS last_love_block
FROM ranked
GROUP BY post_owner, collection_id;
