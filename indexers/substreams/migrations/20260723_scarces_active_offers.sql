-- One-shot: materialised open Scarces offers for existing indexer DBs.
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
