-- Hiring listings (jobs/). Discover columns land via view files
-- (profile_search / profile_discover / jobs_search).

CREATE INDEX IF NOT EXISTS idx_data_updates_jobs_dedup
  ON data_updates(account_id, data_id, block_height DESC)
  WHERE data_type = 'jobs';

CREATE OR REPLACE VIEW jobs_current AS
SELECT DISTINCT ON (account_id, data_id)
  account_id,
  data_id                      AS job_id,
  path,
  value,
  value_json,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'jobs'
ORDER BY account_id, data_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;
