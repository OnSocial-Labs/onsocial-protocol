-- =============================================================================
-- OnSocial Combined Schema — All Contracts (self-contained)
-- =============================================================================
-- Embedded SQL schema for the combined substreams-sink-sql package.
-- Contains the tables from core, boost, rewards, token, and scarces.
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
  audiences TEXT,
  actor_id TEXT,
  payer_id TEXT
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

-- JSON object/array values are indexed without changing the raw `value` column.
ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS value_json jsonb
  GENERATED ALWAYS AS (
    CASE WHEN value ~ '^[\[\{]' THEN value::jsonb ELSE NULL END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_data_updates_value_json_gin
  ON data_updates USING gin (value_json jsonb_path_ops)
  WHERE value_json IS NOT NULL;

-- Relative path under apps/<appId>/… for prefix lists (byAppPrefix).
-- NULL unless data_type = 'apps'. Empty string at the app root.
ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS app_relpath TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN data_type = 'apps' AND data_id IS NOT NULL AND data_id <> ''
       AND position(('/apps/' || data_id || '/') in path) > 0
      THEN substring(
        path from
        position(('/apps/' || data_id || '/') in path)
        + char_length('/apps/' || data_id || '/')
      )
      WHEN data_type = 'apps' AND data_id IS NOT NULL AND data_id <> ''
       AND (
         path = split_part(path, '/', 1) || '/apps/' || data_id
         OR path = split_part(path, '/', 1) || '/apps/' || data_id || '/'
       )
      THEN ''
      ELSE NULL
    END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_data_updates_app_relpath
  ON data_updates (data_id, app_relpath text_pattern_ops)
  WHERE data_type = 'apps' AND app_relpath IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_updates_apps_id_block
  ON data_updates (data_id, block_height DESC)
  WHERE data_type = 'apps';

ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS payer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_data_updates_actor_id ON data_updates(actor_id) WHERE actor_id IS NOT NULL AND actor_id != '';
CREATE INDEX IF NOT EXISTS idx_data_updates_payer_id ON data_updates(payer_id) WHERE payer_id IS NOT NULL AND payer_id != '';

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

-- Sink-maintained current social state (upsert from core_db_out; data_updates stays append-only).
-- Live DBs may still have these as VIEWs: CREATE TABLE IF NOT EXISTS would skip and
-- CREATE INDEX would fail — drop views first (CASCADE; dependent views reapplied after).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'posts_current'
  ) THEN
    EXECUTE 'DROP VIEW public.posts_current CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'reactions_current'
  ) THEN
    EXECUTE 'DROP VIEW public.reactions_current CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'saves_current'
  ) THEN
    EXECUTE 'DROP VIEW public.saves_current CASCADE';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS posts_current (
  account_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  value TEXT,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  parent_path TEXT,
  parent_author TEXT,
  parent_type TEXT,
  ref_path TEXT,
  ref_author TEXT,
  ref_type TEXT,
  channel TEXT,
  kind TEXT,
  audiences TEXT,
  group_id TEXT,
  is_group_content BOOLEAN,
  root_path TEXT NOT NULL DEFAULT '',
  root_author TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (account_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_posts_current_block ON posts_current(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_posts_current_group ON posts_current(group_id) WHERE group_id IS NOT NULL AND group_id != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_group_feed
  ON posts_current (group_id, is_group_content, block_height DESC)
  WHERE group_id IS NOT NULL AND group_id != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_group_channel
  ON posts_current (group_id, channel, is_group_content, block_height DESC)
  WHERE group_id IS NOT NULL AND group_id != '' AND channel IS NOT NULL AND channel != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_parent ON posts_current(parent_path) WHERE parent_path IS NOT NULL AND parent_path != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_ref ON posts_current(ref_path) WHERE ref_path IS NOT NULL AND ref_path != '';
ALTER TABLE posts_current ADD COLUMN IF NOT EXISTS root_path TEXT NOT NULL DEFAULT '';
ALTER TABLE posts_current ADD COLUMN IF NOT EXISTS root_author TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_posts_current_root
  ON posts_current(root_path)
  WHERE root_path IS NOT NULL AND root_path != '';

CREATE TABLE IF NOT EXISTS reactions_current (
  account_id TEXT NOT NULL,
  path TEXT NOT NULL,
  post_owner TEXT,
  reaction_kind TEXT,
  value TEXT,
  block_height BIGINT,
  block_timestamp BIGINT,
  operation TEXT,
  PRIMARY KEY (account_id, path)
);
CREATE INDEX IF NOT EXISTS idx_reactions_current_owner_kind ON reactions_current(post_owner, reaction_kind) WHERE operation = 'set';
CREATE INDEX IF NOT EXISTS idx_reactions_current_block ON reactions_current(block_height DESC);

CREATE TABLE IF NOT EXISTS saves_current (
  account_id TEXT NOT NULL,
  content_path TEXT NOT NULL,
  value TEXT,
  block_height BIGINT,
  block_timestamp BIGINT,
  operation TEXT,
  PRIMARY KEY (account_id, content_path)
);
CREATE INDEX IF NOT EXISTS idx_saves_current_block ON saves_current(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_saves_current_path ON saves_current(content_path);

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

-- Sink-maintained booster state per account.
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

  -- Caller
  caller TEXT,

  -- Contract upgrade
  old_version TEXT,
  new_version TEXT,

  -- Full JSON catch-all (ensures unknown event types are never lost)
  extra_data TEXT
);

-- Sink-maintained reward state per account.
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
CREATE INDEX IF NOT EXISTS idx_rewards_events_type_app_account ON rewards_events(event_type, app_id, account_id);

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

-- Last indexed token activity per account.
-- On-chain FT balances remain authoritative via ft_balance_of RPC.
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
-- extra_data stores serialized event JSON for fields without typed columns.

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

-- Sink-maintained live Market catalog (upsert on list/create, delete on sell/cancel).
CREATE TABLE IF NOT EXISTS scarces_active_listings (
  listing_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'unknown',
  listing_id TEXT,
  token_id TEXT,
  seller_id TEXT NOT NULL DEFAULT 'unknown',
  creator_id TEXT,
  -- App that the listing was created under (NULL for unattributed listings).
  app_id TEXT,
  price TEXT,
  -- Generated numeric mirror of `price` so the sink never writes it and
  -- price sorts stay index-backed (yocto values exceed BIGINT).
  price_numeric NUMERIC GENERATED ALWAYS AS (
    CASE WHEN price ~ '^[0-9]+$' THEN price::numeric ELSE NULL END
  ) STORED,
  reserve_price TEXT,
  buy_now_price TEXT,
  highest_bid TEXT,
  bid_count INTEGER NOT NULL DEFAULT 0,
  copies INTEGER,
  remaining INTEGER,
  minted_count INTEGER,
  expires_at BIGINT,
  title TEXT,
  media TEXT,
  source_post_path TEXT,
  card_bg TEXT,
  extra_json TEXT,
  -- Discovery columns extracted from NEP-177 extra (not listing kind).
  medium_kind TEXT,
  audio_format TEXT,
  facets TEXT[],
  listed_block_height BIGINT NOT NULL DEFAULT 0,
  listed_block_timestamp BIGINT NOT NULL DEFAULT 0,
  updated_block_height BIGINT NOT NULL DEFAULT 0,
  updated_block_timestamp BIGINT NOT NULL DEFAULT 0
);

-- Existing deployments skip CREATE TABLE; ensure added columns before indexes.
ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS price_numeric NUMERIC GENERATED ALWAYS AS (
    CASE WHEN price ~ '^[0-9]+$' THEN price::numeric ELSE NULL END
  ) STORED;

ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS app_id TEXT;

ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS medium_kind TEXT;

ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS audio_format TEXT;

ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS facets TEXT[];

CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_listed
  ON scarces_active_listings(listed_block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_kind
  ON scarces_active_listings(kind);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_seller
  ON scarces_active_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_token
  ON scarces_active_listings(token_id);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_listing
  ON scarces_active_listings(listing_id);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_price
  ON scarces_active_listings(price_numeric);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_expires
  ON scarces_active_listings(expires_at);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_kind_listed
  ON scarces_active_listings(kind, listed_block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_app
  ON scarces_active_listings(app_id);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_medium_kind
  ON scarces_active_listings(medium_kind);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_audio_format
  ON scarces_active_listings(audio_format);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_facets
  ON scarces_active_listings USING GIN (facets);

-- Sink-maintained open offers (upsert on made, delete on cancel/accept).
CREATE TABLE IF NOT EXISTS scarces_active_offers (
  offer_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  token_id TEXT,
  collection_id TEXT,
  buyer_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  expires_at BIGINT,
  created_block_height BIGINT NOT NULL DEFAULT 0,
  created_block_timestamp BIGINT NOT NULL DEFAULT 0,
  updated_block_height BIGINT NOT NULL DEFAULT 0,
  updated_block_timestamp BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scarces_active_offers_token
  ON scarces_active_offers(token_id);
CREATE INDEX IF NOT EXISTS idx_scarces_active_offers_collection
  ON scarces_active_offers(collection_id);
CREATE INDEX IF NOT EXISTS idx_scarces_active_offers_buyer
  ON scarces_active_offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_scarces_active_offers_kind
  ON scarces_active_offers(kind);
CREATE INDEX IF NOT EXISTS idx_scarces_active_offers_updated
  ON scarces_active_offers(updated_block_timestamp DESC);

-- Sink-maintained live app catalog (upsert on register/config_update/owner_transferred).
-- Pool balance is intentionally not mirrored here — fund/withdraw stay events-only.
CREATE TABLE IF NOT EXISTS scarces_apps (
  app_id TEXT PRIMARY KEY,
  owner_id TEXT,
  primary_sale_bps INTEGER,
  creator_access TEXT,
  curated BOOLEAN,
  metadata TEXT,
  created_block_height BIGINT DEFAULT 0,
  created_block_timestamp BIGINT DEFAULT 0,
  updated_block_height BIGINT DEFAULT 0,
  updated_block_timestamp BIGINT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scarces_apps_owner
  ON scarces_apps(owner_id);
CREATE INDEX IF NOT EXISTS idx_scarces_apps_updated
  ON scarces_apps(updated_block_timestamp DESC);

-- Sink-maintained app membership roster (upsert on add, delete on remove).
CREATE TABLE IF NOT EXISTS scarces_app_creators (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role TEXT NOT NULL,
  added_block_height BIGINT DEFAULT 0,
  added_block_timestamp BIGINT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scarces_app_creators_app_role
  ON scarces_app_creators(app_id, role);
CREATE INDEX IF NOT EXISTS idx_scarces_app_creators_account
  ON scarces_app_creators(account_id);

-- Sink-maintained live drop catalog (upsert on COLLECTION_UPDATE create/mint/lifecycle).
CREATE TABLE IF NOT EXISTS scarces_collections_current (
  collection_id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL DEFAULT 'unknown',
  app_id TEXT,
  price TEXT,
  allowlist_price TEXT,
  total_supply INTEGER NOT NULL DEFAULT 0,
  minted_count INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL DEFAULT 0,
  start_time BIGINT,
  end_time BIGINT,
  created_at BIGINT,
  mint_mode TEXT,
  max_per_wallet INTEGER,
  paused BOOLEAN NOT NULL DEFAULT false,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  banned BOOLEAN NOT NULL DEFAULT false,
  transferable BOOLEAN,
  renewable BOOLEAN,
  max_redeems INTEGER,
  random_assignment BOOLEAN NOT NULL DEFAULT false,
  app_commission_bps INTEGER,
  title TEXT,
  media TEXT,
  description TEXT,
  kind TEXT,
  medium_kind TEXT,
  source_post_path TEXT,
  metadata_template TEXT,
  metadata TEXT,
  extra_json TEXT,
  royalty_json TEXT,
  created_block_height BIGINT NOT NULL DEFAULT 0,
  created_block_timestamp BIGINT NOT NULL DEFAULT 0,
  updated_block_height BIGINT NOT NULL DEFAULT 0,
  updated_block_timestamp BIGINT NOT NULL DEFAULT 0
);

-- Existing deployments skip CREATE TABLE; ensure added columns before indexes.
ALTER TABLE scarces_collections_current
  ADD COLUMN IF NOT EXISTS medium_kind TEXT;

ALTER TABLE scarces_collections_current
  ADD COLUMN IF NOT EXISTS source_post_path TEXT;

CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_created
  ON scarces_collections_current(created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_creator
  ON scarces_collections_current(creator_id);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_app
  ON scarces_collections_current(app_id);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_kind
  ON scarces_collections_current(kind);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_medium_kind
  ON scarces_collections_current(medium_kind);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_source_post
  ON scarces_collections_current(source_post_path);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_flags
  ON scarces_collections_current(paused, cancelled, banned);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_updated
  ON scarces_collections_current(updated_block_timestamp DESC);

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

-- ===================== social-spend =====================

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

