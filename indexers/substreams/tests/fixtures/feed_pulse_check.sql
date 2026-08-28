-- Pulse cards: Alice native + nested reply into Bob's thread.
DELETE FROM posts_current
WHERE account_id IN ('bob.near', 'dave.near', 'alice.near')
  AND post_id IN (
    'root', 'mid', 'nested', 'hello',
    'late_root', 'late_mid', 'late_nested'
  );

INSERT INTO posts_current (
  account_id, post_id, parent_path, parent_author, group_id, block_height
)
VALUES
  ('bob.near', 'root', '', '', '', 10),
  ('dave.near', 'mid', 'bob.near/post/root', 'bob.near', '', 20),
  ('alice.near', 'hello', '', '', '', 15),
  ('alice.near', 'nested', 'dave.near/post/mid', 'dave.near', '', 40);
