-- OnSocial Boost Substreams SQL Schema
-- Used by substreams-sink-sql for boost contract events

-- All boost events in a single normalized table
CREATE TABLE IF NOT EXISTS boost_events (
  id TEXT PRIMARY KEY,
  block_height BIGINT NOT NULL,
  block_timestamp BIGINT NOT NULL,
  receipt_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,

  -- Amounts (used by most events)
  amount TEXT,
  effective_boost TEXT,

  -- Lock fields
  months BIGINT,
  new_months BIGINT,
  new_effective_boost TEXT,

  -- Reward release fields
  elapsed_ns TEXT,
  total_released TEXT,
  remaining_pool TEXT,

  -- Credits fields
  infra_share TEXT,
  rewards_share TEXT,
  total_pool TEXT,

  -- Infra withdraw / owner change
  receiver_id TEXT,
  old_owner TEXT,
  new_owner TEXT,

  -- Contract upgrade
  old_version TEXT,
  new_version TEXT,

  -- Storage deposit
  deposit TEXT,

  -- Full JSON catch-all (ensures unknown event types are never lost)
  extra_data TEXT
);

-- Materialized view: current booster state (latest lock/extend/unlock per account)
CREATE TABLE IF NOT EXISTS booster_state (
  account_id TEXT PRIMARY KEY,
  locked_amount TEXT NOT NULL DEFAULT '0',
  effective_boost TEXT NOT NULL DEFAULT '0',
  lock_months BIGINT NOT NULL DEFAULT 0,
  total_claimed TEXT NOT NULL DEFAULT '0',
  total_credits_purchased TEXT NOT NULL DEFAULT '0',
  last_event_type TEXT,
  last_event_block BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- Credit purchase history
CREATE TABLE IF NOT EXISTS boost_credit_purchases (
  id TEXT PRIMARY KEY,
  block_height BIGINT NOT NULL,
  block_timestamp BIGINT NOT NULL,
  receipt_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  infra_share TEXT NOT NULL,
  rewards_share TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_boost_events_account ON boost_events(account_id);
CREATE INDEX IF NOT EXISTS idx_boost_events_type ON boost_events(event_type);
CREATE INDEX IF NOT EXISTS idx_boost_events_block ON boost_events(block_height);
CREATE INDEX IF NOT EXISTS idx_boost_events_account_type ON boost_events(account_id, event_type);
CREATE INDEX IF NOT EXISTS idx_boost_credit_purchases_account ON boost_credit_purchases(account_id);
CREATE INDEX IF NOT EXISTS idx_boost_credit_purchases_block ON boost_credit_purchases(block_height);
