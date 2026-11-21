-- feed_recent: incomplete chrono keysets must not COALESCE(path,'') (height-only skip).

CREATE OR REPLACE FUNCTION feed_recent(
  row_limit integer,
  row_offset integer,
  author text DEFAULT NULL,
  kind text DEFAULT NULL,
  section text DEFAULT NULL,
  accounts text[] DEFAULT NULL,
  native_only boolean DEFAULT false,
  channel text DEFAULT NULL,
  audience_like text DEFAULT NULL,
  before_block_height bigint DEFAULT NULL,
  before_post_key text DEFAULT NULL
)
RETURNS SETOF posts_feed
LANGUAGE sql
STABLE
AS $$
  WITH page AS MATERIALIZED (
    SELECT
      p.account_id,
      p.post_id
    FROM posts_feed_rank p
    WHERE (
        feed_recent.author IS NULL
        OR btrim(feed_recent.author) = ''
        OR p.account_id = feed_recent.author
      )
      AND (
        feed_recent.kind IS NULL
        OR btrim(feed_recent.kind) = ''
        OR p.kind = feed_recent.kind
      )
      AND (
        feed_recent.section IS NULL
        OR btrim(feed_recent.section) = ''
        OR (
          feed_recent.section = 'posts'
          AND p.parent_path = ''
          AND p.ref_type <> 'repost'
        )
        OR (
          feed_recent.section = 'replies'
          AND p.parent_path <> ''
        )
        OR (
          feed_recent.section = 'reposts'
          AND p.ref_type = 'repost'
        )
      )
      AND (
        feed_recent.accounts IS NULL
        OR p.account_id = ANY (feed_recent.accounts)
      )
      AND (
        NOT COALESCE(feed_recent.native_only, false)
        OR p.parent_path = ''
        OR p.parent_author = ANY (COALESCE(feed_recent.accounts, ARRAY[]::text[]))
      )
      AND (
        feed_recent.channel IS NULL
        OR btrim(feed_recent.channel) = ''
        OR p.channel = feed_recent.channel
      )
      AND (
        feed_recent.audience_like IS NULL
        OR btrim(feed_recent.audience_like) = ''
        OR p.audiences LIKE feed_recent.audience_like
      )
      AND (
        feed_recent.before_block_height IS NULL
        OR (
          feed_recent.before_post_key IS NOT NULL
          AND btrim(feed_recent.before_post_key) <> ''
          AND ROW(
            p.block_height,
            p.content_path
          ) < ROW(
            feed_recent.before_block_height,
            feed_recent.before_post_key
          )
        )
      )
    ORDER BY p.block_height DESC, p.content_path DESC
    LIMIT GREATEST(COALESCE(feed_recent.row_limit, 0), 0)
    OFFSET CASE
      WHEN feed_recent.before_block_height IS NOT NULL THEN 0
      ELSE GREATEST(COALESCE(feed_recent.row_offset, 0), 0)
    END
  )
  SELECT f.*
  FROM page pg
  JOIN LATERAL (
    SELECT *
    FROM posts_feed f
    WHERE f.account_id = pg.account_id
      AND f.post_id = pg.post_id
    OFFSET 0
  ) f ON true
  ORDER BY f.block_height DESC, f.content_path DESC;
$$;