-- Viewer-private mute preferences (off-chain).
-- Auth'd gateway API scopes all reads/writes to the JWT / API-key account.

CREATE TABLE IF NOT EXISTS user_mutes (
  owner_account_id  TEXT        NOT NULL,
  muted_account_id  TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_account_id, muted_account_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_owner_created
  ON user_mutes(owner_account_id, created_at DESC);

COMMENT ON TABLE user_mutes IS 'Private mute list per viewer account (gateway prefs, not on-chain).';
COMMENT ON COLUMN user_mutes.owner_account_id IS 'Viewer who muted the target.';
COMMENT ON COLUMN user_mutes.muted_account_id IS 'Account hidden from the viewer.';
