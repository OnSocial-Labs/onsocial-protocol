-- Speed up album fan counts (distinct loves on scarce/{collection}/track/*).
-- View itself lives in core_schema_views.sql (applied on every sink deploy).

CREATE INDEX IF NOT EXISTS idx_data_updates_scarce_track_love
  ON data_updates (
    target_account,
    (SUBSTRING(path FROM '/scarce/([^/]+)/track/'))
  )
  WHERE data_type = 'reaction'
    AND reaction_kind = 'love'
    AND path LIKE '%/scarce/%/track/%';
