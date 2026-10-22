-- Guild member-count rollups for Discover browse / peeks.
-- View source of truth: core_schema_views.sql (reapplied on sink deploy).
--
-- Migrations run before *_schema_views.sql on fresh installs, so skip when
-- group_members_current / groups_current are not present yet. Upgrade DBs that
-- already have those views get the new ranks here; fresh installs get them
-- from core_schema_views.sql.

DO $$
BEGIN
  IF to_regclass('public.group_members_current') IS NULL
     OR to_regclass('public.groups_current') IS NULL THEN
    RAISE NOTICE 'skip group_member_counts migration (group views not ready yet)';
    RETURN;
  END IF;

  EXECUTE $v$
    CREATE OR REPLACE VIEW group_member_counts AS
    SELECT
      group_id,
      COUNT(*)::BIGINT AS member_count
    FROM group_members_current
    GROUP BY group_id
  $v$;

  EXECUTE $v$
    CREATE OR REPLACE VIEW groups_by_member_count AS
    SELECT
      g.group_id,
      g.owner_id,
      g.group_name,
      g.is_public,
      g.creator_role,
      g.storage_allocation,
      g.block_height,
      g.block_timestamp,
      g.operation,
      g.group_description,
      g.group_banner_cid,
      g.group_badge_cid,
      g.is_member_driven,
      g.group_topics,
      COALESCE(c.member_count, 0)::BIGINT AS member_count
    FROM groups_current g
    LEFT JOIN group_member_counts c ON c.group_id = g.group_id
  $v$;
END $$;
