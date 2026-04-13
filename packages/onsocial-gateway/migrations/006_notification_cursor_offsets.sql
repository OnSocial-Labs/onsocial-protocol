ALTER TABLE notification_cursors
  ADD COLUMN IF NOT EXISTS last_event_id TEXT NOT NULL DEFAULT '';

UPDATE notification_cursors
SET last_event_id = COALESCE(last_event_id, '')
WHERE last_event_id IS NULL;

COMMENT ON COLUMN notification_cursors.last_event_id IS
  'Stable tie-breaker for rows sharing the same last_block_height.';