-- Saved feed keyset: account saves ordered by block_height + content_path.
-- CONCURRENTLY: outside the views --single-transaction apply.
-- Drop INVALID leftovers from an interrupted CONCURRENTLY build first.

SELECT format('DROP INDEX CONCURRENTLY IF EXISTS %I', c.relname)
FROM pg_class c
JOIN pg_index i ON i.indexrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'idx_saves_current_account_feed_keyset'
  AND NOT i.indisvalid;
\gexec

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saves_current_account_feed_keyset
  ON saves_current (account_id, block_height DESC, content_path DESC);
