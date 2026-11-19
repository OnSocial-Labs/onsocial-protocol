-- Count-aggregate loops for the fenced page, the pre-fix function, and the
-- direct posts_feed reads (profile, global recent, hydrate-by-ids).
-- Ranking still joins profile_search, whose GroupAggregate runs once per
-- circle post. Those are not the reply/quote/repost/reaction counts.
-- Only a bare Aggregate node is a count lateral.
CREATE OR REPLACE FUNCTION feed_pulse_page_plan_loops(query text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  line text;
  loops integer;
  max_loops integer := 0;
  seen boolean := false;
BEGIN
  FOR line IN EXECUTE 'EXPLAIN (ANALYZE, FORMAT TEXT) ' || query
  LOOP
    IF line ~ '(^|[^A-Za-z])Aggregate '
       AND position('loops=' IN line) > 0 THEN
      seen := true;
      loops := substring(line FROM 'loops=([0-9]+)')::integer;
      IF loops > max_loops THEN
        max_loops := loops;
      END IF;
    END IF;
  END LOOP;
  IF NOT seen THEN
    RAISE EXCEPTION 'plan has no count Aggregate for %', query;
  END IF;
  RETURN max_loops;
END;
$$;

DO $$
DECLARE
  fenced integer;
  unfenced integer;
  direct integer;
  shape text;
BEGIN
  fenced := feed_pulse_page_plan_loops(
    $q$SELECT * FROM feed_pulse(ARRAY['pulsepage.near']::text[], 4, 0, 'recent')$q$
  );
  IF fenced > 4 THEN
    RAISE EXCEPTION 'feed_pulse count aggregate loops=% (page is 4)', fenced;
  END IF;
  RAISE NOTICE 'feed_pulse count aggregate max loops=%', fenced;

  unfenced := feed_pulse_page_plan_loops(
    $q$SELECT * FROM feed_pulse_unfenced(ARRAY['pulsepage.near']::text[], 4, 0, 'recent')$q$
  );
  IF unfenced <= 4 THEN
    RAISE EXCEPTION
      'unfenced feed_pulse plan loops=% did not exceed the page (4)',
      unfenced;
  END IF;
  RAISE NOTICE 'feed_pulse unfenced count aggregate max loops=%', unfenced;

  -- Author and account-list pages go through feed_recent. The view ordered
  -- by block_height for one author still counts every post of that author.
  IF (
    SELECT string_agg(post_id, E'\n' ORDER BY n)
    FROM (
      SELECT post_id, row_number() OVER () AS n
      FROM feed_recent(4, 0, 'pulsepage.near')
    ) got
  ) IS DISTINCT FROM (
    SELECT string_agg(post_id, E'\n' ORDER BY block_height DESC)
    FROM (
      SELECT post_id, block_height
      FROM posts_feed
      WHERE account_id = 'pulsepage.near'
      ORDER BY block_height DESC
      LIMIT 4
    ) want
  ) THEN
    RAISE EXCEPTION 'feed_recent author page diverged from posts_feed';
  END IF;
  IF (
    SELECT string_agg(post_id, E'\n' ORDER BY n)
    FROM (
      SELECT post_id, row_number() OVER () AS n
      FROM feed_recent(4, 0, 'pulsepage.near', NULL, 'posts')
    ) got
  ) IS DISTINCT FROM 'n00' || E'\n' || 'n01' || E'\n' || 'n02' || E'\n' || 'n03'
  THEN
    RAISE EXCEPTION 'feed_recent posts section diverged';
  END IF;
  fenced := feed_pulse_page_plan_loops(
    $q$SELECT * FROM feed_recent(4, 0, 'pulsepage.near')$q$
  );
  IF fenced > 4 THEN
    RAISE EXCEPTION 'feed_recent count aggregate loops=% (page is 4)', fenced;
  END IF;
  RAISE NOTICE 'feed_recent count aggregate max loops=%', fenced;

  -- Global chrono uses the block_height index, so the limit stops the
  -- count laterals. Hydrate-by-ids is a primary-key filter, so the laterals
  -- run only for the matched rows. An author-ordered posts_feed read does
  -- not; that page is feed_recent.
  FOREACH shape IN ARRAY ARRAY[
    $q$SELECT * FROM posts_feed ORDER BY block_height DESC LIMIT 4$q$,
    $q$SELECT * FROM posts_feed WHERE account_id = 'pulsepage.near' AND post_id IN ('n00', 'n01', 'n02', 'n03')$q$
  ]
  LOOP
    direct := feed_pulse_page_plan_loops(shape);
    RAISE NOTICE 'posts_feed direct max loops=% :: %', direct, shape;
    IF direct > 4 THEN
      RAISE EXCEPTION
        'posts_feed direct read ran counts past the page (%): %',
        direct,
        shape;
    END IF;
  END LOOP;
END $$;

DROP FUNCTION feed_pulse_page_plan_loops(text);
