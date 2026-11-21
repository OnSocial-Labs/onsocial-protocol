-- Topic junction views expose content_path for composite keyset paging.
-- View bodies live in core_schema_views.sql — this migration is a no-op marker
-- so deploy order stays explicit (apply views after indexes / feed harden).
SELECT 1;
