-- Guilds are banner-only — drop derived group_avatar_cid from guild views.
-- Postgres CREATE OR REPLACE VIEW cannot remove columns, so dependents must
-- drop first; core_schema_views.sql recreates them on the next views apply.
--
-- Dependents of groups_current (same order as validate_guild_view_upgrade).
-- feed_pulse is RETURNS SETOF posts_feed — drop it before the view.

DROP FUNCTION IF EXISTS feed_pulse(text[], integer, integer, text);
DROP VIEW IF EXISTS posts_feed;
DROP VIEW IF EXISTS groups_by_member_count;
DROP VIEW IF EXISTS group_member_counts;
DROP VIEW IF EXISTS group_members_current;
DROP VIEW IF EXISTS group_blacklist_current;
DROP VIEW IF EXISTS groups_current;
