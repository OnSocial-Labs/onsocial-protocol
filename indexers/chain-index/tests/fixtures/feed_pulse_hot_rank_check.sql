-- A cold reply must not outrank a boost on the post itself.
DELETE FROM post_amplify_heat_state
WHERE post_path IN (
  'alice.heat/post/boosted',
  'alice.heat/post/note',
  'carol.heat/post/fresh'
);

DELETE FROM posts_current
WHERE account_id IN ('alice.heat', 'carol.heat')
  AND post_id IN ('boosted', 'note', 'fresh');

INSERT INTO posts_current (
  account_id, post_id, parent_path, parent_author, group_id, block_height
)
VALUES
  ('alice.heat', 'boosted', '', '', '', 10),
  ('alice.heat', 'note', 'alice.heat/post/boosted', 'alice.heat', '', 11),
  ('carol.heat', 'fresh', '', '', '', 100);

INSERT INTO post_amplify_heat_state (post_path, heat) VALUES
  ('alice.heat/post/boosted', 20),
  ('carol.heat/post/fresh', 1);
