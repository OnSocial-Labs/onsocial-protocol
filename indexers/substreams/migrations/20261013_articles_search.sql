-- Essay index for Discover. Title, excerpt, and author live on the view.
-- The partial index keeps that scan on longform roots.

CREATE INDEX IF NOT EXISTS idx_posts_current_longform_recent
  ON posts_current (block_height DESC, post_id DESC)
  WHERE kind = 'longform'
    AND is_group_content IS NOT TRUE
    AND COALESCE(parent_path, '') = '';

CREATE OR REPLACE VIEW articles_search AS
SELECT
  article.account_id,
  article.post_id,
  article.title,
  NULLIF(article.excerpt, '') AS excerpt,
  LOWER(
    CONCAT_WS(
      ' ',
      article.account_id,
      article.title,
      NULLIF(article.excerpt, '')
    )
  ) AS search_text,
  article.block_height,
  article.block_timestamp
FROM (
  SELECT
    p.account_id,
    p.post_id,
    p.block_height,
    p.block_timestamp,
    btrim(
      COALESCE(p.value::jsonb #>> '{x,onsocial,article,title}', '')
    ) AS title,
    btrim(
      COALESCE(p.value::jsonb #>> '{x,onsocial,article,excerpt}', '')
    ) AS excerpt
  FROM posts_current p
  WHERE p.kind = 'longform'
    AND p.is_group_content IS NOT TRUE
    AND COALESCE(p.parent_path, '') = ''
    AND p.value ~ '^[\{]'
) article
WHERE article.title <> '';
