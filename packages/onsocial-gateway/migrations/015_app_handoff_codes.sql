-- One-time community-dapp handoff codes. Survive gateway restarts / replicas.
CREATE TABLE IF NOT EXISTS app_handoff_codes (
  code TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  href TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS app_handoff_codes_expires_at_idx
  ON app_handoff_codes (expires_at);

COMMENT ON TABLE app_handoff_codes IS
  'One-time launcher / OS handoff codes for listed community dapps. TTL ~90s.';
