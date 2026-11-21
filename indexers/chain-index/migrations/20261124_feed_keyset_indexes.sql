-- Indexes matching feed_recent / feed_hot ORDER BY on posts_feed_rank.
-- content_path is post_content_path(account_id, post_id, group_id) — inline
-- the same IMMUTABLE expression so this migration does not depend on views.

CREATE INDEX IF NOT EXISTS idx_posts_current_feed_recent_keyset
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
CREATE INDEX IF NOT EXISTS idx_posts_current_account_feed_recent_keyset
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
CREATE INDEX IF NOT EXISTS idx_post_amplify_heat_state_heat_path
  ON post_amplify_heat_state (heat DESC, post_path DESC);
