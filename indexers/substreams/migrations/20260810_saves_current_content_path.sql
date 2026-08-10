-- Normalize saves_current.content_path to the bare content path
-- (strip `account/saved/` or leading `saved/`), matching SDK forPaths / Saves list.

CREATE OR REPLACE VIEW saves_current AS
SELECT DISTINCT ON (account_id, path)
  account_id,
  COALESCE(
    SUBSTRING(path FROM '^[^/]+/saved/(.+)$'),
    SUBSTRING(path FROM '^saved/(.+)$'),
    path
  ) AS content_path,
  value,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'saved'
ORDER BY account_id, path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;
