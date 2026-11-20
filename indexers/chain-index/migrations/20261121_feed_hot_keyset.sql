-- Keyset cursors for feed_hot (before_amplify_heat / before_block_height /
-- before_post_key). Postgres cannot change argument lists with CREATE OR
-- REPLACE — drop the old signature; core_schema_views.sql recreates it on
-- the next views apply.

DROP FUNCTION IF EXISTS feed_hot(integer, integer, text, text, text, text[], boolean);
