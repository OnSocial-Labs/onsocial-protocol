-- OnSocial Staking Substreams SQL Schema
-- Used by substreams-sink-sql for staking contract events

-- All staking events in a single normalized table
CREATE TABLE IF NOT EXISTS staking_events (
  id TEXT PRIMARY KEY,
  block_height BIGINT NOT NULL,
  block_timestamp BIGINT NOT NULL,
  receipt_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,

  -- Amounts (used by most events)
  amount TEXT,
  effective_stake TEXT,

  -- Lock fields
  months BIGINT,
  new_months BIGINT,
  new_effective TEXT,

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
  old_version INTEGER,
  new_version INTEGER,

  -- Storage deposit
  deposit TEXT
);

-- Materialized view: current staker state (latest lock/extend/unlock per account)
-- Gateway queries this instead of RPC
CREATE TABLE IF NOT EXISTS staker_state (
  account_id TEXT PRIMARY KEY,
  locked_amount TEXT NOT NULL DEFAULT '0',
  effective_stake TEXT NOT NULL DEFAULT '0',
  lock_months BIGINT NOT NULL DEFAULT 0,
  total_claimed TEXT NOT NULL DEFAULT '0',
  total_credits_purchased TEXT NOT NULL DEFAULT '0',
  last_event_type TEXT,
  last_event_block BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- Credit purchase history (gateway reads this for credit balance)
CREATE TABLE IF NOT EXISTS credit_purchases (
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
CREATE INDEX IF NOT EXISTS idx_staking_events_account ON staking_events(account_id);
CREATE INDEX IF NOT EXISTS idx_staking_events_type ON staking_events(event_type);
CREATE INDEX IF NOT EXISTS idx_staking_events_block ON staking_events(block_height);
CREATE INDEX IF NOT EXISTS idx_staking_events_account_type ON staking_events(account_id, event_type);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_account ON credit_purchases(account_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_block ON credit_purchases(block_height);
