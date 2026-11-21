-- Incomplete Hot keysets (height without heat/key) must not match every row.
-- The old COALESCE(heat, Infinity) made ROW(heat,h,path) < ROW(Inf,h,'') true
-- for all finite heats — page 1 again on load-more.

DO $$
DECLARE
  matched int;
BEGIN
  CREATE TEMP TABLE feed_hot_keyset_seed (
    amplify_heat double precision,
    block_height bigint,
    content_path text
  ) ON COMMIT DROP;

  INSERT INTO feed_hot_keyset_seed VALUES
    (10, 100, 'b.near/post/p1'),
    (10, 100, 'a.near/post/p2'),
    (5, 99, 'a.near/post/p3');

  -- Complete keyset: same heat + height, tip is b.near — sibling a.near remains.
  SELECT count(*) INTO matched
  FROM feed_hot_keyset_seed
  WHERE ROW(amplify_heat, block_height, content_path)
      < ROW(10::double precision, 100::bigint, 'b.near/post/p1');

  IF matched <> 2 THEN
    RAISE EXCEPTION 'complete hot keyset expected 2 rows, got %', matched;
  END IF;

  -- Incomplete (null heat): must match nothing when we require heat IS NOT NULL.
  SELECT count(*) INTO matched
  FROM feed_hot_keyset_seed
  WHERE
    NULL::double precision IS NOT NULL
    AND ROW(amplify_heat, block_height, content_path)
      < ROW(
        NULL::double precision,
        100::bigint,
        'b.near/post/p1'
      );

  IF matched <> 0 THEN
    RAISE EXCEPTION 'null-heat hot keyset expected 0 rows, got %', matched;
  END IF;

  RAISE NOTICE 'feed_hot incomplete keyset guard ok';
END $$;
