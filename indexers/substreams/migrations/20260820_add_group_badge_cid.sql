-- Guild identity badge (x.onsocial.badge) — derived group_badge_cid on guild views.
-- Postgres CREATE OR REPLACE VIEW cannot insert columns mid-list, so dependents
-- drop first; core_schema_views.sql recreates them on the next views apply.
-- feed_pulse is RETURNS SETOF posts_feed — drop it before the view.

DROP FUNCTION IF EXISTS feed_pulse(text[], integer, integer, text);
DROP VIEW IF EXISTS posts_feed;
DROP VIEW IF EXISTS groups_by_member_count;
DROP VIEW IF EXISTS group_member_counts;
DROP VIEW IF EXISTS group_members_current;
DROP VIEW IF EXISTS group_blacklist_current;
DROP VIEW IF EXISTS groups_current;
