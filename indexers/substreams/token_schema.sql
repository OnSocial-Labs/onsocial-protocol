-- OnSocial Token (NEP-141) Substreams SQL Schema
-- Used by substreams-sink-sql for token contract events

-- All NEP-141 token events in a single normalized table
CREATE TABLE IF NOT EXISTS token_events (
  id TEXT PRIMARY KEY,
  block_height BIGINT NOT NULL,
  block_timestamp BIGINT NOT NULL,
  receipt_id TEXT NOT NULL,
  event_type TEXT NOT NULL,       -- ft_mint, ft_burn, ft_transfer

  -- ft_mint / ft_burn fields
  owner_id TEXT,
  amount TEXT,
  memo TEXT,

  -- ft_transfer fields
  old_owner_id TEXT,
  new_owner_id TEXT
);

-- Materialized view: last-known activity per account
-- NOTE: On-chain balances are authoritative (ft_balance_of RPC).
-- This table tracks event history, not running balances, because
-- substreams-sink-sql uses CREATE (not UPSERT) — a proper running
-- balance requires a store module or post-processing SQL trigger.
CREATE TABLE IF NOT EXISTS token_balances (
  account_id TEXT PRIMARY KEY,
  last_event_type TEXT,
  last_event_block BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_token_events_type ON token_events(event_type);
CREATE INDEX IF NOT EXISTS idx_token_events_block ON token_events(block_height);
CREATE INDEX IF NOT EXISTS idx_token_events_owner ON token_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_token_events_old_owner ON token_events(old_owner_id);
CREATE INDEX IF NOT EXISTS idx_token_events_new_owner ON token_events(new_owner_id);
