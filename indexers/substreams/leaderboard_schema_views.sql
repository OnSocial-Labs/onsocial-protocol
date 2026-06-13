-- ============================================================================
-- OnSocial Leaderboard, Reputation & Rankings
-- ============================================================================
-- Live views for leaderboard rankings, reputation scores, and per-partner /
-- per-group activity metrics.
--
-- Depends on:
--   boost_schema.sql       → booster_state
--   rewards_schema.sql     → rewards_events
--   core_schema_views.sql  → posts_current, reaction_counts,
--                             standing_counts, standing_out_counts
--   scarces_schema.sql     → scarces_events
--
-- Views:
--   1. leaderboard_boost       — ranked by effective_boost
--   2. leaderboard_rewards     — ranked by total_earned
--   3. leaderboard_snapshots   — daily historical rankings (table)
--   4. reward_activity_daily   — daily earnings per user
--   5. reward_weights          — standing × boost multiplier
--   6. content_activity        — posts, replies, reactions, active days
--   7. scarces_activity         — scarce creation, sales, revenue
--   8. reputation_scores       — composite reputation per user
--   9. leaderboard_agent_features — deterministic rank-consumer signals
--  10. leaderboard_by_app      — per-partner rankings
--  11. leaderboard_by_group    — per-community rankings
--  12. app_reputation          — per-dApp aggregate health score
--
-- Ranking views are regular live views. Use snapshot_leaderboard() only when
-- persisting daily historical rankings.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. leaderboard_boost — ranked by effective_boost
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW leaderboard_boost AS
SELECT
  account_id,
  locked_amount,
  effective_boost,
  lock_months,
  total_claimed,
  total_credits_purchased,
  last_event_block,
  RANK() OVER (ORDER BY effective_boost::NUMERIC DESC) AS rank
FROM booster_state
WHERE effective_boost != '0' AND effective_boost != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. leaderboard_rewards — ranked by total earned rewards
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW leaderboard_rewards AS
WITH earned AS (
  SELECT
    account_id,
    SUM(amount::NUMERIC)  AS total_earned,
    COUNT(*)              AS credit_count,
    MAX(block_height)     AS last_credit_block
  FROM rewards_events
  WHERE event_type = 'REWARD_CREDITED'
    AND amount IS NOT NULL AND amount != ''
  GROUP BY account_id
),
claimed AS (
  SELECT
    account_id,
    SUM(amount::NUMERIC)  AS total_claimed,
    MAX(block_height)     AS last_claim_block
  FROM rewards_events
  WHERE event_type = 'REWARD_CLAIMED'
    AND amount IS NOT NULL AND amount != ''
  GROUP BY account_id
)
SELECT
  e.account_id,
  e.total_earned,
  COALESCE(c.total_claimed, 0)                        AS total_claimed,
  e.total_earned - COALESCE(c.total_claimed, 0)        AS unclaimed,
  e.credit_count,
  e.last_credit_block,
  c.last_claim_block,
  RANK() OVER (ORDER BY e.total_earned DESC)           AS rank
FROM earned e
LEFT JOIN claimed c ON c.account_id = e.account_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. leaderboard_snapshot — periodic snapshots for historical rankings
-- ────────────────────────────────────────────────────────────────────────────
-- Backend-scheduled table for historical ranking snapshots.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_id TEXT NOT NULL,
  effective_boost NUMERIC NOT NULL DEFAULT 0,
  total_earned NUMERIC NOT NULL DEFAULT 0,
  total_claimed NUMERIC NOT NULL DEFAULT 0,
  composite_score NUMERIC NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL,
  UNIQUE(snapshot_date, account_id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_date
  ON leaderboard_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_account
  ON leaderboard_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_rank
  ON leaderboard_snapshots(snapshot_date, rank);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. reward_activity_daily — daily reward credit aggregation per user
-- ────────────────────────────────────────────────────────────────────────────
-- Useful for "daily earnings" charts and activity heatmaps.

CREATE OR REPLACE VIEW reward_activity_daily AS
SELECT
  account_id,
  -- Approximate day from block_timestamp (nanoseconds → date)
  DATE(TO_TIMESTAMP(block_timestamp / 1000000000)) AS activity_date,
  COUNT(*)                                          AS credit_count,
  SUM(amount::NUMERIC)                              AS total_amount,
  MAX(block_height)                                 AS last_block
FROM rewards_events
WHERE event_type = 'REWARD_CREDITED'
  AND amount IS NOT NULL AND amount != ''
GROUP BY account_id, DATE(TO_TIMESTAMP(block_timestamp / 1000000000));

-- ────────────────────────────────────────────────────────────────────────────
-- 5. reward_weights — standing-with count feeds into reward multiplier
-- ────────────────────────────────────────────────────────────────────────────
-- The reward worker reads this view when crediting rewards.
-- More people standing with you = higher multiplier on your content rewards.
-- Logarithmic scale: 0→10 standings matters a lot, 1000→1010 barely matters.
-- Boost lock also contributes (existing tokenomics).
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW reward_weights AS
WITH accounts AS (
  SELECT account_id FROM standing_counts
  UNION
  SELECT account_id FROM standing_out_counts
  UNION
  SELECT account_id FROM booster_state
  UNION
  SELECT account_id FROM leaderboard_rewards
  UNION
  SELECT account_id FROM posts_current
)
SELECT
  a.account_id,
  COALESCE(r.total_earned, 0)                     AS total_earned,
  COALESCE(r.total_claimed, 0)                    AS total_claimed,
  COALESCE(s.standing_with_count, 0)               AS standing_with_count,
  COALESCE(b.effective_boost, '0')::NUMERIC         AS effective_boost,
  COALESCE(b.lock_months, 0)                        AS lock_months,
  -- Standing weight: logarithmic (diminishing returns)
  (1.0 + LN(GREATEST(COALESCE(s.standing_with_count, 0), 1)))
                                                    AS standing_multiplier,
  -- Boost weight: linear with locked tokens
  (1.0 + COALESCE(b.effective_boost, '0')::NUMERIC / 1e18)
                                                    AS boost_multiplier,
  -- Combined reward multiplier
  (1.0 + LN(GREATEST(COALESCE(s.standing_with_count, 0), 1)))
    * (1.0 + COALESCE(b.effective_boost, '0')::NUMERIC / 1e18)
                                                    AS reward_multiplier
FROM accounts a
LEFT JOIN leaderboard_rewards r ON r.account_id = a.account_id
LEFT JOIN standing_counts s ON s.account_id = a.account_id
LEFT JOIN booster_state b ON b.account_id = a.account_id
WHERE a.account_id IS NOT NULL AND a.account_id != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. content_activity — per-user content creation and engagement metrics
-- ────────────────────────────────────────────────────────────────────────────
-- Aggregates post count, reply ratio, reactions received, active days, etc.
-- Used as input to the reputation score.
-- Depends on: core_schema_views.sql (posts_current, reaction_counts)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW content_activity AS
SELECT
  p.account_id,
  COUNT(*)                                                    AS total_posts,
  COUNT(*) FILTER (WHERE p.parent_author IS NOT NULL
                     AND p.parent_author != '')                AS reply_count,
  COUNT(*) FILTER (WHERE p.ref_author IS NOT NULL
                     AND p.ref_author != '')                   AS quote_count,
  COUNT(*) FILTER (WHERE p.group_id IS NOT NULL
                     AND p.group_id != '')                     AS group_posts,
  -- Engagement received: total reactions across all posts
  COALESCE(SUM(rc.reaction_count), 0)                         AS total_reactions_received,
  -- Average reactions per post (content quality signal)
  ROUND(COALESCE(SUM(rc.reaction_count), 0)::NUMERIC
        / GREATEST(COUNT(*), 1), 2)                           AS avg_reactions_per_post,
  -- Distinct active days (posts or replies)
  COUNT(DISTINCT DATE(TO_TIMESTAMP(p.block_timestamp / 1e9))) AS active_days,
  -- Distinct conversation partners (unique people replied to)
  COUNT(DISTINCT p.parent_author) FILTER (
    WHERE p.parent_author IS NOT NULL AND p.parent_author != ''
  )                                                           AS unique_reply_targets,
  MAX(p.block_height)                                         AS last_post_block
FROM posts_current p
LEFT JOIN reaction_counts rc
  ON rc.post_owner = p.account_id
 AND rc.post_path  = 'post/' || p.post_id
GROUP BY p.account_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. scarces_activity — per-user scarces marketplace activity
-- ────────────────────────────────────────────────────────────────────────────
-- Aggregates creation, sales, purchases, revenue.
-- Depends on: scarces_schema.sql (scarces_events)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW scarces_activity AS
WITH activity AS (
  -- Creation activity belongs to the owner/creator, not always the event author.
  SELECT
    COALESCE(NULLIF(owner_id, ''), NULLIF(creator_id, ''), NULLIF(author, '')) AS account_id,
    CASE
      WHEN operation IN ('mint', 'quick_mint', 'lazy_mint') THEN 1
      WHEN event_type = 'COLLECTION_UPDATE' AND operation = 'create' THEN 1
      WHEN event_type = 'LAZY_LISTING_UPDATE' AND operation = 'created' THEN 1
      ELSE 0
    END                                                         AS items_created,
    0                                                           AS items_sold,
    0::NUMERIC                                                  AS revenue_earned,
    0                                                           AS items_purchased,
    0::NUMERIC                                                  AS amount_spent,
    CASE WHEN event_type = 'COLLECTION_UPDATE' AND operation = 'create'
      THEN 1 ELSE 0 END                                         AS collections_created,
    block_height
  FROM scarces_events
  WHERE operation IN ('mint', 'quick_mint', 'lazy_mint', 'create', 'created')

  UNION ALL

  -- Sales activity belongs to seller_id for secondary flows and creator_id for
  -- primary collection/lazy-listing purchases.
  SELECT
    CASE
      WHEN operation = 'auction_settled' THEN NULLIF(seller_id, '')
      WHEN operation IN ('purchase', 'offer_accepted', 'collection_offer_accepted')
        AND NULLIF(seller_id, '') IS NOT NULL THEN NULLIF(seller_id, '')
      WHEN event_type = 'COLLECTION_UPDATE' AND operation = 'purchase'
        THEN NULLIF(creator_id, '')
      WHEN event_type = 'LAZY_LISTING_UPDATE' AND operation = 'purchased'
        THEN NULLIF(creator_id, '')
      ELSE NULL
    END                                                         AS account_id,
    0                                                           AS items_created,
    GREATEST(COALESCE(quantity, 1), 1)                           AS items_sold,
    COALESCE(NULLIF(creator_payment, '')::NUMERIC,
             NULLIF(revenue, '')::NUMERIC,
             NULLIF(price, '')::NUMERIC,
             NULLIF(amount, '')::NUMERIC,
             NULLIF(winning_bid, '')::NUMERIC,
             0)                                                  AS revenue_earned,
    0                                                           AS items_purchased,
    0::NUMERIC                                                  AS amount_spent,
    0                                                           AS collections_created,
    block_height
  FROM scarces_events
  WHERE operation IN ('purchase', 'purchased', 'offer_accepted',
                      'collection_offer_accepted', 'auction_settled')

  UNION ALL

  -- Purchase activity belongs to buyer_id, or winner_id for auctions.
  SELECT
    COALESCE(NULLIF(buyer_id, ''), NULLIF(winner_id, ''))        AS account_id,
    0                                                           AS items_created,
    0                                                           AS items_sold,
    0::NUMERIC                                                  AS revenue_earned,
    GREATEST(COALESCE(quantity, 1), 1)                           AS items_purchased,
    COALESCE(NULLIF(price, '')::NUMERIC,
             NULLIF(amount, '')::NUMERIC,
             NULLIF(winning_bid, '')::NUMERIC,
             0)                                                  AS amount_spent,
    0                                                           AS collections_created,
    block_height
  FROM scarces_events
  WHERE operation IN ('purchase', 'purchased', 'offer_accepted',
                      'collection_offer_accepted', 'auction_settled')
)
SELECT
  account_id,
  SUM(items_created)::BIGINT                                  AS items_created,
  SUM(items_sold)::BIGINT                                     AS items_sold,
  SUM(revenue_earned)                                         AS revenue_earned,
  SUM(items_purchased)::BIGINT                                AS items_purchased,
  SUM(amount_spent)                                           AS amount_spent,
  SUM(collections_created)::BIGINT                            AS collections_created,
  MAX(block_height)                                           AS last_scarces_block
FROM activity
WHERE account_id IS NOT NULL AND account_id != ''
GROUP BY account_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. reputation_scores — composite reputation score per user (v1, testnet)
-- ────────────────────────────────────────────────────────────────────────────
-- Combines: social graph × token commitment × content quality × consistency
--           × scarces marketplace activity.
-- Depends on: standing_counts, mutual_standings_current, endorsements_current,
--             booster_state, leaderboard_rewards, content_activity,
--             scarces_activity
--
-- v1 formula (testnet):
--   social_graph = standing_with + 2×mutual_standing + 0.5×endorsements_received
--   social       = 1 + ln(1 + social_graph)
--   commitment   = 1 + ln(1 + effective_boost / 1e18)
--   quality      = 1 + (avg_reactions_per_post / 10) × min(total_posts / 5, 1)
--   consistency  = 1 + ln(1 + active_days) / ln(31)
--   scarces      = 1 + ln(1 + items_created + items_sold) / 10
--   reputation   = social × commitment × quality × consistency × scarces
--
-- rewards_earned is exposed for context but does not enter the product.
-- confidence_score estimates how much indexed evidence backs the rank.
-- ────────────────────────────────────────────────────────────────────────────

-- Postgres cannot insert/reorder view output columns via REPLACE alone.
-- Drop dependents first so column additions (mutual_standing, endorsements_received,
-- confidence_score) apply cleanly on live testnet/mainnet databases.
DROP VIEW IF EXISTS app_reputation CASCADE;
DROP VIEW IF EXISTS leaderboard_agent_features CASCADE;
DROP VIEW IF EXISTS reputation_scores CASCADE;

CREATE VIEW reputation_scores AS
WITH mutual_counts AS (
  SELECT
    account_id,
    COUNT(*)::BIGINT AS mutual_standing
  FROM mutual_standings_current
  GROUP BY account_id
),
endorsement_received AS (
  SELECT
    target AS account_id,
    COUNT(*)::BIGINT AS endorsements_received
  FROM endorsements_current
  WHERE operation = 'set'
    AND target IS NOT NULL
    AND target != ''
  GROUP BY target
),
accounts AS (
  SELECT account_id FROM standing_counts
  UNION
  SELECT account_id FROM standing_out_counts
  UNION
  SELECT account_id FROM booster_state
  UNION
  SELECT account_id FROM leaderboard_rewards
  UNION
  SELECT account_id FROM content_activity
  UNION
  SELECT account_id FROM scarces_activity
  UNION
  SELECT account_id FROM mutual_counts
  UNION
  SELECT account_id FROM endorsement_received
),
joined AS (
  SELECT
    a.account_id,
    COALESCE(s.standing_with_count, 0)                          AS standing_with,
    COALESCE(so.standing_with_others_count, 0)                  AS standing_out,
    COALESCE(mc.mutual_standing, 0)                             AS mutual_standing,
    COALESCE(er.endorsements_received, 0)                       AS endorsements_received,
    COALESCE(b.effective_boost, '0')::NUMERIC / 1e18            AS boost,
    COALESCE(b.lock_months, 0)                                  AS lock_months,
    COALESCE(r.total_earned, 0) / 1e18                         AS rewards_earned,
    COALESCE(c.total_posts, 0)                                  AS total_posts,
    COALESCE(c.reply_count, 0)                                  AS reply_count,
    COALESCE(c.total_reactions_received, 0)                     AS reactions_received,
    COALESCE(c.avg_reactions_per_post, 0)                       AS avg_reactions,
    COALESCE(c.active_days, 0)                                  AS active_days,
    COALESCE(c.unique_reply_targets, 0)                         AS unique_conversations,
    COALESCE(n.items_created, 0)                                AS scarces_created,
    COALESCE(n.items_sold, 0)                                   AS scarces_sold,
    COALESCE(n.revenue_earned, 0) / 1e24                        AS scarces_revenue_near,
    (
      COALESCE(s.standing_with_count, 0)::NUMERIC
      + 2.0 * COALESCE(mc.mutual_standing, 0)::NUMERIC
      + 0.5 * COALESCE(er.endorsements_received, 0)::NUMERIC
    )                                                           AS social_graph_points,
    LEAST(
      COALESCE(c.total_posts, 0)::NUMERIC / 5.0,
      1.0
    )                                                           AS quality_post_factor
  FROM accounts a
  LEFT JOIN standing_counts     s  ON s.account_id  = a.account_id
  LEFT JOIN standing_out_counts so ON so.account_id = a.account_id
  LEFT JOIN mutual_counts       mc ON mc.account_id = a.account_id
  LEFT JOIN endorsement_received er ON er.account_id = a.account_id
  LEFT JOIN booster_state       b  ON b.account_id  = a.account_id
  LEFT JOIN leaderboard_rewards r ON r.account_id  = a.account_id
  LEFT JOIN content_activity    c  ON c.account_id  = a.account_id
  LEFT JOIN scarces_activity    n  ON n.account_id  = a.account_id
),
scored AS (
  SELECT
    joined.*,
    ROUND((1.0 + LN(1.0 + social_graph_points))::NUMERIC, 4)  AS social_score,
    ROUND((1.0 + LN(1.0 + boost))::NUMERIC, 4)                  AS commitment_score,
    ROUND((
      1.0
      + (avg_reactions::NUMERIC / 10.0) * quality_post_factor
    )::NUMERIC, 4)                                              AS quality_score,
    ROUND((1.0 + LN(1.0 + active_days::NUMERIC) / LN(31.0)), 4)
                                                                AS consistency_score,
    ROUND((1.0 + LN(1.0 + scarces_created::NUMERIC
                    + scarces_sold::NUMERIC) / 10.0), 4)        AS scarces_score
  FROM joined
),
composite AS (
  SELECT
    scored.*,
    ROUND((
      social_score
      * commitment_score
      * quality_score
      * consistency_score
      * scarces_score
    )::NUMERIC, 4)                                              AS reputation,
    (
      COALESCE(standing_with, 0)
      + COALESCE(standing_out, 0)
      + COALESCE(total_posts, 0)
      + COALESCE(reply_count, 0)
      + COALESCE(reactions_received, 0)
      + COALESCE(scarces_created, 0)
      + COALESCE(scarces_sold, 0)
      + COALESCE(endorsements_received, 0)
    )::NUMERIC                                                  AS evidence_points,
    (
      CASE WHEN COALESCE(standing_with, 0) + COALESCE(standing_out, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN boost > 0 THEN 1 ELSE 0 END
      + CASE WHEN rewards_earned > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(total_posts, 0) + COALESCE(reply_count, 0)
                  + COALESCE(reactions_received, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(scarces_created, 0) + COALESCE(scarces_sold, 0)
                  + COALESCE(scarces_revenue_near, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(endorsements_received, 0) > 0 THEN 1 ELSE 0 END
    )                                                           AS signal_sources
  FROM scored
)
SELECT
  account_id,
  standing_with,
  standing_out,
  mutual_standing,
  endorsements_received,
  boost,
  lock_months,
  rewards_earned,
  total_posts,
  reply_count,
  reactions_received,
  avg_reactions,
  active_days,
  unique_conversations,
  scarces_created,
  scarces_sold,
  scarces_revenue_near,
  social_score,
  commitment_score,
  quality_score,
  consistency_score,
  scarces_score,
  reputation,
  ROUND((
    LEAST(LN(1 + GREATEST(evidence_points, 0)) / LN(101), 1.0) * 0.55
    + LEAST(active_days::NUMERIC / 14.0, 1.0) * 0.25
    + LEAST(signal_sources::NUMERIC / 4.0, 1.0) * 0.20
  )::NUMERIC, 4)                                                AS confidence_score,
  RANK() OVER (ORDER BY reputation DESC)                        AS rank
FROM composite;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. leaderboard_agent_features — deterministic rank-consumer signals
-- ────────────────────────────────────────────────────────────────────────────
-- Machine-readable inputs for agents, ranking explainers, and moderation review.
-- These are indexed-data heuristics, not identity, fraud, or quality judgments.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW leaderboard_agent_features AS
WITH base AS (
  SELECT
    rs.account_id,
    rs.rank,
    rs.reputation,
    rs.social_score,
    rs.commitment_score,
    rs.quality_score,
    rs.consistency_score,
    rs.scarces_score,
    rs.standing_with,
    rs.standing_out,
    rs.mutual_standing,
    rs.endorsements_received,
    rs.boost,
    rs.lock_months,
    rs.rewards_earned,
    rs.total_posts,
    rs.reply_count,
    rs.reactions_received,
    rs.avg_reactions,
    rs.active_days,
    rs.unique_conversations,
    rs.scarces_created,
    rs.scarces_sold,
    rs.scarces_revenue_near,
    GREATEST(
      COALESCE(c.last_post_block, 0),
      COALESCE(n.last_scarces_block, 0),
      COALESCE(lr.last_credit_block, 0),
      COALESCE(b.last_event_block, 0)
    )                                                           AS last_activity_block,
    (
      COALESCE(rs.standing_with, 0)
      + COALESCE(rs.standing_out, 0)
      + COALESCE(rs.total_posts, 0)
      + COALESCE(rs.reply_count, 0)
      + COALESCE(rs.reactions_received, 0)
      + COALESCE(rs.scarces_created, 0)
      + COALESCE(rs.scarces_sold, 0)
      + COALESCE(rs.endorsements_received, 0)
      + COALESCE(lr.credit_count, 0)
    )::NUMERIC                                                 AS evidence_points,
    (
      CASE WHEN COALESCE(rs.standing_with, 0) + COALESCE(rs.standing_out, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(rs.boost, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(rs.rewards_earned, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(rs.total_posts, 0) + COALESCE(rs.reply_count, 0)
                  + COALESCE(rs.reactions_received, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(rs.scarces_created, 0) + COALESCE(rs.scarces_sold, 0)
                  + COALESCE(rs.scarces_revenue_near, 0) > 0 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(rs.endorsements_received, 0) > 0 THEN 1 ELSE 0 END
    )                                                           AS signal_sources
  FROM reputation_scores rs
  LEFT JOIN content_activity   c  ON c.account_id  = rs.account_id
  LEFT JOIN scarces_activity   n  ON n.account_id  = rs.account_id
  LEFT JOIN leaderboard_rewards lr ON lr.account_id = rs.account_id
  LEFT JOIN booster_state      b  ON b.account_id  = rs.account_id
), scored AS (
  SELECT
    base.*,
    CASE
      WHEN social_score >= commitment_score
       AND social_score >= quality_score
       AND social_score >= consistency_score
       AND social_score >= scarces_score THEN 'social'
      WHEN commitment_score >= quality_score
       AND commitment_score >= consistency_score
       AND commitment_score >= scarces_score THEN 'commitment'
      WHEN quality_score >= consistency_score
       AND quality_score >= scarces_score THEN 'quality'
      WHEN consistency_score >= scarces_score THEN 'consistency'
      ELSE 'scarces'
    END                                                         AS primary_signal,
    ROUND((
      LEAST(LN(1 + GREATEST(evidence_points, 0)) / LN(101), 1.0) * 0.55
      + LEAST(COALESCE(active_days, 0)::NUMERIC / 14.0, 1.0) * 0.25
      + LEAST(COALESCE(signal_sources, 0)::NUMERIC / 4.0, 1.0) * 0.20
    )::NUMERIC, 4)                                             AS confidence_score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN evidence_points < 5 THEN 'low_evidence' END,
      CASE WHEN total_posts >= 10 AND active_days <= 1 THEN 'burst_content' END,
      CASE WHEN total_posts <= 2 AND reactions_received >= 25 THEN 'thin_content_high_engagement' END,
      CASE WHEN boost > 0 AND total_posts = 0 AND rewards_earned = 0
             AND scarces_created = 0 AND scarces_sold = 0 THEN 'boost_only' END,
      CASE WHEN standing_with >= 20 AND standing_out = 0 THEN 'one_way_social_signal' END,
      CASE WHEN scarces_created + scarces_sold > 0 AND total_posts = 0
             AND rewards_earned = 0 THEN 'marketplace_only' END
    ], NULL)                                                    AS review_flags
  FROM base
)
SELECT
  account_id,
  rank,
  reputation,
  primary_signal,
  confidence_score,
  CASE WHEN CARDINALITY(review_flags) > 0 THEN 'review' ELSE 'ok' END
                                                                AS review_status,
  review_flags,
  signal_sources,
  evidence_points,
  last_activity_block,
  social_score,
  commitment_score,
  quality_score,
  consistency_score,
  scarces_score,
  standing_with,
  standing_out,
  boost,
  lock_months,
  rewards_earned,
  total_posts,
  reply_count,
  reactions_received,
  avg_reactions,
  active_days,
  unique_conversations,
  scarces_created,
  scarces_sold,
  scarces_revenue_near,
  jsonb_build_object(
    'schema_version', 'leaderboard_agent_features.v1',
    'score_kind', 'deterministic_indexed_signals',
    'rank', rank,
    'reputation', reputation,
    'primary_signal', primary_signal,
    'confidence_score', confidence_score,
    'review_status', CASE WHEN CARDINALITY(review_flags) > 0 THEN 'review' ELSE 'ok' END,
    'review_flags', review_flags,
    'inputs', jsonb_build_object(
      'social_score', social_score,
      'commitment_score', commitment_score,
      'quality_score', quality_score,
      'consistency_score', consistency_score,
      'scarces_score', scarces_score,
      'signal_sources', signal_sources,
      'evidence_points', evidence_points
    )
  )                                                             AS agent_context
FROM scored;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. leaderboard_by_app — per-partner/dApp leaderboard
-- ────────────────────────────────────────────────────────────────────────────
-- Ranks users within each registered app by total rewards earned + actions.
-- Partners can query: WHERE app_id = 'my-app' ORDER BY rank
-- Depends on: rewards_schema.sql (rewards_events)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW leaderboard_by_app AS
SELECT
  app_id,
  account_id,
  COUNT(*)                                                    AS action_count,
  SUM(amount::NUMERIC)                                        AS total_earned,
  COUNT(DISTINCT DATE(TO_TIMESTAMP(block_timestamp / 1e9)))   AS active_days,
  MIN(block_height)                                           AS first_block,
  MAX(block_height)                                           AS last_block,
  RANK() OVER (
    PARTITION BY app_id
    ORDER BY SUM(amount::NUMERIC) DESC
  )                                                           AS rank
FROM rewards_events
WHERE event_type = 'REWARD_CREDITED'
  AND app_id IS NOT NULL AND app_id != ''
  AND amount IS NOT NULL AND amount != ''
GROUP BY app_id, account_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. leaderboard_by_group — per-community leaderboard
-- ────────────────────────────────────────────────────────────────────────────
-- Ranks users within each group by content contribution + engagement.
-- Community admins can query: WHERE group_id = 'my-group' ORDER BY rank
-- Depends on: core_schema_views.sql (posts_current, reaction_counts)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW leaderboard_by_group AS
SELECT
  p.group_id,
  p.account_id,
  COUNT(*)                                                    AS post_count,
  COUNT(*) FILTER (WHERE p.parent_author IS NOT NULL
                     AND p.parent_author != '')                AS reply_count,
  COALESCE(SUM(rc.reaction_count), 0)                         AS reactions_received,
  ROUND(COALESCE(SUM(rc.reaction_count), 0)::NUMERIC
        / GREATEST(COUNT(*), 1), 2)                           AS avg_reactions,
  COUNT(DISTINCT DATE(TO_TIMESTAMP(p.block_timestamp / 1e9))) AS active_days,
  RANK() OVER (
    PARTITION BY p.group_id
    ORDER BY (
      -- Score: posts + 2x replies + reactions (replies weighted higher)
      COUNT(*) + COUNT(*) FILTER (WHERE p.parent_author IS NOT NULL
        AND p.parent_author != '') + COALESCE(SUM(rc.reaction_count), 0)
    ) DESC
  )                                                           AS rank
FROM posts_current p
LEFT JOIN reaction_counts rc
  ON rc.post_owner = p.account_id
 AND rc.post_path  = 'post/' || p.post_id
WHERE p.group_id IS NOT NULL AND p.group_id != ''
GROUP BY p.group_id, p.account_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. app_reputation — per-partner/dApp aggregate reputation
-- ────────────────────────────────────────────────────────────────────────────
-- "Is this dApp healthy?" — user count, retention, total volume.
-- Depends on: rewards_schema.sql (rewards_events), reputation_scores
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW app_reputation AS
WITH app_events AS (
  SELECT
    app_id,
    account_id,
    amount::NUMERIC AS amount,
    DATE(TO_TIMESTAMP(block_timestamp / 1e9)) AS activity_date
  FROM rewards_events
  WHERE event_type = 'REWARD_CREDITED'
    AND app_id IS NOT NULL AND app_id != ''
    AND amount IS NOT NULL AND amount != ''
),
app_totals AS (
  SELECT
    app_id,
    SUM(amount) AS total_rewarded,
    COUNT(*) AS total_actions,
    COUNT(DISTINCT activity_date) AS active_days
  FROM app_events
  GROUP BY app_id
),
app_user_stats AS (
  SELECT
    app_id,
    account_id,
    COUNT(*) AS action_count,
    COUNT(DISTINCT activity_date) AS active_days
  FROM app_events
  GROUP BY app_id, account_id
)
SELECT
  aus.app_id,
  COUNT(*)                                                    AS total_users,
  at.total_rewarded,
  at.total_actions,
  at.active_days,
  COUNT(*) FILTER (WHERE aus.active_days >= 2)                AS returning_users,
  ROUND(AVG(rs.reputation), 4)                                AS avg_user_reputation,
  RANK() OVER (ORDER BY at.total_rewarded DESC)               AS rank
FROM app_user_stats aus
JOIN app_totals at ON at.app_id = aus.app_id
LEFT JOIN reputation_scores rs ON rs.account_id = aus.account_id
GROUP BY aus.app_id, at.total_rewarded, at.total_actions, at.active_days;

-- ────────────────────────────────────────────────────────────────────────────
-- Snapshot function — call daily to persist historical rankings
-- ────────────────────────────────────────────────────────────────────────────
-- Inserts today's top users into leaderboard_snapshots for trend analysis.
-- Idempotent: ON CONFLICT skips if already snapshotted today.
--
-- Example pg_cron (daily at midnight UTC):
--   SELECT cron.schedule('snapshot-leaderboard', '0 0 * * *',
--     $$SELECT snapshot_leaderboard()$$);
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION snapshot_leaderboard() RETURNS void AS $$
BEGIN
  INSERT INTO leaderboard_snapshots
    (snapshot_date, account_id, effective_boost, total_earned,
     total_claimed, composite_score, rank)
  SELECT
    CURRENT_DATE,
    rs.account_id,
    COALESCE(rs.boost * 1e18, 0),
    COALESCE(lr.total_earned, 0),
    COALESCE(lr.total_claimed, 0),
    rs.reputation,
    rs.rank
  FROM reputation_scores rs
  LEFT JOIN leaderboard_rewards lr ON lr.account_id = rs.account_id
  WHERE rs.rank <= 1000  -- Top 1000 per day
  ON CONFLICT (snapshot_date, account_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
