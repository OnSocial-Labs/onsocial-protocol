-- Standing services (offers/). Discover columns land via view files
-- (profile_search / profile_discover / offers_search).

CREATE INDEX IF NOT EXISTS idx_data_updates_offers_dedup
  ON data_updates(account_id, data_id, block_height DESC)
  WHERE data_type = 'offers';

CREATE OR REPLACE VIEW offers_current AS
SELECT DISTINCT ON (account_id, data_id)
  account_id,
  data_id                      AS offer_id,
  path,
  value,
  value_json,
  block_height,
  block_timestamp,
  operation
FROM data_updates
WHERE data_type = 'offers'
ORDER BY account_id, data_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;
