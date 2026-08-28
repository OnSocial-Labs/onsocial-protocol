-- Child lands before its parent; cascade must still settle on the root.
DELETE FROM posts_current
WHERE account_id IN ('bob.near', 'dave.near', 'alice.near')
  AND post_id IN ('late_root', 'late_mid', 'late_nested');

INSERT INTO posts_current (account_id, post_id, parent_path, parent_author, group_id)
VALUES
  ('alice.near', 'late_nested', 'dave.near/post/late_mid', 'dave.near', ''),
  ('dave.near', 'late_mid', 'bob.near/post/late_root', 'bob.near', ''),
  ('bob.near', 'late_root', '', '', '');
