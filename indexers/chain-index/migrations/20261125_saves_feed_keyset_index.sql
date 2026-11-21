-- Saved feed keyset: account saves ordered by block_height + content_path.
-- CONCURRENTLY: outside the views --single-transaction apply.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saves_current_account_feed_keyset
  ON saves_current (account_id, block_height DESC, content_path DESC);
