-- Keyset cursors for feed_recent (before_block_height) and feed_pulse
-- (before_event_height / heat / key). Postgres cannot change argument lists
-- with CREATE OR REPLACE — drop the old signatures; core_schema_views.sql
-- recreates both on the next views apply.

DROP FUNCTION IF EXISTS feed_pulse(text[], integer, integer, text);
DROP FUNCTION IF EXISTS feed_recent(integer, integer, text, text, text, text[], boolean, text, text);
