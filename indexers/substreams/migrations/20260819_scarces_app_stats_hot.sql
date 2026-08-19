-- 30-day hub activity rollup for Discover hub peeks.
-- View source of truth: scarces_schema_views.sql (reapplied on sink deploy).
-- Same columns as scarces_app_stats; drops/mints/sales filtered to 30d window.

CREATE OR REPLACE VIEW scarces_app_stats_hot AS
WITH window_start_ns AS (
  SELECT (EXTRACT(EPOCH FROM (NOW() - INTERVAL '30 days')) * 1e9)::BIGINT AS ts
),
collection_apps AS (
  SELECT DISTINCT ON (collection_id)
    collection_id,
    NULLIF(app_id, '') AS app_id
  FROM scarces_events
  WHERE event_type = 'COLLECTION_UPDATE'
    AND operation = 'create'
    AND NULLIF(collection_id, '') IS NOT NULL
  ORDER BY collection_id, block_height DESC, id DESC
),
drops AS (
  SELECT
    NULLIF(app_id, '')                                          AS app_id,
    block_timestamp
  FROM scarces_events, window_start_ns w
  WHERE event_type = 'COLLECTION_UPDATE'
    AND operation = 'create'
    AND NULLIF(app_id, '') IS NOT NULL
    AND block_timestamp >= w.ts
),
mints AS (
  SELECT
    COALESCE(NULLIF(e.app_id, ''), ca.app_id)                   AS app_id,
    COALESCE(
      NULLIF(e.quantity, 0),
      CASE WHEN e.token_ids LIKE '[%'
        THEN jsonb_array_length(e.token_ids::jsonb) END,
      1
    )                                                           AS minted,
    e.block_timestamp
  FROM scarces_events e
  CROSS JOIN window_start_ns w
  LEFT JOIN collection_apps ca ON ca.collection_id = NULLIF(e.collection_id, '')
  WHERE
    e.block_timestamp >= w.ts
    AND (
      (e.event_type = 'COLLECTION_UPDATE'
        AND e.operation IN ('purchase', 'creator_mint', 'airdrop'))
      OR (e.event_type = 'LAZY_LISTING_UPDATE' AND e.operation = 'purchased')
      OR (e.event_type = 'SCARCE_UPDATE' AND e.operation = 'quick_mint')
    )
),
sales AS (
  SELECT
    COALESCE(NULLIF(e.app_id, ''), ca.app_id)                   AS app_id,
    COALESCE(
      CASE WHEN e.price ~ '^[0-9]+$' THEN e.price::NUMERIC END,
      CASE WHEN e.amount ~ '^[0-9]+$' THEN e.amount::NUMERIC END,
      CASE WHEN e.winning_bid ~ '^[0-9]+$' THEN e.winning_bid::NUMERIC END,
      0
    )                                                           AS volume,
    e.block_timestamp
  FROM scarces_events e
  CROSS JOIN window_start_ns w
  LEFT JOIN collection_apps ca ON ca.collection_id = NULLIF(e.collection_id, '')
  WHERE
    e.block_timestamp >= w.ts
    AND (
      (e.event_type = 'COLLECTION_UPDATE' AND e.operation = 'purchase')
      OR (e.event_type = 'LAZY_LISTING_UPDATE' AND e.operation = 'purchased')
      OR (e.event_type = 'SCARCE_UPDATE'
        AND e.operation IN ('purchase', 'auction_settled'))
      OR (e.event_type = 'OFFER_UPDATE'
        AND e.operation IN ('offer_accepted', 'collection_offer_accepted'))
    )
),
app_ids AS (
  SELECT app_id FROM scarces_apps
  UNION
  SELECT DISTINCT app_id FROM drops WHERE app_id IS NOT NULL
  UNION
  SELECT DISTINCT app_id FROM sales WHERE app_id IS NOT NULL
  UNION
  SELECT DISTINCT app_id FROM mints WHERE app_id IS NOT NULL
),
drop_stats AS (
  SELECT app_id, COUNT(*)::BIGINT AS drops_total,
         MAX(block_timestamp) AS last_drop_timestamp
  FROM drops GROUP BY app_id
),
mint_stats AS (
  SELECT app_id, SUM(minted)::BIGINT AS minted_total,
         MAX(block_timestamp) AS last_mint_timestamp
  FROM mints WHERE app_id IS NOT NULL GROUP BY app_id
),
sale_stats AS (
  SELECT app_id, COUNT(*)::BIGINT AS sales_count,
         SUM(volume) AS sales_volume,
         MAX(block_timestamp) AS last_sale_timestamp
  FROM sales WHERE app_id IS NOT NULL GROUP BY app_id
),
holder_stats AS (
  SELECT app_id,
         COUNT(DISTINCT owner_id) FILTER (
           WHERE NOT burned AND owner_id IS NOT NULL
         )::BIGINT AS unique_holders
  FROM scarces_token_owners
  WHERE app_id IS NOT NULL
  GROUP BY app_id
),
listing_stats AS (
  SELECT app_id, COUNT(*)::BIGINT AS live_listings
  FROM scarces_active_listings
  WHERE NULLIF(app_id, '') IS NOT NULL
  GROUP BY app_id
)
SELECT
  a.app_id,
  COALESCE(d.drops_total, 0)                                    AS drops_total,
  COALESCE(m.minted_total, 0)                                   AS minted_total,
  COALESCE(h.unique_holders, 0)                                 AS unique_holders,
  COALESCE(s.sales_count, 0)                                    AS sales_count,
  COALESCE(s.sales_volume, 0)                                   AS sales_volume,
  COALESCE(l.live_listings, 0)                                  AS live_listings,
  GREATEST(
    COALESCE(d.last_drop_timestamp, 0),
    COALESCE(m.last_mint_timestamp, 0),
    COALESCE(s.last_sale_timestamp, 0)
  )                                                             AS last_activity_timestamp
FROM app_ids a
LEFT JOIN drop_stats d    USING (app_id)
LEFT JOIN mint_stats m    USING (app_id)
LEFT JOIN sale_stats s    USING (app_id)
LEFT JOIN holder_stats h  USING (app_id)
LEFT JOIN listing_stats l USING (app_id);
