-- Stored leaderboard ranks.
--
-- Public views leaderboard_boost, leaderboard_rewards, and reputation_scores
-- read these tables. Refresh runs once per transaction that changes a score,
-- at commit, not on each board request.
--
-- Requires reputation_scores to still be the calc view (this file renames it).

CREATE TABLE leaderboard_influence_rank (
  account_id TEXT PRIMARY KEY,
  locked_amount TEXT NOT NULL,
  effective_boost TEXT NOT NULL,
  lock_months BIGINT NOT NULL,
  total_claimed TEXT NOT NULL,
  total_credits_purchased TEXT NOT NULL,
  last_event_block BIGINT NOT NULL,
  rank BIGINT NOT NULL
);

CREATE INDEX leaderboard_influence_rank_rank_idx
  ON leaderboard_influence_rank (rank, account_id);

CREATE TABLE leaderboard_rewards_current (
  account_id TEXT PRIMARY KEY,
  total_earned NUMERIC NOT NULL,
  total_claimed NUMERIC NOT NULL,
  unclaimed NUMERIC NOT NULL,
  credit_count BIGINT NOT NULL,
  last_credit_block BIGINT,
  last_claim_block BIGINT,
  rank BIGINT NOT NULL
);

CREATE INDEX leaderboard_rewards_current_rank_idx
  ON leaderboard_rewards_current (rank, account_id);

ALTER VIEW reputation_scores RENAME TO reputation_scores_calc;

CREATE TABLE reputation_scores_current AS
SELECT * FROM reputation_scores_calc WITH NO DATA;

ALTER TABLE reputation_scores_current ADD PRIMARY KEY (account_id);

CREATE INDEX reputation_scores_current_rank_idx
  ON reputation_scores_current (rank, account_id);

CREATE VIEW reputation_scores AS
SELECT * FROM reputation_scores_current;

CREATE OR REPLACE VIEW leaderboard_boost AS
SELECT
  account_id,
  locked_amount,
  effective_boost,
  lock_months,
  total_claimed,
  total_credits_purchased,
  last_event_block,
  rank
FROM leaderboard_influence_rank;

CREATE OR REPLACE VIEW leaderboard_rewards AS
SELECT
  account_id,
  total_earned,
  total_claimed,
  unclaimed,
  credit_count,
  last_credit_block,
  last_claim_block,
  rank
FROM leaderboard_rewards_current;

CREATE OR REPLACE FUNCTION refresh_leaderboard_stored_ranks()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM leaderboard_influence_rank;
  INSERT INTO leaderboard_influence_rank (
    account_id,
    locked_amount,
    effective_boost,
    lock_months,
    total_claimed,
    total_credits_purchased,
    last_event_block,
    rank
  )
  SELECT
    account_id,
    locked_amount,
    live_boost,
    lock_months,
    total_claimed,
    total_credits_purchased,
    last_event_block,
    RANK() OVER (ORDER BY live_boost::NUMERIC DESC)
  FROM (
    SELECT
      account_id,
      locked_amount,
      boost_live_effective_boost(effective_boost, unlock_at) AS live_boost,
      lock_months,
      total_claimed,
      total_credits_purchased,
      last_event_block
    FROM booster_state
  ) live
  WHERE live_boost != '0';

  DELETE FROM leaderboard_rewards_current;
  INSERT INTO leaderboard_rewards_current (
    account_id,
    total_earned,
    total_claimed,
    unclaimed,
    credit_count,
    last_credit_block,
    last_claim_block,
    rank
  )
  WITH earned AS (
    SELECT
      account_id,
      SUM(amount::NUMERIC) AS total_earned,
      COUNT(*) AS credit_count,
      MAX(block_height) AS last_credit_block
    FROM rewards_events
    WHERE event_type = 'REWARD_CREDITED'
      AND amount IS NOT NULL AND amount != ''
    GROUP BY account_id
  ),
  claimed AS (
    SELECT
      account_id,
      SUM(amount::NUMERIC) AS total_claimed,
      MAX(block_height) AS last_claim_block
    FROM rewards_events
    WHERE event_type = 'REWARD_CLAIMED'
      AND amount IS NOT NULL AND amount != ''
    GROUP BY account_id
  )
  SELECT
    e.account_id,
    e.total_earned,
    COALESCE(c.total_claimed, 0),
    e.total_earned - COALESCE(c.total_claimed, 0),
    e.credit_count,
    e.last_credit_block,
    c.last_claim_block,
    RANK() OVER (ORDER BY e.total_earned DESC)
  FROM earned e
  LEFT JOIN claimed c ON c.account_id = e.account_id;

  DELETE FROM reputation_scores_current;
  INSERT INTO reputation_scores_current
  SELECT * FROM reputation_scores_calc;
END;
$$;

CREATE OR REPLACE FUNCTION leaderboard_ranks_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('onsocial.leaderboard_ranks_done', true) IS DISTINCT FROM '1' THEN
    PERFORM set_config('onsocial.leaderboard_ranks_done', '1', true);
    PERFORM refresh_leaderboard_stored_ranks();
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'booster_state',
    'rewards_events',
    'data_updates',
    'posts_current',
    'reactions_current',
    'scarces_events',
    'scarces_active_listings'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = rel
        AND c.relkind = 'r'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS leaderboard_ranks_touch ON %I', rel);
      EXECUTE format(
        'CREATE CONSTRAINT TRIGGER leaderboard_ranks_touch
         AFTER INSERT OR UPDATE OR DELETE ON %I
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW
         EXECUTE FUNCTION leaderboard_ranks_touch()',
        rel
      );
    END IF;
  END LOOP;
END $$;

SELECT refresh_leaderboard_stored_ranks();
