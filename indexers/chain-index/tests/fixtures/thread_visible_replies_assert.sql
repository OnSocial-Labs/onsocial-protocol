SELECT reply_id
FROM thread_visible_replies(ARRAY[
  'dave.near/post/vis_dave',
  'eve.near/post/vis_eve',
  'frank.near/post/vis_frank'
]::text[])
ORDER BY parent_path;
