-- Hot page: 48 ranked posts plus counts and a quoted post (and its quote).
-- p47 has the newest block and the coldest heat, so height-only order
-- would disagree with amplify_heat DESC, block_height DESC.
DELETE FROM reactions_current
WHERE account_id IN ('hotfan1.near', 'hotfan2.near', 'hotfan3.near');

DELETE FROM posts_current
WHERE account_id IN ('hotfeed.near', 'hotfeed-src.near');

INSERT INTO posts_current (
  account_id, post_id, value, block_height, block_timestamp,
  parent_path, parent_author, ref_path, ref_author, ref_type, group_id
)
SELECT
  'hotfeed.near',
  'p' || lpad(i::text, 2, '0'),
  '{}',
  CASE WHEN i = 47 THEN 300000 ELSE 100000 - i END,
  CASE WHEN i = 47 THEN 300000 ELSE 100000 - i END,
  '',
  '',
  CASE WHEN i = 0 THEN 'hotfeed-src.near/post/quoted' ELSE '' END,
  CASE WHEN i = 0 THEN 'hotfeed-src.near' ELSE '' END,
  CASE WHEN i = 0 THEN 'quote' ELSE '' END,
  ''
FROM generate_series(0, 47) AS i;

INSERT INTO posts_current (
  account_id, post_id, value, block_height, block_timestamp,
  parent_path, parent_author, ref_path, ref_author, ref_type, group_id
)
VALUES
  ('hotfeed-src.near', 'origin', '{}', 20, 20, '', '', '', '', '', ''),
  (
    'hotfeed-src.near', 'quoted', '{}', 21, 21, '', '',
    'hotfeed-src.near/post/origin', 'hotfeed-src.near', 'quote', ''
  ),
  (
    'hotfeed-src.near', 'quoted-reply', '{}', 22, 22,
    'hotfeed-src.near/post/quoted', 'hotfeed-src.near', '', '', '', ''
  ),
  (
    'hotfeed.near', 'reply-a', '{}', 30, 30,
    'hotfeed.near/post/p00', 'hotfeed.near', '', '', '', ''
  ),
  (
    'hotfeed.near', 'reply-b', '{}', 31, 31,
    'hotfeed.near/post/p00', 'hotfeed.near', '', '', '', ''
  ),
  (
    'hotfeed.near', 'quote-a', '{}', 32, 32, '', '',
    'hotfeed.near/post/p00', 'hotfeed.near', 'quote', ''
  ),
  (
    'hotfeed.near', 'repost-a', '{}', 33, 33, '', '',
    'hotfeed.near/post/p00', 'hotfeed.near', 'repost', ''
  ),
  (
    'hotfeed.near', 'bridge-reply', '{}', 34, 34,
    'hotfeed-src.near/post/origin', 'hotfeed-src.near', '', '', '', ''
  );

INSERT INTO reactions_current (
  account_id, path, post_owner, reaction_kind, operation, block_height
)
VALUES
  (
    'hotfan1.near',
    'hotfan1.near/reaction/hotfeed.near/like/post/p00',
    'hotfeed.near', 'like', 'set', 1
  ),
  (
    'hotfan2.near',
    'hotfan2.near/reaction/hotfeed.near/like/post/p00',
    'hotfeed.near', 'like', 'set', 2
  ),
  (
    'hotfan3.near',
    'hotfan3.near/reaction/hotfeed.near/like/post/p00',
    'hotfeed.near', 'like', 'set', 3
  );

DO $$
BEGIN
  IF to_regclass('public.post_amplify_heat_state') IS NOT NULL THEN
    DELETE FROM post_amplify_heat_state
    WHERE post_path LIKE 'hotfeed.near/%'
       OR post_path LIKE 'hotfeed-src.near/%';
    INSERT INTO post_amplify_heat_state (post_path, heat)
    SELECT
      'hotfeed.near/post/p' || lpad(i::text, 2, '0'),
      CASE WHEN i = 47 THEN 1 ELSE 5000 - i END
    FROM generate_series(0, 47) AS i;
  END IF;
END $$;
