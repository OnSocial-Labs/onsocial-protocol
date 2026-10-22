-- Live drop catalog for indexer-first drop/player shells.
-- Upserted from COLLECTION_UPDATE create/mint/metadata/lifecycle ops.

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
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_creator
  ON scarces_collections_current(creator_id);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_app
  ON scarces_collections_current(app_id);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_kind
  ON scarces_collections_current(kind);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_flags
  ON scarces_collections_current(paused, cancelled, banned);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_updated
  ON scarces_collections_current(updated_block_timestamp DESC);
