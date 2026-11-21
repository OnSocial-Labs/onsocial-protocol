-- Same-block siblings must survive a feed_recent keyset page turn.
-- Height-only cursors skip the rest of the block; height + content_path
-- must return the remaining posts.
--
-- Equal-height page (from #815): three posts at the same height, page size
-- two — page 2 must return the third post.

DO $$
DECLARE
  page1 text;
  page2 text;
BEGIN
  -- Three authors share block 100; content_path DESC: c, b, a.
  CREATE TEMP TABLE feed_recent_keyset_seed (
    account_id text,
    post_id text,
    block_height bigint,
    content_path text
  ) ON COMMIT DROP;

  INSERT INTO feed_recent_keyset_seed VALUES
    ('c.near', 'p1', 100, 'c.near/post/p1'),
    ('b.near', 'p2', 100, 'b.near/post/p2'),
    ('a.near', 'p3', 100, 'a.near/post/p3'),
    ('a.near', 'p4', 99, 'a.near/post/p4');

  -- Page size 2 at equal height: tip order c then b.
  SELECT string_agg(content_path, E'\n' ORDER BY block_height DESC, content_path DESC)
  INTO page1
  FROM (
    SELECT *
    FROM feed_recent_keyset_seed
    ORDER BY block_height DESC, content_path DESC
    LIMIT 2
  ) first;

  IF page1 IS DISTINCT FROM E'c.near/post/p1\nb.near/post/p2' THEN
    RAISE EXCEPTION 'equal-height page1 expected c then b, got %', page1;
  END IF;

  -- Page 2 after composite tip b.near/post/p2 must include a.near/post/p3.
  SELECT string_agg(content_path, E'\n' ORDER BY block_height DESC, content_path DESC)
  INTO page2
  FROM (
    SELECT *
    FROM feed_recent_keyset_seed
    WHERE ROW(block_height, content_path) < ROW(100::bigint, 'b.near/post/p2')
    ORDER BY block_height DESC, content_path DESC
    LIMIT 2
  ) second;

  IF page2 IS DISTINCT FROM E'a.near/post/p3\na.near/post/p4' THEN
    RAISE EXCEPTION 'equal-height page2 after composite keyset diverged: %', page2;
  END IF;

  -- Height-only after page1 tip height would drop both remaining height-100 rows.
  SELECT string_agg(content_path, E'\n' ORDER BY block_height DESC, content_path DESC)
  INTO page2
  FROM feed_recent_keyset_seed
  WHERE block_height < 100;

  IF page2 IS DISTINCT FROM 'a.near/post/p4' THEN
    RAISE EXCEPTION 'height-only control diverged: %', page2;
  END IF;

  RAISE NOTICE 'feed_recent composite keyset equal-height page2 ok';
END $$;
