-- Quote vs repost split + repost_counts.
-- Source of truth: core_schema_views.sql (reapplied on sink deploy).
--
-- Migrations run before *_schema_views.sql on fresh installs, so skip when
-- posts_current is not present yet.

DO $$
BEGIN
  IF to_regclass('public.posts_current') IS NULL THEN
    RAISE NOTICE 'skip quote/repost view migration (posts_current not ready yet)';
    RETURN;
  END IF;

  EXECUTE $v$
    CREATE OR REPLACE VIEW quotes AS
    SELECT
      account_id     AS quote_author,
      post_id        AS quote_id,
      ref_author,
      ref_path,
      ref_type,
      value,
      block_height,
      block_timestamp,
      group_id
    FROM posts_current
    WHERE ref_author IS NOT NULL
      AND ref_author != ''
      AND lower(coalesce(nullif(trim(ref_type), ''), 'quote')) = 'quote'
  $v$;

  EXECUTE $v$
    CREATE OR REPLACE VIEW reposts AS
    SELECT
      account_id     AS repost_author,
      post_id        AS repost_id,
      ref_author,
      ref_path,
      ref_type,
      value,
      block_height,
      block_timestamp,
      group_id
    FROM posts_current
    WHERE ref_author IS NOT NULL
      AND ref_author != ''
      AND lower(trim(ref_type)) = 'repost'
  $v$;

  EXECUTE $v$
    CREATE OR REPLACE VIEW quote_counts AS
    SELECT
      ref_author,
      ref_path,
      COUNT(*)          AS quote_count,
      MAX(block_height) AS last_quote_block
    FROM quotes
    GROUP BY ref_author, ref_path
  $v$;

  EXECUTE $v$
    CREATE OR REPLACE VIEW repost_counts AS
    SELECT
      ref_author,
      ref_path,
      COUNT(*)          AS repost_count,
      MAX(block_height) AS last_repost_block
    FROM reposts
    GROUP BY ref_author, ref_path
  $v$;
END $$;
