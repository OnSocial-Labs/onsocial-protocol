-- Composite chrono keyset for feed_recent (before_block_height +
-- before_post_key). Postgres cannot change argument lists with CREATE OR
-- REPLACE — drop the height-only signature; core_schema_views.sql recreates
-- the composite on the next views apply.

DROP FUNCTION IF EXISTS feed_recent(integer, integer, text, text, text, text[], boolean, text, text, bigint);
