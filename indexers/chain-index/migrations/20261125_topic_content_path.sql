-- Topic junction views: append content_path after heat for composite keyset.
-- CREATE OR REPLACE can only add columns at the end — do not insert before heat
-- (that renames heat → content_path and fails deploy). View bodies live in
-- core_schema_views.sql; this marker keeps deploy order explicit.
SELECT 1;
