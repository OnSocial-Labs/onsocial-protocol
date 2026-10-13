SELECT title || '|' || COALESCE(excerpt, '')
FROM articles_search
WHERE account_id = 'articles-index.testnet' AND post_id = 'night';

SELECT COUNT(*)::text
FROM articles_search
WHERE account_id = 'articles-index.testnet' AND post_id = 'chat';
