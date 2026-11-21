-- Indexes matching feed_recent / feed_hot ORDER BY on posts_feed_rank.
-- content_path is post_content_path(account_id, post_id, group_id) — inline
-- the same IMMUTABLE expression so this migration does not depend on views.
--
-- CONCURRENTLY: must not run inside the views --single-transaction apply.
-- Deploy builds these before the views txn (see deploy-testnet.yml).
--
-- Interrupted CONCURRENTLY builds leave an INVALID index; IF NOT EXISTS then
-- skips forever. Drop invalid leftovers first (also outside a transaction).

SELECT format('DROP INDEX CONCURRENTLY IF EXISTS %I', c.relname)
FROM pg_class c
JOIN pg_index i ON i.indexrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'idx_posts_current_feed_recent_keyset',
    'idx_posts_current_account_feed_recent_keyset',
    'idx_post_amplify_heat_state_heat_path'
  )
  AND NOT i.indisvalid;
\gexec

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_current_feed_recent_keyset
  ON posts_current (
    block_height DESC,
    (
      CASE
        WHEN group_id IS NOT NULL AND btrim(group_id) <> ''
          THEN account_id || '/groups/' || group_id || '/content/post/' || post_id
        ELSE account_id || '/post/' || post_id
      END
    ) DESC
  );

-- Profile / author chrono pages: account first, then height + path.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_current_account_feed_recent_keyset
  ON posts_current (
    account_id,
    block_height DESC,
    (
      CASE
        WHEN group_id IS NOT NULL AND btrim(group_id) <> ''
          THEN account_id || '/groups/' || group_id || '/content/post/' || post_id
        ELSE account_id || '/post/' || post_id
      END
    ) DESC
  );

-- Hot ranks heat then height/path; heat lives on post_amplify_heat_state.
-- Skip when the table is not installed yet (brand-new bootstrap before views).
SELECT format(
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS %I ON post_amplify_heat_state (heat DESC, post_path DESC)',
  'idx_post_amplify_heat_state_heat_path'
)
WHERE to_regclass('public.post_amplify_heat_state') IS NOT NULL;
\gexec
