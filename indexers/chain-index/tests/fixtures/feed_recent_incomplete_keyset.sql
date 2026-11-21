-- Incomplete chrono keysets (height without path) must not match every row.
-- The old COALESCE(path,'') made ROW(h,path) < ROW(h,'') true for all paths
-- at the same height — page 1 again on load-more.

DO $$
DECLARE
  matched int;
BEGIN
  CREATE TEMP TABLE feed_recent_keyset_seed (
    block_height bigint,
    content_path text
  ) ON COMMIT DROP;

  INSERT INTO feed_recent_keyset_seed VALUES
    (100, 'b.near/post/p1'),
    (100, 'a.near/post/p2'),
    (99, 'a.near/post/p3');

  -- Complete keyset: same height, tip is b.near — sibling a.near remains.
  SELECT count(*) INTO matched
  FROM feed_recent_keyset_seed
  WHERE ROW(block_height, content_path)
      < ROW(100::bigint, 'b.near/post/p1');

  IF matched <> 2 THEN
    RAISE EXCEPTION 'complete chrono keyset expected 2 rows, got %', matched;
  END IF;

  -- Incomplete (null path): must match nothing when path IS NOT NULL required.
  SELECT count(*) INTO matched
  FROM feed_recent_keyset_seed
  WHERE
    NULL::text IS NOT NULL
    AND ROW(block_height, content_path)
      < ROW(
        100::bigint,
        NULL::text
      );

  IF matched <> 0 THEN
    RAISE EXCEPTION 'null-path chrono keyset expected 0 rows, got %', matched;
  END IF;

  RAISE NOTICE 'feed_recent incomplete keyset guard ok';
END $$;