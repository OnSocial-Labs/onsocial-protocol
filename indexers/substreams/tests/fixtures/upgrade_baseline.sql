-- Simulated production shape BEFORE additive catalog columns.
-- Used by scripts/validate_sql.sh to catch CREATE TABLE IF NOT EXISTS
-- skipping new columns while CREATE INDEX references them.
--
-- Keep this fixture one migration behind `combined_schema.sql` for tables
-- that commonly gain columns/indexes. When you add a new column+index to an
-- existing table, leave that column OUT of this baseline so the upgrade path
-- is exercised.

CREATE TABLE IF NOT EXISTS scarces_active_listings (
  listing_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'unknown',
  listing_id TEXT,
  token_id TEXT,
  seller_id TEXT NOT NULL DEFAULT 'unknown',
  creator_id TEXT,
  -- intentionally no app_id
  price TEXT,
  -- intentionally no price_numeric
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
  listed_block_height BIGINT NOT NULL DEFAULT 0,
  listed_block_timestamp BIGINT NOT NULL DEFAULT 0,
  updated_block_height BIGINT NOT NULL DEFAULT 0,
  updated_block_timestamp BIGINT NOT NULL DEFAULT 0
);

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

-- Note: scarces_apps / scarces_app_creators are intentionally absent so the
-- CREATE TABLE IF NOT EXISTS path is exercised on an existing database.

-- Live drop catalog before source_post_path / medium_kind discovery columns.
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
  -- intentionally no medium_kind / source_post_path
  metadata_template TEXT,
  metadata TEXT,
  extra_json TEXT,
  royalty_json TEXT,
  created_block_height BIGINT NOT NULL DEFAULT 0,
  created_block_timestamp BIGINT NOT NULL DEFAULT 0,
  updated_block_height BIGINT NOT NULL DEFAULT 0,
  updated_block_timestamp BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_created
  ON scarces_collections_current(created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_kind
  ON scarces_collections_current(kind);

-- Seed a row so generated columns must compute from existing price text.
INSERT INTO scarces_active_listings (
  listing_key,
  kind,
  listing_id,
  seller_id,
  price,
  listed_block_height,
  listed_block_timestamp
) VALUES (
  'lazy:fixture-listing',
  'lazy',
  'fixture-listing',
  'seller.near',
  '1000000000000000000000000',
  1,
  1
);

-- Pre-materialization social current state (LIVE VIEWs). Forces combined_schema
-- to DROP VIEW before CREATE TABLE + CREATE INDEX (see 20260810_social_current_tables).
CREATE OR REPLACE VIEW posts_current AS
SELECT
  ''::text AS account_id,
  ''::text AS post_id
WHERE false;

CREATE OR REPLACE VIEW reactions_current AS
SELECT
  ''::text AS account_id,
  ''::text AS path
WHERE false;

CREATE OR REPLACE VIEW saves_current AS
SELECT
  ''::text AS account_id,
  ''::text AS content_path
WHERE false;
