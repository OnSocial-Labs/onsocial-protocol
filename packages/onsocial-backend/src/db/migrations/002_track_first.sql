-- =============================================================================
-- Track-first: record activity for unlinked users, nudge tracking
-- =============================================================================

-- Pending activity from users who haven't linked a NEAR account yet.
-- Rows are processed (credited on-chain) when the user links via /start.
CREATE TABLE IF NOT EXISTS pending_activity (
  id           SERIAL       PRIMARY KEY,
  telegram_id  BIGINT       NOT NULL,
  source       TEXT         NOT NULL DEFAULT 'telegram',
  action       TEXT         NOT NULL DEFAULT 'message',
  source_ref   TEXT         NOT NULL UNIQUE,     -- same dedup key format as reward_credits
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_telegram
  ON pending_activity (telegram_id);

CREATE INDEX IF NOT EXISTS idx_pending_telegram_day
  ON pending_activity (telegram_id, created_at);

-- Track which users have been nudged in groups (one nudge per user, ever).
CREATE TABLE IF NOT EXISTS nudge_log (
  telegram_id  BIGINT       PRIMARY KEY,
  chat_id      BIGINT       NOT NULL,
  nudged_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
