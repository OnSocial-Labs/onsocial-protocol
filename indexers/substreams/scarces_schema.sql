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
CREATE INDEX IF NOT EXISTS idx_scarces_events_type_op_block
  ON scarces_events(event_type, operation, block_height DESC);
CREATE INDEX IF NOT EXISTS idx_scarces_events_account ON scarces_events(account_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_app ON scarces_events(app_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_creator ON scarces_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_bidder ON scarces_events(bidder);
CREATE INDEX IF NOT EXISTS idx_scarces_events_winner ON scarces_events(winner_id);
CREATE INDEX IF NOT EXISTS idx_scarces_events_contract ON scarces_events(contract_id);
