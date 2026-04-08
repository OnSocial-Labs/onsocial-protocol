-- ============================================================================
-- OnSocial Leaderboard, Reputation & Rankings
-- ============================================================================
-- Materialized views for leaderboard rankings, reputation scores, and
-- per-partner / per-group activity metrics.
--
-- Depends on:
--   boost_schema.sql       → booster_state
--   rewards_schema.sql     → rewards_events, user_reward_state
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
--   7. nft_activity            — scarce creation, sales, revenue
--   8. reputation_scores       — composite reputation per user
--   9. leaderboard_by_app      — per-partner rankings
--  10. leaderboard_by_group    — per-community rankings
--  11. app_reputation          — per-dApp aggregate health score
--
-- Refresh strategy: REFRESH MATERIALIZED VIEW CONCURRENTLY via pg_cron or
-- backend worker every 5–15 min for live rankings, plus a daily snapshot.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. leaderboard_boost — ranked by effective_boost
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS leaderboard_boost AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_boost_pk
  ON leaderboard_boost(account_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_boost_rank
  ON leaderboard_boost(rank);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. leaderboard_rewards — ranked by total earned rewards
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS leaderboard_rewards AS
SELECT
  account_id,
  total_earned,
  total_claimed,
  (total_earned::NUMERIC - total_claimed::NUMERIC) AS unclaimed,
  last_credit_block,
  last_claim_block,
  RANK() OVER (ORDER BY total_earned::NUMERIC DESC) AS rank
FROM user_reward_state
WHERE total_earned != '0' AND total_earned != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_rewards_pk
  ON leaderboard_rewards(account_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rewards_rank
  ON leaderboard_rewards(rank);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. leaderboard_snapshot — periodic snapshots for historical rankings
-- ────────────────────────────────────────────────────────────────────────────
-- The backend worker inserts rows into this table on a schedule (e.g. daily).
-- This is NOT a materialized view — it's a regular table for historical data.
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

CREATE MATERIALIZED VIEW IF NOT EXISTS reward_activity_daily AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_activity_daily_pk
  ON reward_activity_daily(account_id, activity_date);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. reward_weights — standing-with count feeds into reward multiplier
-- ────────────────────────────────────────────────────────────────────────────
-- The reward worker reads this view when crediting rewards.
-- More people standing with you = higher multiplier on your content rewards.
-- Logarithmic scale: 0→10 standings matters a lot, 1000→1010 barely matters.
-- Boost lock also contributes (existing tokenomics).
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS reward_weights AS
SELECT
  u.account_id,
  u.total_earned,
  u.total_claimed,
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
FROM user_reward_state u
LEFT JOIN standing_counts s ON s.account_id = u.account_id
LEFT JOIN booster_state b ON b.account_id = u.account_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_weights_pk
  ON reward_weights(account_id);
CREATE INDEX IF NOT EXISTS idx_reward_weights_multiplier
  ON reward_weights(reward_multiplier DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. content_activity — per-user content creation and engagement metrics
-- ────────────────────────────────────────────────────────────────────────────
-- Aggregates post count, reply ratio, reactions received, active days, etc.
-- Used as input to the reputation score.
-- Depends on: core_schema_views.sql (posts_current, reaction_counts)
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS content_activity AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_activity_pk
  ON content_activity(account_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. nft_activity — per-user NFT/scarce marketplace activity
-- ────────────────────────────────────────────────────────────────────────────
-- Aggregates creation, sales, purchases, revenue.
-- Depends on: scarces_schema.sql (scarces_events)
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS nft_activity AS
SELECT
  author                                                      AS account_id,
  -- Creator metrics (mints, collections created)
  COUNT(*) FILTER (WHERE operation IN ('mint', 'quick_mint',
    'lazy_mint', 'create_collection'))                        AS items_created,
  -- Seller metrics (author is the seller / initiator)
  COUNT(*) FILTER (WHERE operation IN ('purchase',
    'accept_offer', 'settle_auction')
    AND seller_id = author)                                   AS items_sold,
  COALESCE(SUM(CASE WHEN operation IN ('purchase', 'accept_offer',
    'settle_auction') AND seller_id = author
    THEN creator_payment::NUMERIC ELSE 0 END), 0)            AS revenue_earned,
  -- Buyer metrics
  COUNT(*) FILTER (WHERE operation = 'purchase'
    AND buyer_id = author)                                    AS items_purchased,
  COALESCE(SUM(CASE WHEN operation = 'purchase'
    AND buyer_id = author
    THEN price::NUMERIC ELSE 0 END), 0)                      AS amount_spent,
  -- Collections
  COUNT(DISTINCT collection_id) FILTER (
    WHERE operation = 'create_collection')                    AS collections_created,
  MAX(block_height)                                           AS last_nft_block
FROM scarces_events
GROUP BY author;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_activity_pk
  ON nft_activity(account_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. reputation_scores — composite reputation score per user
-- ────────────────────────────────────────────────────────────────────────────
-- Combines: social reach × token commitment × content quality × consistency
-- Depends on: standing_counts, booster_state, user_reward_state,
--             content_activity, nft_activity
--
-- Formula:
--   social      = 1 + ln(max(followers, 1))
--   commitment  = 1 + effective_boost / 1e18
--   quality     = 1 + avg_reactions_per_post / 10
--   consistency = 1 + active_days / 30
--   nft_factor  = 1 + ln(max(items_created + items_sold, 1)) / 10
--   reputation  = social × commitment × quality × consistency × nft_factor
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS reputation_scores AS
SELECT
  a.account_id,

  -- Raw components
  COALESCE(s.standing_with_count, 0)                          AS followers,
  COALESCE(so.standing_with_others_count, 0)                  AS following,
  COALESCE(b.effective_boost, '0')::NUMERIC / 1e18            AS boost,
  COALESCE(b.lock_months, 0)                                  AS lock_months,
  COALESCE(r.total_earned, '0')::NUMERIC / 1e18              AS rewards_earned,
  COALESCE(c.total_posts, 0)                                  AS total_posts,
  COALESCE(c.reply_count, 0)                                  AS reply_count,
  COALESCE(c.total_reactions_received, 0)                     AS reactions_received,
  COALESCE(c.avg_reactions_per_post, 0)                       AS avg_reactions,
  COALESCE(c.active_days, 0)                                  AS active_days,
  COALESCE(c.unique_reply_targets, 0)                         AS unique_conversations,
  COALESCE(n.items_created, 0)                                AS nfts_created,
  COALESCE(n.items_sold, 0)                                   AS nfts_sold,
  COALESCE(n.revenue_earned, 0) / 1e24                        AS nft_revenue_near,

  -- Dimension scores (exposed for debugging / per-dimension leaderboards)
  ROUND((1.0 + LN(GREATEST(COALESCE(s.standing_with_count, 0), 1)))::NUMERIC, 4)
                                                              AS social_score,
  ROUND((1.0 + COALESCE(b.effective_boost, '0')::NUMERIC / 1e18)::NUMERIC, 4)
                                                              AS commitment_score,
  ROUND((1.0 + COALESCE(c.avg_reactions_per_post, 0) / 10.0)::NUMERIC, 4)
                                                              AS quality_score,
  ROUND((1.0 + COALESCE(c.active_days, 0) / 30.0)::NUMERIC, 4)
                                                              AS consistency_score,
  ROUND((1.0 + LN(GREATEST(COALESCE(n.items_created, 0)
                          + COALESCE(n.items_sold, 0), 1)) / 10.0)::NUMERIC, 4)
                                                              AS nft_score,

  -- Composite reputation
  ROUND(
    (1.0 + LN(GREATEST(COALESCE(s.standing_with_count, 0), 1)))
    * (1.0 + COALESCE(b.effective_boost, '0')::NUMERIC / 1e18)
    * (1.0 + COALESCE(c.avg_reactions_per_post, 0) / 10.0)
    * (1.0 + COALESCE(c.active_days, 0) / 30.0)
    * (1.0 + LN(GREATEST(COALESCE(n.items_created, 0)
                        + COALESCE(n.items_sold, 0), 1)) / 10.0)
  , 4)                                                        AS reputation,

  RANK() OVER (ORDER BY
    (1.0 + LN(GREATEST(COALESCE(s.standing_with_count, 0), 1)))
    * (1.0 + COALESCE(b.effective_boost, '0')::NUMERIC / 1e18)
    * (1.0 + COALESCE(c.avg_reactions_per_post, 0) / 10.0)
    * (1.0 + COALESCE(c.active_days, 0) / 30.0)
    * (1.0 + LN(GREATEST(COALESCE(n.items_created, 0)
                        + COALESCE(n.items_sold, 0), 1)) / 10.0)
    DESC
  )                                                           AS rank

FROM (
  -- Union all known accounts from every source
  SELECT account_id FROM standing_counts
  UNION
  SELECT account_id FROM standing_out_counts
  UNION
  SELECT account_id FROM booster_state
  UNION
  SELECT account_id FROM user_reward_state
  UNION
  SELECT account_id FROM content_activity
  UNION
  SELECT account_id FROM nft_activity
) a
LEFT JOIN standing_counts    s  ON s.account_id  = a.account_id
LEFT JOIN standing_out_counts so ON so.account_id = a.account_id
LEFT JOIN booster_state      b  ON b.account_id  = a.account_id
LEFT JOIN user_reward_state  r  ON r.account_id  = a.account_id
LEFT JOIN content_activity   c  ON c.account_id  = a.account_id
LEFT JOIN nft_activity       n  ON n.account_id  = a.account_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reputation_scores_pk
  ON reputation_scores(account_id);
CREATE INDEX IF NOT EXISTS idx_reputation_scores_rank
  ON reputation_scores(rank);
CREATE INDEX IF NOT EXISTS idx_reputation_scores_reputation
  ON reputation_scores(reputation DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. leaderboard_by_app — per-partner/dApp leaderboard
-- ────────────────────────────────────────────────────────────────────────────
-- Ranks users within each registered app by total rewards earned + actions.
-- Partners can query: WHERE app_id = 'my-app' ORDER BY rank
-- Depends on: rewards_schema.sql (rewards_events)
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS leaderboard_by_app AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_by_app_pk
  ON leaderboard_by_app(app_id, account_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_by_app_rank
  ON leaderboard_by_app(app_id, rank);

-- ────────────────────────────────────────────────────────────────────────────
-- 10. leaderboard_by_group — per-community leaderboard
-- ────────────────────────────────────────────────────────────────────────────
-- Ranks users within each group by content contribution + engagement.
-- Community admins can query: WHERE group_id = 'my-group' ORDER BY rank
-- Depends on: core_schema_views.sql (posts_current, reaction_counts)
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS leaderboard_by_group AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_by_group_pk
  ON leaderboard_by_group(group_id, account_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_by_group_rank
  ON leaderboard_by_group(group_id, rank);

-- ────────────────────────────────────────────────────────────────────────────
-- 11. app_reputation — per-partner/dApp aggregate reputation
-- ────────────────────────────────────────────────────────────────────────────
-- "Is this dApp healthy?" — user count, retention, total volume.
-- Depends on: rewards_schema.sql (rewards_events), reputation_scores
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS app_reputation AS
SELECT
  re.app_id,
  COUNT(DISTINCT re.account_id)                               AS total_users,
  SUM(re.amount::NUMERIC)                                     AS total_rewarded,
  COUNT(*)                                                    AS total_actions,
  COUNT(DISTINCT DATE(TO_TIMESTAMP(re.block_timestamp / 1e9)))AS active_days,
  -- Retention: users active on 2+ distinct days
  COUNT(DISTINCT re.account_id) FILTER (
    WHERE re.account_id IN (
      SELECT r2.account_id
      FROM rewards_events r2
      WHERE r2.app_id = re.app_id
        AND r2.event_type = 'REWARD_CREDITED'
      GROUP BY r2.account_id
      HAVING COUNT(DISTINCT DATE(TO_TIMESTAMP(r2.block_timestamp / 1e9))) >= 2
    )
  )                                                           AS returning_users,
  -- Average reputation of the app's users
  ROUND(AVG(rs.reputation), 4)                                AS avg_user_reputation,
  RANK() OVER (ORDER BY SUM(re.amount::NUMERIC) DESC)        AS rank
FROM rewards_events re
LEFT JOIN reputation_scores rs ON rs.account_id = re.account_id
WHERE re.event_type = 'REWARD_CREDITED'
  AND re.app_id IS NOT NULL AND re.app_id != ''
  AND re.amount IS NOT NULL AND re.amount != ''
GROUP BY re.app_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_reputation_pk
  ON app_reputation(app_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Refresh function
-- ────────────────────────────────────────────────────────────────────────────
-- Refreshes all leaderboard + reputation views. Call after refresh_core_views().
-- Order matters: content_activity & nft_activity must come before reputation_scores.
--
-- Example pg_cron (every 5 min):
--   SELECT cron.schedule('refresh-leaderboard', '*/5 * * * *',
--     $$SELECT refresh_leaderboard_views()$$);
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_leaderboard_views() RETURNS void AS $$
BEGIN
  -- Base leaderboards
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_boost;
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_rewards;
  REFRESH MATERIALIZED VIEW CONCURRENTLY reward_activity_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY reward_weights;

  -- Activity aggregates (inputs to reputation)
  REFRESH MATERIALIZED VIEW CONCURRENTLY content_activity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY nft_activity;

  -- Composite reputation (depends on activity views above)
  REFRESH MATERIALIZED VIEW CONCURRENTLY reputation_scores;

  -- Per-scope leaderboards
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_by_app;
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_by_group;
  REFRESH MATERIALIZED VIEW CONCURRENTLY app_reputation;
END;
$$ LANGUAGE plpgsql;

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
    account_id,
    COALESCE(boost * 1e18, 0),
    COALESCE(rewards_earned * 1e18, 0),
    0,  -- total_claimed filled from reward state if needed
    reputation,
    rank
  FROM reputation_scores
  WHERE rank <= 1000  -- Top 1000 per day
  ON CONFLICT (snapshot_date, account_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
