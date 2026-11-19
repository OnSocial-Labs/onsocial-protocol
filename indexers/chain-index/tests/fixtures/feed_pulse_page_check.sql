-- Pulse page: 40 circle roots, self-reply peeks, one bridge, and a quoted post.
-- Recent order follows event height. Hot order follows amplify heat, so the
-- two sorts disagree. n39 is cold in time and hottest in heat.
-- feed_pulse_unfenced is the pre-fix body (plain posts_feed joins) so the
-- page can be compared before and after, and so its plan still counts every
-- post.

DELETE FROM reactions_current
WHERE account_id IN (
  'pulsepage-fan1.near',
  'pulsepage-fan2.near',
  'pulsepage-fan3.near'
);

DELETE FROM posts_current
WHERE account_id IN (
  'pulsepage.near',
  'pulsepage-stranger.near',
  'pulsepage-src.near',
  'pulsepage-fan.near'
);

INSERT INTO posts_current (
  account_id, post_id, value, block_height, block_timestamp,
  parent_path, parent_author, ref_path, ref_author, ref_type, group_id
)
VALUES
  (
    'pulsepage-src.near', 'origin', '{}', 20, 20,
    '', '', '', '', '', ''
  ),
  (
    'pulsepage-src.near', 'quoted', '{}', 21, 21,
    '', '',
    'pulsepage-src.near/post/origin', 'pulsepage-src.near', 'quote', ''
  ),
  (
    'pulsepage-src.near', 'quoted-reply', '{}', 22, 22,
    'pulsepage-src.near/post/quoted', 'pulsepage-src.near',
    '', '', '', ''
  ),
  (
    'pulsepage-stranger.near', 'sroot', '{}', 10, 10,
    '', '', '', '', '', ''
  );

INSERT INTO posts_current (
  account_id, post_id, value, block_height, block_timestamp,
  parent_path, parent_author, ref_path, ref_author, ref_type, group_id
)
SELECT
  'pulsepage.near',
  'n' || lpad(i::text, 2, '0'),
  '{}',
  2000 - i,
  2000 - i,
  '',
  '',
  CASE WHEN i = 0 THEN 'pulsepage-src.near/post/quoted' ELSE '' END,
  CASE WHEN i = 0 THEN 'pulsepage-src.near' ELSE '' END,
  CASE WHEN i = 0 THEN 'quote' ELSE '' END,
  ''
FROM generate_series(0, 39) AS i;

INSERT INTO posts_current (
  account_id, post_id, value, block_height, block_timestamp,
  parent_path, parent_author, ref_path, ref_author, ref_type, group_id
)
VALUES
  (
    'pulsepage.near', 'n00a', '{}', 2100, 2100,
    'pulsepage.near/post/n00', 'pulsepage.near', '', '', '', ''
  ),
  (
    'pulsepage.near', 'n00b', '{}', 2090, 2090,
    'pulsepage.near/post/n00', 'pulsepage.near', '', '', '', ''
  ),
  (
    'pulsepage.near', 'n01a', '{}', 2050, 2050,
    'pulsepage.near/post/n01', 'pulsepage.near', '', '', '', ''
  ),
  (
    'pulsepage.near', 'brep', '{}', 2080, 2080,
    'pulsepage-stranger.near/post/sroot', 'pulsepage-stranger.near',
    '', '', '', ''
  ),
  (
    'pulsepage-fan.near', 'quote-a', '{}', 30, 30,
    '', '',
    'pulsepage.near/post/n00', 'pulsepage.near', 'quote', ''
  ),
  (
    'pulsepage-fan.near', 'repost-a', '{}', 31, 31,
    '', '',
    'pulsepage.near/post/n00', 'pulsepage.near', 'repost', ''
  );

INSERT INTO reactions_current (
  account_id, path, post_owner, reaction_kind, operation, block_height
)
VALUES
  (
    'pulsepage-fan1.near',
    'pulsepage-fan1.near/reaction/pulsepage.near/like/post/n00',
    'pulsepage.near', 'like', 'set', 1
  ),
  (
    'pulsepage-fan2.near',
    'pulsepage-fan2.near/reaction/pulsepage.near/like/post/n00',
    'pulsepage.near', 'like', 'set', 2
  ),
  (
    'pulsepage-fan3.near',
    'pulsepage-fan3.near/reaction/pulsepage.near/like/post/n00',
    'pulsepage.near', 'like', 'set', 3
  );

DO $$
BEGIN
  IF to_regclass('public.post_amplify_heat_state') IS NOT NULL THEN
    DELETE FROM post_amplify_heat_state
    WHERE post_path LIKE 'pulsepage.near/%'
       OR post_path LIKE 'pulsepage-stranger.near/%'
       OR post_path LIKE 'pulsepage-src.near/%'
       OR post_path LIKE 'pulsepage-fan.near/%';
    INSERT INTO post_amplify_heat_state (post_path, heat) VALUES
      ('pulsepage.near/post/n39', 9000),
      ('pulsepage.near/post/brep', 8000),
      ('pulsepage.near/post/n02', 7000),
      ('pulsepage.near/post/n00a', 6000),
      ('pulsepage.near/post/n00', 1);
  END IF;
END $$;

DROP FUNCTION IF EXISTS feed_pulse_unfenced(text[], integer, integer, text);
-- Pre-fix feed_pulse: plain posts_feed joins, page not materialized.
CREATE OR REPLACE FUNCTION feed_pulse_unfenced(
  accounts text[],
  card_limit integer,
  card_offset integer,
  sort text DEFAULT 'recent'
)
RETURNS SETOF posts_feed
LANGUAGE sql
STABLE
AS $$
  WITH circle AS (
    SELECT DISTINCT btrim(a) AS account_id
    FROM unnest(COALESCE(accounts, ARRAY[]::text[])) AS a
    WHERE a IS NOT NULL AND btrim(a) <> ''
  ),
  native_roots AS (
    SELECT p.*
    FROM posts_feed_rank p
    JOIN circle c ON c.account_id = p.account_id
    WHERE p.parent_path IS NULL
      OR btrim(p.parent_path) = ''
  ),
  native_circle_replies AS (
    SELECT
      r.*,
      parsed.account_id AS card_account_id,
      parsed.post_id AS card_post_id
    FROM (
      SELECT
        p.*,
        COALESCE(
          NULLIF(btrim(p.root_path), ''),
          NULLIF(btrim(p.parent_path), '')
        ) AS card_path,
        COALESCE(p.amplify_heat, 0) AS reply_heat,
        COALESCE(p.block_height, 0) AS reply_height
      FROM posts_feed_rank p
      JOIN circle c ON c.account_id = p.account_id
      WHERE p.parent_path IS NOT NULL
        AND btrim(p.parent_path) <> ''
        AND EXISTS (
          SELECT 1 FROM circle parent WHERE parent.account_id = p.parent_author
        )
    ) r
    JOIN LATERAL parse_post_content_path(r.card_path) parsed
      ON parsed.account_id IS NOT NULL
     AND parsed.post_id IS NOT NULL
  ),
  best_self AS (
    SELECT DISTINCT ON (card_account_id, card_post_id)
      card_account_id,
      card_post_id,
      account_id,
      post_id,
      reply_heat,
      reply_height
    FROM native_circle_replies
    ORDER BY
      card_account_id,
      card_post_id,
      CASE WHEN sort = 'hot' THEN reply_heat ELSE 0 END DESC,
      reply_height DESC
  ),
  native AS (
    SELECT
      p.*,
      posts_current_own_path(p.account_id, p.post_id, p.group_id) AS event_key,
      -- Hot: a cold reply must not hide a boost on the post.
      GREATEST(COALESCE(p.amplify_heat, 0), COALESCE(s.reply_heat, 0)) AS event_heat,
      GREATEST(COALESCE(p.block_height, 0), COALESCE(s.reply_height, 0)) AS event_height,
      0 AS event_kind,
      s.account_id AS peek_account_id,
      s.post_id AS peek_post_id
    FROM native_roots p
    LEFT JOIN best_self s
      ON s.card_account_id = p.account_id
     AND s.card_post_id = p.post_id
    UNION ALL
    SELECT
      p.*,
      r.card_path AS event_key,
      r.reply_heat AS event_heat,
      r.reply_height AS event_height,
      0 AS event_kind,
      NULL::text AS peek_account_id,
      NULL::text AS peek_post_id
    FROM native_circle_replies r
    JOIN posts_feed_rank p
      ON p.account_id = r.account_id
     AND p.post_id = r.post_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM native_roots roots
      WHERE roots.account_id = r.card_account_id
        AND roots.post_id = r.card_post_id
    )
  ),
  bridge_replies AS (
    SELECT
      r.*,
      parsed.account_id AS card_account_id,
      parsed.post_id AS card_post_id
    FROM (
      SELECT
        p.*,
        COALESCE(
          NULLIF(btrim(p.root_path), ''),
          NULLIF(btrim(p.parent_path), '')
        ) AS card_path,
        COALESCE(p.amplify_heat, 0) AS reply_heat,
        COALESCE(p.block_height, 0) AS reply_height
      FROM posts_feed_rank p
      JOIN circle c ON c.account_id = p.account_id
      WHERE p.parent_path IS NOT NULL
        AND btrim(p.parent_path) <> ''
        AND p.parent_author IS NOT NULL
        AND btrim(p.parent_author) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM circle parent WHERE parent.account_id = p.parent_author
        )
    ) r
    JOIN LATERAL parse_post_content_path(r.card_path) parsed
      ON parsed.account_id IS NOT NULL
     AND parsed.post_id IS NOT NULL
  ),
  best_bridge AS (
    SELECT DISTINCT ON (card_account_id, card_post_id)
      card_account_id,
      card_post_id,
      account_id,
      post_id,
      reply_heat,
      reply_height
    FROM bridge_replies
    ORDER BY
      card_account_id,
      card_post_id,
      CASE WHEN sort = 'hot' THEN reply_heat ELSE 0 END DESC,
      reply_height DESC
  ),
  bridge_events AS (
    SELECT
      root.*,
      posts_current_own_path(root.account_id, root.post_id, root.group_id)
        AS event_key,
      b.reply_heat AS event_heat,
      b.reply_height AS event_height,
      1 AS event_kind,
      b.account_id AS peek_account_id,
      b.post_id AS peek_post_id
    FROM best_bridge b
    JOIN posts_feed_rank root
      ON root.account_id = b.card_account_id
     AND root.post_id = b.card_post_id
    WHERE NOT EXISTS (
      SELECT 1 FROM native n
      WHERE n.account_id = root.account_id
        AND n.post_id = root.post_id
    )
  ),
  events AS (
    SELECT
      event_key,
      event_heat,
      event_height,
      event_kind,
      account_id,
      post_id,
      group_id,
      peek_account_id,
      peek_post_id
    FROM native
    UNION ALL
    SELECT
      event_key,
      event_heat,
      event_height,
      event_kind,
      account_id,
      post_id,
      group_id,
      peek_account_id,
      peek_post_id
    FROM bridge_events
  ),
  ranked AS (
    SELECT
      e.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN sort = 'hot' THEN e.event_heat ELSE 0 END DESC,
          e.event_height DESC,
          e.event_key
      ) AS rn
    FROM events e
  ),
  page AS (
    SELECT *
    FROM ranked
    WHERE rn > GREATEST(COALESCE(card_offset, 0), 0)
      AND rn <= GREATEST(COALESCE(card_offset, 0), 0)
        + GREATEST(COALESCE(card_limit, 0), 0)
  ),
  out_rows AS (
    SELECT
      pg.rn,
      1 AS role,
      p.*
    FROM page pg
    JOIN posts_feed p
      ON p.account_id = pg.account_id
     AND p.post_id = pg.post_id
    WHERE pg.event_kind = 0
    UNION ALL
    SELECT
      pg.rn,
      1 AS role,
      p.*
    FROM page pg
    JOIN posts_feed p
      ON p.account_id = pg.account_id
     AND p.post_id = pg.post_id
    WHERE pg.event_kind = 1
    UNION ALL
    SELECT
      pg.rn,
      2 AS role,
      p.*
    FROM page pg
    JOIN posts_feed p
      ON p.account_id = pg.peek_account_id
     AND p.post_id = pg.peek_post_id
    WHERE pg.peek_account_id IS NOT NULL
  )
  SELECT
    account_id,
    post_id,
    value,
    block_height,
    block_timestamp,
    receipt_id,
    parent_path,
    parent_author,
    parent_type,
    ref_path,
    ref_author,
    ref_type,
    channel,
    kind,
    audiences,
    group_id,
    is_group_content,
    author_name,
    author_avatar,
    group_name,
    amplify_heat,
    root_path,
    root_author,
    content_path,
    reply_count,
    quote_count,
    repost_count,
    reaction_count,
    quoted_post,
    quoted_ref_post
  FROM out_rows
  ORDER BY rn, role;
$$;
