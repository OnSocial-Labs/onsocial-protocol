-- API Usage tracking table — fire-and-forget metering for developer dashboards.
-- Records every authenticated request (JWT or API key) for billing & analytics.
--
-- After applying, track in Hasura:
--   hasura metadata apply
-- or via console: Data → Track "api_usage" table

CREATE TABLE IF NOT EXISTS api_usage (
  id            BIGSERIAL   PRIMARY KEY,
  key_prefix    TEXT,                           -- NULL for JWT-only requests
  account_id    TEXT        NOT NULL,           -- key owner / JWT accountId
  actor_id      TEXT,                           -- end-user (actor passthrough), NULL if same as account_id
  endpoint      TEXT        NOT NULL,           -- e.g. "/relay/execute", "/compose/set"
  method        TEXT        NOT NULL DEFAULT 'POST',
  status_code   SMALLINT    NOT NULL,
  response_ms   INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-range analytics per account (dashboard: "today", "this month")
CREATE INDEX IF NOT EXISTS idx_api_usage_account_time
  ON api_usage (account_id, created_at DESC);

-- Per-key analytics (which key is most active)
CREATE INDEX IF NOT EXISTS idx_api_usage_key_time
  ON api_usage (key_prefix, created_at DESC)
  WHERE key_prefix IS NOT NULL;

-- Per-actor analytics (which end-users are most active)
CREATE INDEX IF NOT EXISTS idx_api_usage_actor
  ON api_usage (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- Partition-friendly: keep old data manageable
-- (optional: convert to time-based partitioning later for >1M rows/month)

COMMENT ON TABLE  api_usage IS 'Per-request usage metering for developer dashboards and billing.';
COMMENT ON COLUMN api_usage.key_prefix  IS 'First 20 chars of the API key used (NULL for JWT requests)';
COMMENT ON COLUMN api_usage.account_id  IS 'NEAR account that owns the key / JWT identity';
COMMENT ON COLUMN api_usage.actor_id    IS 'End-user identity from actor passthrough (NULL if same as account_id)';
COMMENT ON COLUMN api_usage.endpoint    IS 'Request path, e.g. /relay/execute';
COMMENT ON COLUMN api_usage.method      IS 'HTTP method (GET, POST, etc.)';
COMMENT ON COLUMN api_usage.status_code IS 'HTTP response status code';
COMMENT ON COLUMN api_usage.response_ms IS 'Response time in milliseconds';
