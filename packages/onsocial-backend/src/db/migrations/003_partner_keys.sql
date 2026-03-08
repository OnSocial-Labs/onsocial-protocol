-- =============================================================================
-- Partner API keys for the rewards SDK
-- =============================================================================

-- Each partner gets an API key scoped to their registered app_id.
CREATE TABLE IF NOT EXISTS partner_keys (
  id          SERIAL       PRIMARY KEY,
  api_key     TEXT         NOT NULL UNIQUE,       -- e.g. "os_live_abc123..."
  app_id      TEXT         NOT NULL UNIQUE,       -- maps 1:1 to on-chain app_id
  label       TEXT         NOT NULL DEFAULT '',    -- human label, e.g. "Acme Discord Bot"
  active      BOOLEAN      NOT NULL DEFAULT true,  -- revoke by setting false
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_used   TIMESTAMPTZ
);

-- Fast lookup by API key (used on every request)
CREATE INDEX IF NOT EXISTS idx_partner_keys_api_key
  ON partner_keys (api_key) WHERE active = true;
