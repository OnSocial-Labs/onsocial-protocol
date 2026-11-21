-- Same-block siblings must survive a feed_recent keyset page turn.
-- Height-only cursors skip the rest of the block; height + content_path
-- must return the remaining posts.

DO $$
DECLARE
  page1 text;
  page2 text;
BEGIN
  -- Two authors share block 100; content_path order puts b.near first (DESC).
  CREATE TEMP TABLE feed_recent_keyset_seed (
    account_id text,
    post_id text,
    block_height bigint,
    content_path text
  ) ON COMMIT DROP;

  INSERT INTO feed_recent_keyset_seed VALUES
    ('b.near', 'p1', 100, 'b.near/post/p1'),
    ('a.near', 'p2', 100, 'a.near/post/p2'),
    ('a.near', 'p3', 99, 'a.near/post/p3');

  -- Simulate the ROW comparison feed_recent uses.
  SELECT string_agg(content_path, E'\n' ORDER BY block_height DESC, content_path DESC)
  INTO page1
  FROM (
    SELECT *
    FROM feed_recent_keyset_seed
    ORDER BY block_height DESC, content_path DESC
    LIMIT 1
  ) first;

  IF page1 IS DISTINCT FROM 'b.near/post/p1' THEN
    RAISE EXCEPTION 'page1 tip expected b.near/post/p1, got %', page1;
  END IF;

  SELECT string_agg(content_path, E'\n' ORDER BY block_height DESC, content_path DESC)
  INTO page2
  FROM feed_recent_keyset_seed
  WHERE ROW(block_height, content_path) < ROW(100::bigint, 'b.near/post/p1');

  IF page2 IS DISTINCT FROM E'a.near/post/p2\na.near/post/p3' THEN
    RAISE EXCEPTION 'page2 after composite keyset diverged: %', page2;
  END IF;

  -- Height-only would drop a.near/post/p2 (same block as the tip).
  SELECT string_agg(content_path, E'\n' ORDER BY block_height DESC, content_path DESC)
  INTO page2
  FROM feed_recent_keyset_seed
  WHERE block_height < 100;

  IF page2 IS DISTINCT FROM 'a.near/post/p3' THEN
    RAISE EXCEPTION 'height-only control diverged: %', page2;
  END IF;

  RAISE NOTICE 'feed_recent composite keyset same-block page2 ok';
END $$;
