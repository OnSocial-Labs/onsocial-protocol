-- Top recent album love fan ids for Drops/Market facepiles.
-- View source of truth: core_schema_views.sql (reapplied on sink deploy).

CREATE OR REPLACE VIEW scarce_album_love_fan_ids AS
WITH fan_loves AS (
  SELECT
    post_owner,
    SUBSTRING(path FROM '/scarce/([^/]+)/track/') AS collection_id,
    account_id,
    MAX(block_height) AS last_love_block
  FROM reactions_current
  WHERE operation = 'set'
    AND reaction_kind = 'love'
    AND path LIKE '%/scarce/%/track/%'
    AND lower(account_id) IS DISTINCT FROM lower(post_owner)
  GROUP BY
    post_owner,
    SUBSTRING(path FROM '/scarce/([^/]+)/track/'),
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
