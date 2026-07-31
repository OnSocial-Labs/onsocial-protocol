-- ============================================================================
-- OnSocial Scarces Derived Views
-- ============================================================================
-- Per-token ownership ledger and per-app (hub) rollup stats derived from the
-- append-only scarces_events log.
--
-- Depends on:
--   scarces_schema.sql → scarces_events, scarces_apps, scarces_active_listings
--
-- Views:
--   1. scarces_token_owners — current owner per token (latest ownership event)
--   2. scarces_app_stats    — per-app drops / minted / holders / sales volume
--
-- Both are regular live views. If event volume makes them slow, materialize
-- with a refresh in the sink deploy — the read shape stays the same.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. scarces_token_owners — current owner per token
-- ────────────────────────────────────────────────────────────────────────────
-- Ownership transitions come from several event shapes:
--   SCARCE_UPDATE/quick_mint          owner_id           (single token)
--   SCARCE_UPDATE/transfer            receiver_id        (single token)
--   SCARCE_UPDATE/purchase            buyer_id           (single token)
--   SCARCE_UPDATE/auction_settled     winner_id|buyer_id (single token)
--   SCARCE_UPDATE/burn                — token leaves circulation
--   OFFER_UPDATE/offer_accepted, collection_offer_accepted → buyer_id
--   COLLECTION_UPDATE/purchase        buyer_id     (token_ids JSON array)
--   COLLECTION_UPDATE/creator_mint    receiver_id  (token_ids JSON array)
--   COLLECTION_UPDATE/airdrop         receivers[i] (token_ids ↔ receivers zip)
--   LAZY_LISTING_UPDATE/purchased     buyer_id     (token_id or token_ids)
--
-- App attribution: the event's app_id when present, else the app the token's
-- collection was created under.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW scarces_token_owners AS
WITH single_token AS (
  SELECT
    NULLIF(token_id, '')                                        AS token_id,
    CASE
      WHEN event_type = 'SCARCE_UPDATE' AND operation = 'quick_mint'
        THEN NULLIF(owner_id, '')
      WHEN event_type = 'SCARCE_UPDATE' AND operation = 'transfer'
        THEN NULLIF(receiver_id, '')
      WHEN event_type = 'SCARCE_UPDATE' AND operation = 'purchase'
        THEN NULLIF(buyer_id, '')
      WHEN event_type = 'SCARCE_UPDATE' AND operation = 'auction_settled'
        THEN COALESCE(NULLIF(winner_id, ''), NULLIF(buyer_id, ''))
      WHEN event_type = 'OFFER_UPDATE'
        THEN NULLIF(buyer_id, '')
      WHEN event_type = 'LAZY_LISTING_UPDATE' AND operation = 'purchased'
        THEN NULLIF(buyer_id, '')
      ELSE NULL
    END                                                         AS owner_id,
    (event_type = 'SCARCE_UPDATE' AND operation = 'burn')       AS burned,
    (
      (event_type = 'SCARCE_UPDATE' AND operation = 'quick_mint')
      OR (event_type = 'LAZY_LISTING_UPDATE' AND operation = 'purchased')
    )                                                           AS minted,
    NULLIF(collection_id, '')                                   AS collection_id,
    NULLIF(app_id, '')                                          AS app_id,
    block_height,
    block_timestamp,
    id
  FROM scarces_events
  WHERE NULLIF(token_id, '') IS NOT NULL
    AND (
      (event_type = 'SCARCE_UPDATE'
        AND operation IN ('quick_mint', 'transfer', 'purchase',
                          'auction_settled', 'burn'))
      OR (event_type = 'OFFER_UPDATE'
        AND operation IN ('offer_accepted', 'collection_offer_accepted'))
      -- Lazy purchases with a token_ids array are expanded in multi_token.
      OR (event_type = 'LAZY_LISTING_UPDATE' AND operation = 'purchased'
        AND (token_ids IS NULL OR token_ids NOT LIKE '[%'))
    )
),
multi_token AS (
  SELECT
    NULLIF(tok.value, '')                                       AS token_id,
    CASE
      WHEN e.event_type = 'COLLECTION_UPDATE' AND e.operation = 'creator_mint'
        THEN NULLIF(e.receiver_id, '')
      ELSE NULLIF(e.buyer_id, '')
    END                                                         AS owner_id,
    FALSE                                                       AS burned,
    TRUE                                                        AS minted,
    NULLIF(e.collection_id, '')                                 AS collection_id,
    NULLIF(e.app_id, '')                                        AS app_id,
    e.block_height,
    e.block_timestamp,
    e.id
  FROM scarces_events e
  CROSS JOIN LATERAL jsonb_array_elements_text(e.token_ids::jsonb) AS tok(value)
  WHERE e.token_ids LIKE '[%'
    AND (
      (e.event_type = 'COLLECTION_UPDATE'
        AND e.operation IN ('purchase', 'creator_mint'))
      OR (e.event_type = 'LAZY_LISTING_UPDATE' AND e.operation = 'purchased')
    )
),
airdrop_token AS (
  SELECT
    NULLIF(tok.value, '')                                       AS token_id,
    NULLIF(recv.value, '')                                      AS owner_id,
    FALSE                                                       AS burned,
    TRUE                                                        AS minted,
    NULLIF(e.collection_id, '')                                 AS collection_id,
    NULLIF(e.app_id, '')                                        AS app_id,
    e.block_height,
    e.block_timestamp,
    e.id
  FROM scarces_events e
  CROSS JOIN LATERAL jsonb_array_elements_text(e.token_ids::jsonb)
    WITH ORDINALITY AS tok(value, idx)
  JOIN LATERAL jsonb_array_elements_text(e.receivers::jsonb)
    WITH ORDINALITY AS recv(value, idx)
    ON recv.idx = tok.idx
  WHERE e.event_type = 'COLLECTION_UPDATE'
    AND e.operation = 'airdrop'
    AND e.token_ids LIKE '[%'
    AND e.receivers LIKE '[%'
),
transitions AS (
  SELECT * FROM single_token
  UNION ALL
  SELECT * FROM multi_token
  UNION ALL
  SELECT * FROM airdrop_token
),
latest AS (
  SELECT DISTINCT ON (token_id)
    token_id,
    owner_id,
    burned,
    block_timestamp AS updated_block_timestamp
  FROM transitions
  WHERE token_id IS NOT NULL
  ORDER BY token_id, block_height DESC, id DESC
),
attribution AS (
  SELECT
    token_id,
    MAX(collection_id)                                          AS collection_id,
    MAX(app_id)                                                 AS app_id,
    MIN(block_timestamp) FILTER (WHERE minted)                  AS minted_block_timestamp
  FROM transitions
  WHERE token_id IS NOT NULL
  GROUP BY token_id
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
)
SELECT
  l.token_id,
  CASE WHEN l.burned THEN NULL ELSE l.owner_id END              AS owner_id,
  l.burned,
  a.collection_id,
  COALESCE(a.app_id, ca.app_id)                                 AS app_id,
  a.minted_block_timestamp,
  l.updated_block_timestamp
FROM latest l
JOIN attribution a USING (token_id)
LEFT JOIN collection_apps ca ON ca.collection_id = a.collection_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. scarces_app_stats — per-app (hub) rollup
-- ────────────────────────────────────────────────────────────────────────────
-- One row per registered app (plus apps only visible through collection
-- creates). Volume sums yocto amounts as NUMERIC; clients format to NEAR.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW scarces_app_stats AS
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
drops AS (
  SELECT
    NULLIF(app_id, '')                                          AS app_id,
    block_timestamp
  FROM scarces_events
  WHERE event_type = 'COLLECTION_UPDATE'
    AND operation = 'create'
    AND NULLIF(app_id, '') IS NOT NULL
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
  LEFT JOIN collection_apps ca ON ca.collection_id = NULLIF(e.collection_id, '')
  WHERE
    (e.event_type = 'COLLECTION_UPDATE'
      AND e.operation IN ('purchase', 'creator_mint', 'airdrop'))
    OR (e.event_type = 'LAZY_LISTING_UPDATE' AND e.operation = 'purchased')
    OR (e.event_type = 'SCARCE_UPDATE' AND e.operation = 'quick_mint')
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
  LEFT JOIN collection_apps ca ON ca.collection_id = NULLIF(e.collection_id, '')
  WHERE
    (e.event_type = 'COLLECTION_UPDATE' AND e.operation = 'purchase')
    OR (e.event_type = 'LAZY_LISTING_UPDATE' AND e.operation = 'purchased')
    OR (e.event_type = 'SCARCE_UPDATE'
      AND e.operation IN ('purchase', 'auction_settled'))
    OR (e.event_type = 'OFFER_UPDATE'
      AND e.operation IN ('offer_accepted', 'collection_offer_accepted'))
),
app_ids AS (
  SELECT app_id FROM scarces_apps
  UNION
  SELECT DISTINCT app_id FROM drops WHERE app_id IS NOT NULL
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
