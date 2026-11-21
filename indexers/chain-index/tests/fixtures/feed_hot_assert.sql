-- Page 1 and page 2 equal posts_feed ordered by amplify_heat, then block_height.
-- The spotlight row on page 1 carries counts and both quote shells.
WITH pages AS (
  SELECT 0 AS off
  UNION ALL
  SELECT 24
),
fn AS (
  SELECT
    p.off,
    string_agg(line, E'\n' ORDER BY n) AS body
  FROM pages p
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
        f.amplify_count::text,
        COALESCE(f.quoted_post->>'postId', ''),
        COALESCE(f.quoted_ref_post->>'postId', ''),
        COALESCE(f.quoted_post->>'replyCount', '')
      ) AS line
    FROM feed_hot(24, p.off) f
  ) ranked
  GROUP BY p.off
),
vw AS (
  SELECT
    p.off,
    string_agg(line, E'\n' ORDER BY n) AS body
  FROM pages p
  CROSS JOIN LATERAL (
    SELECT
      row_number() OVER () AS n,
      concat_ws(
        '|',
        v.account_id,
        v.post_id,
        v.amplify_heat::text,
        v.block_height::text,
        v.reply_count::text,
        v.quote_count::text,
        v.repost_count::text,
        v.reaction_count::text,
        v.amplify_count::text,
        COALESCE(v.quoted_post->>'postId', ''),
        COALESCE(v.quoted_ref_post->>'postId', ''),
        COALESCE(v.quoted_post->>'replyCount', '')
      ) AS line
    FROM (
      SELECT *
      FROM posts_feed
      ORDER BY amplify_heat DESC, block_height DESC
      LIMIT 24 OFFSET p.off
    ) v
  ) ranked
  GROUP BY p.off
),
spotlight AS (
  SELECT concat_ws(
    '|',
    reply_count::text,
    quote_count::text,
    repost_count::text,
    reaction_count::text,
    amplify_count::text,
    quoted_post->>'postId',
    quoted_ref_post->>'postId',
    quoted_post->>'replyCount'
  ) AS body
  FROM feed_hot(24, 0)
  WHERE account_id = 'hotfeed.near'
    AND post_id = 'p00'
),
filters AS (
  SELECT
    (
      SELECT COUNT(*)
      FROM feed_hot(100, 0, NULL, NULL, 'posts')
      WHERE account_id = 'hotfeed.near'
        AND post_id = 'p00'
    ) AS posts_hit,
    (
      SELECT COUNT(*)
      FROM feed_hot(100, 0, NULL, NULL, 'posts')
      WHERE account_id = 'hotfeed.near'
        AND post_id IN ('repost-a', 'reply-a')
    ) AS section_leak,
    (
      SELECT COUNT(*)
      FROM feed_hot(
        100, 0, NULL, NULL, NULL, ARRAY['hotfeed.near']::text[], true
      )
      WHERE account_id = 'hotfeed.near'
        AND post_id = 'bridge-reply'
    ) AS native_leak,
    (
      SELECT COUNT(*)
      FROM feed_hot(
        100, 0, NULL, NULL, NULL, ARRAY['hotfeed.near']::text[], true
      )
      WHERE account_id = 'hotfeed.near'
        AND post_id = 'reply-a'
    ) AS native_keep,
    (
      SELECT COUNT(*)
      FROM feed_hot(100, 0, NULL, 'longform')
    ) AS longform_count,
    (
      SELECT COUNT(*)
      FROM feed_hot(100, 0, NULL, 'longform')
      WHERE account_id = 'hotfeed.near'
        AND post_id = 'p00'
    ) AS longform_hit,
    (
      SELECT COUNT(*)
      FROM feed_hot(100, 0, NULL, 'note')
      WHERE account_id = 'hotfeed.near'
        AND post_id = 'p01'
    ) AS note_hit,
    (
      SELECT COUNT(*)
      FROM feed_hot(100, 0, 'hotfeed-src.near')
      WHERE account_id = 'hotfeed.near'
    ) AS author_leak,
    (
      SELECT COUNT(*)
      FROM feed_hot(100, 0, 'hotfeed-src.near')
      WHERE account_id = 'hotfeed-src.near'
        AND post_id = 'origin'
    ) AS author_hit
)
SELECT CASE
  WHEN (SELECT body FROM fn WHERE off = 0)
       IS NOT DISTINCT FROM (SELECT body FROM vw WHERE off = 0)
   AND (SELECT body FROM fn WHERE off = 24)
       IS NOT DISTINCT FROM (SELECT body FROM vw WHERE off = 24)
   AND (
     -- Real social-spend post_amplify_counts: fixture seeds three boosts on p00.
     (
       EXISTS (
         SELECT 1
         FROM pg_views
         WHERE schemaname = 'public'
           AND viewname = 'post_amplify_counts'
           AND definition ILIKE '%social_spend_events%'
       )
       AND (SELECT body FROM spotlight) = '2|1|1|3|3|quoted|origin|1'
     )
     -- Core stub paints 0 for every row.
     OR (
       NOT EXISTS (
         SELECT 1
         FROM pg_views
         WHERE schemaname = 'public'
           AND viewname = 'post_amplify_counts'
           AND definition ILIKE '%social_spend_events%'
       )
       AND (SELECT body FROM spotlight) = '2|1|1|3|0|quoted|origin|1'
     )
   )
   AND (SELECT posts_hit FROM filters) = 1
   AND (SELECT section_leak FROM filters) = 0
   AND (SELECT native_leak FROM filters) = 0
   AND (SELECT native_keep FROM filters) = 1
   AND (SELECT longform_count FROM filters) = 1
   AND (SELECT longform_hit FROM filters) = 1
   AND (SELECT note_hit FROM filters) = 1
   AND (SELECT author_leak FROM filters) = 0
   AND (SELECT author_hit FROM filters) = 1
  THEN 'ok'
  ELSE concat(
    'bad spotlight=', COALESCE((SELECT body FROM spotlight), 'missing'),
    ' posts=', (SELECT posts_hit FROM filters),
    ' section_leak=', (SELECT section_leak FROM filters),
    ' native_leak=', (SELECT native_leak FROM filters),
    ' native_keep=', (SELECT native_keep FROM filters),
    ' longform_count=', (SELECT longform_count FROM filters),
    ' longform_hit=', (SELECT longform_hit FROM filters),
    ' note_hit=', (SELECT note_hit FROM filters),
    ' author_leak=', (SELECT author_leak FROM filters),
    ' author_hit=', (SELECT author_hit FROM filters),
    E'\nfn0\n', COALESCE((SELECT body FROM fn WHERE off = 0), ''),
    E'\nvw0\n', COALESCE((SELECT body FROM vw WHERE off = 0), '')
  )
END;
