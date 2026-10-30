-- Visible line under a direct reply: the thread owner's reply wins,
-- otherwise the branch author's own continuation. A stranger's reply does not.
DELETE FROM posts_current
WHERE post_id IN (
  'vis_root',
  'vis_dave',
  'vis_carol',
  'vis_bob',
  'vis_dave_self',
  'vis_eve',
  'vis_eve_self',
  'vis_frank',
  'vis_frank_carol'
);

INSERT INTO posts_current (
  account_id, post_id, parent_path, parent_author, group_id, block_height
)
VALUES
  ('bob.near', 'vis_root', '', '', '', 1),
  ('dave.near', 'vis_dave', 'bob.near/post/vis_root', 'bob.near', '', 2),
  ('eve.near', 'vis_eve', 'bob.near/post/vis_root', 'bob.near', '', 3),
  ('frank.near', 'vis_frank', 'bob.near/post/vis_root', 'bob.near', '', 4),
  ('carol.near', 'vis_carol', 'dave.near/post/vis_dave', 'dave.near', '', 30),
  ('dave.near', 'vis_dave_self', 'dave.near/post/vis_dave', 'dave.near', '', 40),
  ('bob.near', 'vis_bob', 'dave.near/post/vis_dave', 'dave.near', '', 50),
  ('eve.near', 'vis_eve_self', 'eve.near/post/vis_eve', 'eve.near', '', 60),
  ('carol.near', 'vis_frank_carol', 'frank.near/post/vis_frank', 'frank.near', '', 70);
