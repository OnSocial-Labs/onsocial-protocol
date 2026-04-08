-- OnSocial Rewards Substreams SQL Schema
-- Used by substreams-sink-sql for rewards contract events

-- All rewards events in a single normalized table
CREATE TABLE IF NOT EXISTS rewards_events (
  id TEXT PRIMARY KEY,
  block_height BIGINT NOT NULL,
  block_timestamp BIGINT NOT NULL,
  receipt_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,

  -- Credit fields
  amount TEXT,
  source TEXT,
  credited_by TEXT,
  app_id TEXT,

  -- Pool deposit
  new_balance TEXT,

  -- Owner change
  old_owner TEXT,
  new_owner TEXT,

  -- Max daily
  old_max TEXT,
  new_max TEXT,

  -- Executor / caller
  executor TEXT,
  caller TEXT,

  -- Contract upgrade
  old_version TEXT,
  new_version TEXT,

  -- Full JSON catch-all (ensures unknown event types are never lost)
  extra_data TEXT
);

-- Materialized view: current reward state per user
CREATE TABLE IF NOT EXISTS user_reward_state (
  account_id TEXT PRIMARY KEY,
  total_earned TEXT NOT NULL DEFAULT '0',
  total_claimed TEXT NOT NULL DEFAULT '0',
  last_credit_block BIGINT NOT NULL DEFAULT 0,
  last_claim_block BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rewards_events_account ON rewards_events(account_id);
CREATE INDEX IF NOT EXISTS idx_rewards_events_type ON rewards_events(event_type);
CREATE INDEX IF NOT EXISTS idx_rewards_events_block ON rewards_events(block_height);
CREATE INDEX IF NOT EXISTS idx_rewards_events_account_type ON rewards_events(account_id, event_type);
CREATE INDEX IF NOT EXISTS idx_rewards_events_app ON rewards_events(app_id);
