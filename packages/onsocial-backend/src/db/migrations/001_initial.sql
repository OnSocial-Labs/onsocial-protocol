-- =============================================================================
-- OnSocial Backend: initial schema
-- =============================================================================
-- Run with: psql $DATABASE_URL -f migrations/001_initial.sql

-- Telegram user ↔ NEAR account link
CREATE TABLE IF NOT EXISTS user_links (
  telegram_id  BIGINT       PRIMARY KEY,
  account_id   TEXT         NOT NULL UNIQUE,
  linked_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Every reward credit event
CREATE TABLE IF NOT EXISTS reward_credits (
  id            SERIAL       PRIMARY KEY,
  account_id    TEXT         NOT NULL,
  source        TEXT         NOT NULL,           -- telegram
  action        TEXT         NOT NULL,           -- message | reaction
  amount        NUMERIC(20,6) NOT NULL,
  source_ref    TEXT         NOT NULL UNIQUE,    -- dedup key
  status        TEXT         NOT NULL DEFAULT 'pending',
  tx_hash       TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Fast lookup: user's daily credits
CREATE INDEX IF NOT EXISTS idx_credits_account_day
  ON reward_credits (account_id, created_at);

-- Fast lookup: pending credits for retry
CREATE INDEX IF NOT EXISTS idx_credits_status
  ON reward_credits (status) WHERE status = 'pending';
