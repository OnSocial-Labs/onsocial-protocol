-- feed_recent: incomplete chrono keysets must not COALESCE(path,'') (height-only
-- skip). Function body lives in core_schema_views.sql — this migration is a
-- no-op marker so deploy order stays explicit after the composite keyset land.
SELECT 1;
