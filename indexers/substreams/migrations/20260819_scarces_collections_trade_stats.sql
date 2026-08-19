-- Per-collection sales rollup for Discover "Most traded" / Drops sort=traded.
-- View source of truth: scarces_schema_views.sql (reapplied on sink deploy).
--
-- Migration shape uses event.collection_id only so it can apply before
-- scarces_token_owners exists. The views file resolves missing collection_id
-- via scarces_token_owners for secondary sales.

CREATE OR REPLACE VIEW scarces_collections_trade_stats AS
WITH collection_apps AS (
  SELECT DISTINCT ON (collection_id)
    collection_id,
    NULLIF(app_id, '') AS app_id
  FROM scarces_events
  WHERE event_type = 'COLLECTION_UPDATE'
    AND operation = 'create'
    AND NULLIF(collection_id, '') IS NOT NULL
  ORDER BY collection_id, block_height DESC, id DESC
),
sales AS (
  SELECT
    NULLIF(e.collection_id, '')                                 AS collection_id,
    COALESCE(NULLIF(e.app_id, ''), ca.app_id)                   AS app_id,
    COALESCE(
      CASE WHEN e.price ~ '^[0-9]+$' THEN e.price::NUMERIC END,
      CASE WHEN e.amount ~ '^[0-9]+$' THEN e.amount::NUMERIC END,
      CASE WHEN e.winning_bid ~ '^[0-9]+$' THEN e.winning_bid::NUMERIC END,
      0
    )                                                           AS volume,
    e.block_timestamp
  FROM scarces_events e
  LEFT JOIN collection_apps ca
    ON ca.collection_id = NULLIF(e.collection_id, '')
  WHERE
    NULLIF(e.collection_id, '') IS NOT NULL
    AND (
      (e.event_type = 'COLLECTION_UPDATE' AND e.operation = 'purchase')
      OR (e.event_type = 'LAZY_LISTING_UPDATE' AND e.operation = 'purchased')
      OR (e.event_type = 'SCARCE_UPDATE'
        AND e.operation IN ('purchase', 'auction_settled'))
      OR (e.event_type = 'OFFER_UPDATE'
        AND e.operation IN ('offer_accepted', 'collection_offer_accepted'))
    )
)
SELECT
  collection_id,
  MAX(app_id)                                                   AS app_id,
  COUNT(*)::BIGINT                                              AS sales_count,
  SUM(volume)                                                   AS sales_volume,
  MAX(block_timestamp)                                          AS last_sale_timestamp
FROM sales
WHERE collection_id IS NOT NULL
GROUP BY collection_id;
