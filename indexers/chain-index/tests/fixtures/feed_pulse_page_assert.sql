-- Fenced feed_pulse matches the pre-fix function on hot and recent, pages 1 and 2,
-- including peek rows, counts, and both quote shells. Recent ids are fixed.
-- Hot ids are fixed only once amplify heat is the serving state view.
WITH heat_on AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public'
      AND viewname = 'post_amplify_heat'
      AND definition LIKE '%post_amplify_heat_state%'
  ) AS ready
),
cases AS (
  SELECT *
  FROM (
    VALUES
      ('recent', 0),
      ('recent', 4),
      ('hot', 0),
      ('hot', 4)
  ) AS v(sort, off)
),
fn AS (
  SELECT
    c.sort,
    c.off,
    string_agg(line, E'\n' ORDER BY n) AS body,
    string_agg(post_id, E'\n' ORDER BY n) AS ids
  FROM cases c
  CROSS JOIN LATERAL (
    SELECT
      row_number() OVER () AS n,
      f.post_id,
      concat_ws(
        '|',
        f.account_id,
        f.post_id,
        f.amplify_heat::text,
        f.block_height::text,
        f.reply_count::text,
        f.quote_count::text,
        f.repost_count::text,
        f.reaction_count::text,
        COALESCE(f.quoted_post->>'postId', ''),
        COALESCE(f.quoted_ref_post->>'postId', ''),
        COALESCE(f.quoted_post->>'replyCount', '')
      ) AS line
    FROM feed_pulse(
      ARRAY['pulsepage.near']::text[],
      4,
      c.off,
      c.sort
    ) f
  ) ranked
  GROUP BY c.sort, c.off
),
old AS (
  SELECT
    c.sort,
    c.off,
    string_agg(line, E'\n' ORDER BY n) AS body
  FROM cases c
  CROSS JOIN LATERAL (
    SELECT
      row_number() OVER () AS n,
      concat_ws(
        '|',
        f.account_id,
        f.post_id,
        f.amplify_heat::text,
        f.block_height::text,
        f.reply_count::text,
        f.quote_count::text,
        f.repost_count::text,
        f.reaction_count::text,
        COALESCE(f.quoted_post->>'postId', ''),
        COALESCE(f.quoted_ref_post->>'postId', ''),
        COALESCE(f.quoted_post->>'replyCount', '')
      ) AS line
    FROM feed_pulse_unfenced(
      ARRAY['pulsepage.near']::text[],
      4,
      c.off,
      c.sort
    ) f
  ) ranked
  GROUP BY c.sort, c.off
),
spotlight AS (
  SELECT concat_ws(
    '|',
    reply_count::text,
    quote_count::text,
    repost_count::text,
    reaction_count::text,
    quoted_post->>'postId',
    quoted_ref_post->>'postId',
    quoted_post->>'replyCount'
  ) AS body
  FROM feed_pulse(ARRAY['pulsepage.near']::text[], 4, 0, 'recent')
  WHERE account_id = 'pulsepage.near'
    AND post_id = 'n00'
),
expected AS (
  SELECT
    E'n00\nn00a\nsroot\nbrep\nn01\nn01a\nn02' AS recent0,
    E'n03\nn04\nn05\nn06' AS recent4,
    E'n39\nsroot\nbrep\nn02\nn00\nn00a' AS hot0,
    E'n01\nn01a\nn03\nn04\nn05' AS hot4
)
SELECT CASE
  WHEN (
    (SELECT body FROM fn WHERE sort = 'recent' AND off = 0)
      IS NOT DISTINCT FROM
    (SELECT body FROM old WHERE sort = 'recent' AND off = 0)
    AND (SELECT body FROM fn WHERE sort = 'recent' AND off = 4)
      IS NOT DISTINCT FROM
    (SELECT body FROM old WHERE sort = 'recent' AND off = 4)
    AND (SELECT body FROM fn WHERE sort = 'hot' AND off = 0)
      IS NOT DISTINCT FROM
    (SELECT body FROM old WHERE sort = 'hot' AND off = 0)
    AND (SELECT body FROM fn WHERE sort = 'hot' AND off = 4)
      IS NOT DISTINCT FROM
    (SELECT body FROM old WHERE sort = 'hot' AND off = 4)
  )
   AND (SELECT ids FROM fn WHERE sort = 'recent' AND off = 0)
       IS NOT DISTINCT FROM (SELECT recent0 FROM expected)
   AND (SELECT ids FROM fn WHERE sort = 'recent' AND off = 4)
       IS NOT DISTINCT FROM (SELECT recent4 FROM expected)
   AND (
     NOT (SELECT ready FROM heat_on)
     OR (
       (SELECT ids FROM fn WHERE sort = 'hot' AND off = 0)
         IS NOT DISTINCT FROM (SELECT hot0 FROM expected)
       AND (SELECT ids FROM fn WHERE sort = 'hot' AND off = 4)
         IS NOT DISTINCT FROM (SELECT hot4 FROM expected)
     )
   )
   AND (SELECT body FROM spotlight) = '2|1|1|3|quoted|origin|1'
  THEN 'ok'
  ELSE concat(
    'spotlight=', COALESCE((SELECT body FROM spotlight), 'missing'),
    ' heat=', (SELECT ready FROM heat_on),
    E'\nrecent0\n', COALESCE((SELECT ids FROM fn WHERE sort = 'recent' AND off = 0), ''),
    E'\nrecent4\n', COALESCE((SELECT ids FROM fn WHERE sort = 'recent' AND off = 4), ''),
    E'\nhot0\n', COALESCE((SELECT ids FROM fn WHERE sort = 'hot' AND off = 0), ''),
    E'\nhot4\n', COALESCE((SELECT ids FROM fn WHERE sort = 'hot' AND off = 4), ''),
    E'\nfn-recent0\n', COALESCE((SELECT body FROM fn WHERE sort = 'recent' AND off = 0), ''),
    E'\nold-recent0\n', COALESCE((SELECT body FROM old WHERE sort = 'recent' AND off = 0), '')
  )
END;
