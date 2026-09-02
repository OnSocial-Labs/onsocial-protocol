-- Generic apps/<appId>/… folder index.
-- Generated app_relpath + latest-per-path view for os.query.raw.byAppPrefix.
-- No consumer-app nouns; data_type/data_id classification is unchanged.

ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS app_relpath TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN data_type = 'apps' AND data_id IS NOT NULL AND data_id <> ''
       AND position(('/apps/' || data_id || '/') in path) > 0
      THEN substring(
        path from
        position(('/apps/' || data_id || '/') in path)
        + char_length('/apps/' || data_id || '/')
      )
      WHEN data_type = 'apps' AND data_id IS NOT NULL AND data_id <> ''
       AND (
         path = split_part(path, '/', 1) || '/apps/' || data_id
         OR path = split_part(path, '/', 1) || '/apps/' || data_id || '/'
       )
      THEN ''
      ELSE NULL
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_data_updates_app_relpath
  ON data_updates (data_id, app_relpath text_pattern_ops)
  WHERE data_type = 'apps' AND app_relpath IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_updates_apps_id_block
  ON data_updates (data_id, block_height DESC)
  WHERE data_type = 'apps';

CREATE OR REPLACE VIEW apps_current AS
SELECT DISTINCT ON (path)
  path,
  account_id,
  data_id,
  app_relpath,
  value,
  value_json,
  operation,
  block_height,
  block_timestamp,
  receipt_id,
  author,
  actor_id
FROM data_updates
WHERE data_type = 'apps'
ORDER BY path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC;
