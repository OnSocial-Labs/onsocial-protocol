DELETE FROM post_amplify_heat_state
WHERE post_path IN (
  'alice.heat/post/boosted',
  'alice.heat/post/note',
  'carol.heat/post/fresh'
);

DELETE FROM posts_current
WHERE account_id IN ('alice.heat', 'carol.heat')
  AND post_id IN ('boosted', 'note', 'fresh');
