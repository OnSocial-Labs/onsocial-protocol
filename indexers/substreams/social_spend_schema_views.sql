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
-- Amplify heat stays out of reputation; paid profile/endorsement support is a
-- separate Social input via paid_support_inbound_events.

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
)
SELECT
  post_path,
  COALESCE(SUM(event_heat), 0)::double precision AS heat
FROM scored
GROUP BY post_path;

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
