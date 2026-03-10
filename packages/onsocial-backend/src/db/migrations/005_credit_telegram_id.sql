-- =============================================================================
-- Add telegram_id to reward_credits for per-user daily cap enforcement.
-- Prevents a single Telegram user from cycling NEAR accounts to bypass caps.
-- =============================================================================

ALTER TABLE reward_credits ADD COLUMN IF NOT EXISTS telegram_id BIGINT;

-- Index for per-telegram daily cap lookups
CREATE INDEX IF NOT EXISTS idx_credits_telegram_day
  ON reward_credits (telegram_id, created_at)
  WHERE telegram_id IS NOT NULL;
