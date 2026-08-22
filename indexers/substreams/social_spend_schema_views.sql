-- Social Spend SQL views (applied after social_spend_schema.sql + core views).
-- Replaces the stub `post_amplify_heat` from core_schema_views.sql.
-- Replaces the stub `paid_support_inbound_events` from leaderboard_schema_views.sql
-- so reputation Social can include paid inbound profile/endorsement spends.

-- Soft amplify ranking heat (off-chain product score; spends stay on-chain forever).
--
-- heat = Σ log2(1 + SOCIAL) · u · self · 2^(-age_hours / 36)
--   u    = 1.0 first amplify from an account on that post, else 0.25
--   self = 0.25 when spender = recipient (author), else 1.0
--   Only events in the last ~14 days (older heat ≈ 0 at 36h half-life).
--   Floor: heat < 0.01 → 0 so residual decay does not keep cold posts under
--   week-old amplifies forever (Hot then falls through to block height / time).
-- Feed amplify heat stays out of reputation; author_amplify_received is the
-- longer-window Quality input. Paid profile/endorsement support is a separate
-- Social input via paid_support_inbound_events.

CREATE OR REPLACE VIEW post_amplify_heat AS
WITH events AS (
  SELECT
    e.target_id AS post_path,
    e.spender_id,
    e.recipient_id,
    e.amount,
    e.block_timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY e.target_id, lower(trim(e.spender_id))
      ORDER BY e.block_timestamp ASC, e.id ASC
    ) AS spender_seq
  FROM social_spend_events e
  WHERE e.success = true
    AND e.event_type = 'SOCIAL_SPENT'
    AND e.action = 'boost_post'
    AND e.target_type = 'post'
    AND e.target_id IS NOT NULL
    AND e.target_id <> ''
    AND e.spender_id IS NOT NULL
    AND e.spender_id <> ''
    AND e.amount IS NOT NULL
    AND e.amount ~ '^[0-9]+$'
    AND e.block_timestamp > (
      (EXTRACT(EPOCH FROM NOW()) * 1000000000)::bigint
      - (14::bigint * 24 * 3600 * 1000000000)
    )
),
scored AS (
  SELECT
    post_path,
    (
      LN(1 + GREATEST(amount::numeric / 1000000000000000000::numeric, 0))
      / LN(2)
    )
    * CASE WHEN spender_seq = 1 THEN 1.0 ELSE 0.25 END
    * CASE
        WHEN recipient_id IS NOT NULL
         AND lower(trim(spender_id)) = lower(trim(recipient_id))
          THEN 0.25
        ELSE 1.0
      END
    * POWER(
        0.5::double precision,
        GREATEST(
          (
            EXTRACT(EPOCH FROM NOW())
            - (block_timestamp::double precision / 1000000000.0)
          ) / 3600.0,
          0.0
        ) / 36.0
      ) AS event_heat
  FROM events
),
aggregated AS (
  SELECT
    post_path,
    COALESCE(SUM(event_heat), 0)::double precision AS raw_heat
  FROM scored
  GROUP BY post_path
)
SELECT
  post_path,
  CASE
    WHEN raw_heat < 0.01 THEN 0::double precision
    ELSE raw_heat
  END AS heat
FROM aggregated;

-- Paid inbound social for reputation Social factor (replaces empty stub).
-- Per-event rows; reputation_scores caps per spender and applies issuer weight.
CREATE OR REPLACE VIEW paid_support_inbound_events AS
SELECT
  COALESCE(
    NULLIF(e.recipient_id, ''),
    CASE
      WHEN e.target_type = 'profile' THEN NULLIF(e.target_id, '')
      ELSE NULL
    END
  ) AS account_id,
  e.spender_id,
  e.block_timestamp,
  CASE e.action
    WHEN 'support_profile' THEN 1.0
    WHEN 'support_endorsement' THEN 0.85
    WHEN 'signal_profile' THEN 0.7
    WHEN 'endorse_profile' THEN 0.7
    ELSE 0.0
  END::NUMERIC AS action_weight,
  (e.amount::NUMERIC / 1e18) AS amount_social
FROM social_spend_events e
WHERE e.success = true
  AND e.event_type = 'SOCIAL_SPENT'
  AND e.action IN (
    'support_profile',
    'support_endorsement',
    'signal_profile',
    'endorse_profile'
  )
  AND e.spender_id IS NOT NULL
  AND e.spender_id != ''
  AND e.amount IS NOT NULL
  AND e.amount ~ '^[0-9]+$';

-- Author amplify received for reputation Quality (replaces empty stub).
-- Longer window than feed heat (180d half-life); self-amplify at 0.25×;
-- per-spender cap so one wallet cannot dominate an author.
CREATE OR REPLACE VIEW author_amplify_received AS
WITH events AS (
  SELECT
    NULLIF(e.recipient_id, '') AS account_id,
    e.spender_id,
    e.block_timestamp,
    (e.amount::NUMERIC / 1e18) AS amount_social,
    CASE
      WHEN e.recipient_id IS NOT NULL
       AND lower(trim(e.spender_id)) = lower(trim(e.recipient_id))
        THEN 0.25
      ELSE 1.0
    END::NUMERIC AS self_mult
  FROM social_spend_events e
  WHERE e.success = true
    AND e.event_type = 'SOCIAL_SPENT'
    AND e.action = 'boost_post'
    AND e.target_type = 'post'
    AND e.recipient_id IS NOT NULL
    AND e.recipient_id != ''
    AND e.spender_id IS NOT NULL
    AND e.spender_id != ''
    AND e.amount IS NOT NULL
    AND e.amount ~ '^[0-9]+$'
),
spender AS (
  SELECT
    account_id,
    spender_id,
    SUM(
      self_mult
      * LEAST(2.5, LN(1.0 + GREATEST(amount_social, 0)) / LN(11.0))
      * GREATEST(
          0.2,
          EXP(
            -GREATEST(
              0.0,
              EXTRACT(
                EPOCH FROM (
                  (NOW() AT TIME ZONE 'utc')
                  - TO_TIMESTAMP(block_timestamp / 1e9)
                )
              ) / 86400.0
            ) / 180.0
          )
        )
    )::NUMERIC AS spender_points,
    SUM(amount_social)::NUMERIC AS spender_social,
    COUNT(*)::BIGINT AS spender_events
  FROM events
  WHERE account_id IS NOT NULL
    AND account_id != ''
  GROUP BY account_id, spender_id
)
SELECT
  account_id,
  SUM(LEAST(3.0, spender_points))::NUMERIC AS amplify_points,
  SUM(spender_social)::NUMERIC AS amplify_social,
  SUM(spender_events)::BIGINT AS amplify_events
FROM spender
GROUP BY account_id;
