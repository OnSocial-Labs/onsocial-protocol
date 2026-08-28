-- Nested reply must inherit the conversation root, not the mid-thread parent.
DELETE FROM posts_current
WHERE account_id IN ('bob.near', 'dave.near', 'alice.near')
  AND post_id IN (
    'root', 'mid', 'nested', 'hello',
    'late_root', 'late_mid', 'late_nested'
  );

INSERT INTO posts_current (account_id, post_id, parent_path, parent_author, group_id)
VALUES
  ('bob.near', 'root', '', '', ''),
  ('dave.near', 'mid', 'bob.near/post/root', 'bob.near', ''),
  ('alice.near', 'nested', 'dave.near/post/mid', 'dave.near', '');
