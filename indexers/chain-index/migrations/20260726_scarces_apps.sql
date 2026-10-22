-- One-shot: app catalog, membership roster, and app tagging on live listings
-- for existing indexer DBs.

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

-- Column must exist before the index that references it.
ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS app_id TEXT;

CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_app
  ON scarces_active_listings(app_id);
