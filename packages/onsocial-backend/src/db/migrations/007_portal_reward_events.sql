-- =============================================================================
-- Portal reward action events
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_reward_events (
  id                  BIGSERIAL     PRIMARY KEY,
  app_id              TEXT          NOT NULL,
  account_id          TEXT          NOT NULL,
  action              TEXT          NOT NULL,
  target_account_id   TEXT,
  topic               TEXT,
  reward_day          DATE          NOT NULL DEFAULT CURRENT_DATE,
  idempotency_key     TEXT          NOT NULL UNIQUE,
  amount              TEXT          NOT NULL,
  source              TEXT          NOT NULL,
  proof               JSONB         NOT NULL DEFAULT '{}'::jsonb,
  reward_tx_hash      TEXT,
  status              TEXT          NOT NULL DEFAULT 'credited',
  error               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_reward_events_account_day
  ON portal_reward_events (app_id, account_id, reward_day);

CREATE INDEX IF NOT EXISTS idx_portal_reward_events_action_day
  ON portal_reward_events (app_id, account_id, action, reward_day);

CREATE INDEX IF NOT EXISTS idx_portal_reward_events_created_at
  ON portal_reward_events (created_at DESC);
