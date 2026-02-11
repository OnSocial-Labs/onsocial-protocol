-- API Keys table for developer authentication
-- Run against the same PostgreSQL database Hasura uses.
--
-- After applying, track in Hasura:
--   hasura metadata apply
-- or via console: Data → Track "api_keys" table

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash    TEXT        PRIMARY KEY,
  key_prefix  TEXT        NOT NULL,
  account_id  TEXT        NOT NULL,
  label       TEXT        NOT NULL DEFAULT 'default',
  tier        TEXT        NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'scale')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

-- Secondary index: fast account-level lookups (list, revoke, tier update)
CREATE INDEX IF NOT EXISTS idx_api_keys_account_id ON api_keys (account_id)
  WHERE revoked_at IS NULL;

-- Prefix index: fast revocation by visible prefix
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (account_id, key_prefix)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE  api_keys IS 'Developer API keys for gateway authentication. Raw keys never stored.';
COMMENT ON COLUMN api_keys.key_hash   IS 'SHA-256 hash of the raw API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 20 characters of the raw key, safe for display';
COMMENT ON COLUMN api_keys.account_id IS 'NEAR account ID that owns this key';
COMMENT ON COLUMN api_keys.label      IS 'Developer-chosen label (e.g. production, ci, staging)';
COMMENT ON COLUMN api_keys.tier       IS 'Rate limit tier: free (60/min), pro (600/min), scale (3000/min)';
