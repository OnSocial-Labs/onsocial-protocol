-- Hub publish inbox. One row per app and account.
CREATE TABLE IF NOT EXISTS scarces_publish_requests (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  requested_at BIGINT NOT NULL DEFAULT 0,
  decided_by TEXT,
  updated_block_height BIGINT NOT NULL DEFAULT 0,
  updated_block_timestamp BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scarces_publish_requests_app_status
  ON scarces_publish_requests(app_id, status);
