-- Same-block siblings must survive a feed_recent keyset page turn.
-- Height-only cursors skip the rest of the block; height + content_path
-- must return the remaining posts.
--
-- Equal-height page (from #815): three posts at the same height, page size
-- two — page 2 must return the third post. Calls feed_recent() itself.

DELETE FROM posts_current
WHERE account_id IN (
  'eqheight-c.near',
  'eqheight-b.near',
  'eqheight-a.near'
);

INSERT INTO posts_current (
  account_id, post_id, value, block_height, block_timestamp,
  parent_path, parent_author, ref_path, ref_author, ref_type, group_id, kind
)
VALUES
  ('eqheight-c.near', 'p1', '{}', 100, 100, '', '', '', '', '', '', ''),
  ('eqheight-b.near', 'p2', '{}', 100, 100, '', '', '', '', '', '', ''),
  ('eqheight-a.near', 'p3', '{}', 100, 100, '', '', '', '', '', '', ''),
  ('eqheight-a.near', 'p4', '{}', 99, 99, '', '', '', '', '', '', '');

DO $$
DECLARE
  page1 text;
  page2 text;
  accounts text[] := ARRAY[
    'eqheight-c.near',
    'eqheight-b.near',
    'eqheight-a.near'
  ];
BEGIN
  -- Page size 2 at equal height: tip order c then b (content_path DESC).
  SELECT string_agg(
    account_id || '/post/' || post_id,
    E'\n'
    ORDER BY block_height DESC, content_path DESC
  )
  INTO page1
  FROM feed_recent(
    2, 0, NULL, NULL, NULL, accounts, false, NULL, NULL, NULL, NULL
  );

  IF page1 IS DISTINCT FROM E'eqheight-c.near/post/p1\neqheight-b.near/post/p2' THEN
    RAISE EXCEPTION 'equal-height page1 via feed_recent expected c then b, got %', page1;
  END IF;

  -- Page 2 after composite tip b must include a/p3 (same height sibling).
  SELECT string_agg(
    account_id || '/post/' || post_id,
    E'\n'
    ORDER BY block_height DESC, content_path DESC
  )
  INTO page2
  FROM feed_recent(
    2, 0, NULL, NULL, NULL, accounts, false, NULL, NULL,
    100::bigint,
    'eqheight-b.near/post/p2'
  );

  IF page2 IS DISTINCT FROM E'eqheight-a.near/post/p3\neqheight-a.near/post/p4' THEN
    RAISE EXCEPTION 'equal-height page2 via feed_recent diverged: %', page2;
  END IF;

  -- Height-only control: after height 100 alone would drop p3.
  SELECT string_agg(
    account_id || '/post/' || post_id,
    E'\n'
    ORDER BY block_height DESC, content_path DESC
  )
  INTO page2
  FROM posts_feed_rank
  WHERE account_id = ANY (accounts)
    AND block_height < 100;

  IF page2 IS DISTINCT FROM 'eqheight-a.near/post/p4' THEN
    RAISE EXCEPTION 'height-only control diverged: %', page2;
  END IF;

  RAISE NOTICE 'feed_recent composite keyset equal-height page2 ok';
END $$;
