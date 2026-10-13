DELETE FROM posts_current WHERE account_id = 'articles-index.testnet';

INSERT INTO posts_current (
  account_id, post_id, value, kind, is_group_content, parent_path,
  block_height, block_timestamp
) VALUES
  (
    'articles-index.testnet',
    'night',
    '{"text":"A river.","x":{"onsocial":{"article":{"title":"Night drive","excerpt":"Lisbon"}}}}',
    'longform',
    false,
    '',
    42,
    42
  ),
  (
    'articles-index.testnet',
    'chat',
    '{"text":"Night drive"}',
    'post',
    false,
    '',
    43,
    43
  );
