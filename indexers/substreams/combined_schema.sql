-- =============================================================================
-- OnSocial Combined Schema — All Contracts (self-contained)
-- =============================================================================
-- This file contains ALL table definitions from all 5 contract schemas.
-- It is embedded in the combined spkg for substreams-sink-sql setup.
-- For manual apply:  psql "$DATABASE_URL" -f combined_schema.sql
-- =============================================================================

-- ===================== core =====================

-- OnSocial Substreams SQL Schema
-- Used by substreams-sink-sql

CREATE TABLE IF NOT EXISTS data_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  path TEXT,
  value TEXT,
  account_id TEXT,
  data_type TEXT,
  data_id TEXT,
  group_id TEXT,
  group_path TEXT,
  is_group_content BOOLEAN,
  target_account TEXT,
  parent_path TEXT,
  parent_author TEXT,
  parent_type TEXT,
  ref_path TEXT,
  ref_author TEXT,
  ref_type TEXT,
  refs TEXT,
  ref_authors TEXT,
  derived_id TEXT,
  derived_type TEXT,
  writes TEXT,
  extra_data TEXT,
  reaction_kind TEXT,
  channel TEXT,
  kind TEXT,
  audiences TEXT
);

CREATE TABLE IF NOT EXISTS storage_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  amount TEXT,
  previous_balance TEXT,
  new_balance TEXT,
  pool_id TEXT,
  pool_key TEXT,
  group_id TEXT,
  reason TEXT,
  auth_type TEXT,
  actor_id TEXT,
  payer_id TEXT,
  target_id TEXT,
  available_balance TEXT,
  donor TEXT,
  payer TEXT,
  previous_pool_balance TEXT,
  new_pool_balance TEXT,
  bytes TEXT,
  remaining_allowance TEXT,
  pool_account TEXT,
  max_bytes TEXT,
  new_shared_bytes TEXT,
  new_used_bytes TEXT,
  pool_available_bytes TEXT,
  used_bytes TEXT,
  extra_data TEXT
);

CREATE TABLE IF NOT EXISTS group_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,

  -- Group identification
  group_id TEXT,

  -- Member fields
  member_id TEXT,
  member_nonce BIGINT,
  member_nonce_path TEXT,
  role TEXT,
  level INTEGER,

  -- Path and value
  path TEXT,
  value TEXT,

  -- Pool fields
  pool_key TEXT,
  amount TEXT,
  previous_pool_balance TEXT,
  new_pool_balance TEXT,

  -- Sponsor quota
  quota_bytes TEXT,
  quota_used TEXT,
  daily_limit TEXT,
  previously_enabled BOOLEAN,

  -- Proposal fields
  proposal_id TEXT,
  proposal_type TEXT,
  status TEXT,
  sequence_number BIGINT,
  title TEXT,
  description TEXT,
  auto_vote BOOLEAN,
  created_at BIGINT,
  locked_member_count INTEGER,
  locked_deposit TEXT,
  expires_at BIGINT,
  tally_path TEXT,
  counter_path TEXT,

  -- Voting fields
  voter TEXT,
  approve BOOLEAN,
  total_votes INTEGER,
  yes_votes INTEGER,
  no_votes INTEGER,
  should_execute BOOLEAN,
  should_reject BOOLEAN,
  voted_at BIGINT,

  -- Voting config
  voting_period BIGINT,
  participation_quorum INTEGER,
  approval_threshold INTEGER,

  -- Permission fields
  permission_key TEXT,
  permission_value TEXT,
  permission_target TEXT,

  -- Create group fields
  name TEXT,
  is_public BOOLEAN,
  creator_role TEXT,
  storage_allocation TEXT,

  -- Full JSON catch-all
  extra_data TEXT
);

CREATE TABLE IF NOT EXISTS contract_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  path TEXT,
  derived_id TEXT,
  derived_type TEXT,
  target_id TEXT,
  auth_type TEXT,
  actor_id TEXT,
  payer_id TEXT,
  extra_data TEXT
);

CREATE TABLE IF NOT EXISTS permission_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  path TEXT,
  target_id TEXT,
  public_key TEXT,
  level INTEGER,
  expires_at BIGINT,
  value TEXT,
  deleted BOOLEAN,
  derived_id TEXT,
  derived_type TEXT,
  permission_nonce BIGINT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_data_updates_author ON data_updates(author);
CREATE INDEX IF NOT EXISTS idx_data_updates_account_id ON data_updates(account_id);
CREATE INDEX IF NOT EXISTS idx_data_updates_block_height ON data_updates(block_height);
CREATE INDEX IF NOT EXISTS idx_data_updates_data_type ON data_updates(data_type);
CREATE INDEX IF NOT EXISTS idx_storage_updates_author ON storage_updates(author);
CREATE INDEX IF NOT EXISTS idx_storage_updates_block_height ON storage_updates(block_height);
CREATE INDEX IF NOT EXISTS idx_group_updates_group_id ON group_updates(group_id);
CREATE INDEX IF NOT EXISTS idx_group_updates_author ON group_updates(author);
CREATE INDEX IF NOT EXISTS idx_group_updates_operation ON group_updates(operation);
CREATE INDEX IF NOT EXISTS idx_group_updates_proposal_id ON group_updates(proposal_id);
CREATE INDEX IF NOT EXISTS idx_group_updates_sequence_number ON group_updates(sequence_number);
CREATE INDEX IF NOT EXISTS idx_group_updates_status ON group_updates(status);
CREATE INDEX IF NOT EXISTS idx_group_updates_voter ON group_updates(voter);
CREATE INDEX IF NOT EXISTS idx_group_updates_block_height ON group_updates(block_height);
CREATE INDEX IF NOT EXISTS idx_permission_updates_author ON permission_updates(author);

-- ===================== boost =====================

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

-- ===================== rewards =====================

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

-- ===================== token =====================

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
  new_owner_id TEXT,

  -- Full JSON catch-all (ensures unknown event types are never lost)
  extra_data TEXT
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

-- ===================== scarces =====================

-- OnSocial Scarces Substreams SQL Schema
-- Used by substreams-sink-sql for scarces contract events
--
-- Single normalized table covering all 7 event types:
--   SCARCE_UPDATE, COLLECTION_UPDATE, LAZY_LISTING_UPDATE,
--   CONTRACT_UPDATE, OFFER_UPDATE, STORAGE_UPDATE, APP_POOL_UPDATE
--
-- Columns are nullable — only the fields relevant to each operation are populated.
-- extra_data (JSONB) preserves the full event payload for future-proofing.

CREATE TABLE IF NOT EXISTS scarces_events (
  id TEXT PRIMARY KEY,
  block_height BIGINT NOT NULL,
  block_timestamp BIGINT NOT NULL,
  receipt_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  author TEXT NOT NULL,

  -- Identity / routing
  token_id TEXT,
  collection_id TEXT,
  listing_id TEXT,
  owner_id TEXT,
  creator_id TEXT,
  buyer_id TEXT,
  seller_id TEXT,
  bidder TEXT,
  winner_id TEXT,
  sender_id TEXT,
  receiver_id TEXT,
  account_id TEXT,
  executor TEXT,
  contract_id TEXT,

  -- NFT contract reference (cross-contract listings)
  scarce_contract_id TEXT,

  -- Financial (stored as TEXT for u128 precision)
  amount TEXT,
  price TEXT,
  old_price TEXT,
  new_price TEXT,
  bid_amount TEXT,
  attempted_price TEXT,
  marketplace_fee TEXT,
  app_pool_amount TEXT,
  app_commission TEXT,
  creator_payment TEXT,
  revenue TEXT,
  new_balance TEXT,
  initial_balance TEXT,
  refunded_amount TEXT,
  refund_per_token TEXT,
  refund_pool TEXT,

  -- Quantity / count
  quantity INTEGER,
  total_supply INTEGER,
  redeem_count INTEGER,
  max_redeems INTEGER,
  bid_count INTEGER,
  refundable_count INTEGER,

  -- Auction
  reserve_price TEXT,
  buy_now_price TEXT,
  min_bid_increment TEXT,
  winning_bid TEXT,
  expires_at BIGINT,
  auction_duration_ns BIGINT,
  anti_snipe_extension_ns BIGINT,

  -- App pool
  app_id TEXT,
  funder TEXT,

  -- Ownership / transfers
  old_owner TEXT,
  new_owner TEXT,
  old_recipient TEXT,
  new_recipient TEXT,

  -- Misc
  reason TEXT,
  mode TEXT,
  memo TEXT,

  -- Array fields (stored as JSON text)
  token_ids TEXT,
  prices TEXT,
  receivers TEXT,
  accounts TEXT,

  -- Contract config
  old_version TEXT,
  new_version TEXT,
  total_fee_bps INTEGER,
  app_pool_fee_bps INTEGER,
  platform_storage_fee_bps INTEGER,

  -- Timing
  start_time BIGINT,
  end_time BIGINT,
  new_expires_at BIGINT,
  old_expires_at BIGINT,

  -- Approval
  approval_id BIGINT,

  -- Storage
  deposit TEXT,
  remaining_balance TEXT,
  cap TEXT,

  -- Full JSON catch-all
  extra_data TEXT
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_scarces_events_type ON scarces_events(event_type);
CREATE INDEX IF NOT EXISTS idx_scarces_events_operation ON scarces_events(operation);
CREATE INDEX IF NOT EXISTS idx_scarces_events_block ON scarces_events(block_height);
CREATE INDEX IF NOT EXISTS idx_scarces_events_token ON scarces_events(token_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_collection ON scarces_events(collection_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_owner ON scarces_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_buyer ON scarces_events(buyer_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_seller ON scarces_events(seller_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_listing ON scarces_events(listing_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_type_op ON scarces_events(event_type, operation);
CREATE INDEX IF NOT EXISTS idx_scarces_events_account ON scarces_events(account_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_app ON scarces_events(app_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_creator ON scarces_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_bidder ON scarces_events(bidder);
CREATE INDEX IF NOT EXISTS idx_scarces_events_winner ON scarces_events(winner_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_contract ON scarces_events(contract_id);

