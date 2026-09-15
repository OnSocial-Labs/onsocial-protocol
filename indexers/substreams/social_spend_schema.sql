-- OnSocial Social Spend Substreams SQL Schema
-- Used by substreams-sink-sql for social-spend contract events

-- Single sparse table for spend, settlement, payout, and admin events.
CREATE TABLE IF NOT EXISTS social_spend_events (
  id TEXT PRIMARY KEY,
  block_height BIGINT NOT NULL,
  block_timestamp BIGINT NOT NULL,
  receipt_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,

  -- Spend routing
  spender_id TEXT,
  amount TEXT,
  app_id TEXT,
  action TEXT,
  target_type TEXT,
  target_id TEXT,
  season_id TEXT,
  tag TEXT,
  recipient_id TEXT,
  treasury_amount TEXT,
  season_amount TEXT,
  target_amount TEXT,
  metadata TEXT,

  -- Season / settlement config
  label TEXT,
  active BOOLEAN,
  starts_at_ns BIGINT,
  ends_at_ns BIGINT,
  claim_starts_at_ns BIGINT,
  root TEXT,
  total_amount TEXT,

  -- Admin/config events
  paused BOOLEAN,
  old_treasury_id TEXT,
  treasury_id TEXT,
  settlement_publisher TEXT,
  owner_id TEXT,
  old_version TEXT,
  new_version TEXT,

  -- Full JSON catch-all
  extra_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_social_spend_events_type ON social_spend_events(event_type);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_block ON social_spend_events(block_height);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_account ON social_spend_events(account_id);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_spender ON social_spend_events(spender_id);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_action ON social_spend_events(action);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_season ON social_spend_events(season_id);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_target ON social_spend_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_recipient ON social_spend_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_app ON social_spend_events(app_id);
CREATE INDEX IF NOT EXISTS idx_social_spend_events_season_action ON social_spend_events(season_id, action);