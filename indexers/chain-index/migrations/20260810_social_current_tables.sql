-- Materialize posts_current / reactions_current / saves_current as sink-upserted
-- tables (scarces-style). data_updates stays append-only.
-- Dependent views (posts_feed, reaction_counts, …) are recreated by
-- core_schema_views.sql + leaderboard_schema_views.sql after migrations.

-- Fresh installs create these as tables in combined/core_schema first.
-- Upgrades may still have the old LIVE VIEWS — drop those only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'posts_current'
  ) THEN
    EXECUTE 'DROP VIEW public.posts_current CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'reactions_current'
  ) THEN
    EXECUTE 'DROP VIEW public.reactions_current CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'saves_current'
  ) THEN
    EXECUTE 'DROP VIEW public.saves_current CASCADE';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS posts_current (
  account_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  value TEXT,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  parent_path TEXT,
  parent_author TEXT,
  parent_type TEXT,
  ref_path TEXT,
  ref_author TEXT,
  ref_type TEXT,
  channel TEXT,
  kind TEXT,
  audiences TEXT,
  group_id TEXT,
  is_group_content BOOLEAN,
  PRIMARY KEY (account_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_posts_current_block ON posts_current(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_posts_current_group ON posts_current(group_id) WHERE group_id IS NOT NULL AND group_id != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_group_feed
  ON posts_current (group_id, is_group_content, block_height DESC)
  WHERE group_id IS NOT NULL AND group_id != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_group_channel
  ON posts_current (group_id, channel, is_group_content, block_height DESC)
  WHERE group_id IS NOT NULL AND group_id != '' AND channel IS NOT NULL AND channel != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_parent ON posts_current(parent_path) WHERE parent_path IS NOT NULL AND parent_path != '';
CREATE INDEX IF NOT EXISTS idx_posts_current_ref ON posts_current(ref_path) WHERE ref_path IS NOT NULL AND ref_path != '';

CREATE TABLE IF NOT EXISTS reactions_current (
  account_id TEXT NOT NULL,
  path TEXT NOT NULL,
  post_owner TEXT,
  reaction_kind TEXT,
  value TEXT,
  block_height BIGINT,
  block_timestamp BIGINT,
  operation TEXT,
  PRIMARY KEY (account_id, path)
);
CREATE INDEX IF NOT EXISTS idx_reactions_current_owner_kind ON reactions_current(post_owner, reaction_kind) WHERE operation = 'set';
CREATE INDEX IF NOT EXISTS idx_reactions_current_block ON reactions_current(block_height DESC);

CREATE TABLE IF NOT EXISTS saves_current (
  account_id TEXT NOT NULL,
  content_path TEXT NOT NULL,
  value TEXT,
  block_height BIGINT,
  block_timestamp BIGINT,
  operation TEXT,
  PRIMARY KEY (account_id, content_path)
);
CREATE INDEX IF NOT EXISTS idx_saves_current_block ON saves_current(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_saves_current_path ON saves_current(content_path);

-- Backfill from append-only history (same DISTINCT ON logic as the old views).
INSERT INTO posts_current (
  account_id, post_id, value, block_height, block_timestamp, receipt_id,
  parent_path, parent_author, parent_type, ref_path, ref_author, ref_type,
  channel, kind, audiences, group_id, is_group_content
)
SELECT
  account_id,
  data_id AS post_id,
  value,
  block_height,
  block_timestamp,
  receipt_id,
  parent_path,
  parent_author,
  parent_type,
  ref_path,
  ref_author,
  ref_type,
  channel,
  kind,
  audiences,
  group_id,
  is_group_content
FROM (
  SELECT DISTINCT ON (account_id, data_id)
    account_id,
    data_id,
    value,
    block_height,
    block_timestamp,
    receipt_id,
    parent_path,
    parent_author,
    parent_type,
    ref_path,
    ref_author,
    ref_type,
    channel,
    kind,
    audiences,
    group_id,
    is_group_content,
    operation,
    id
  FROM data_updates
  WHERE data_type = 'post'
  ORDER BY account_id, data_id, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
) latest
WHERE operation = 'set'
ON CONFLICT (account_id, post_id) DO NOTHING;

INSERT INTO reactions_current (
  account_id, path, post_owner, reaction_kind, value,
  block_height, block_timestamp, operation
)
SELECT
  account_id,
  path,
  target_account AS post_owner,
  reaction_kind,
  value,
  block_height,
  block_timestamp,
  operation
FROM (
  SELECT DISTINCT ON (account_id, path)
    account_id,
    target_account,
    reaction_kind,
    path,
    value,
    block_height,
    block_timestamp,
    operation
  FROM data_updates
  WHERE data_type = 'reaction'
  ORDER BY account_id, path, block_height DESC, block_timestamp DESC, receipt_id DESC, id DESC
) latest
ON CONFLICT (account_id, path) DO NOTHING;

INSERT INTO saves_current (
  account_id, content_path, value, block_height, block_timestamp, operation
)
SELECT
  account_id,
  content_path,
  value,
  block_height,
  block_timestamp,
  operation
FROM (
  SELECT DISTINCT ON (account_id, content_path)
    account_id,
    COALESCE(
      SUBSTRING(path FROM '^[^/]+/saved/(.+)$'),
      SUBSTRING(path FROM '^saved/(.+)$'),
      path
    ) AS content_path,
    value,
    block_height,
    block_timestamp,
    operation
  FROM data_updates
  WHERE data_type = 'saved'
  ORDER BY
    account_id,
    COALESCE(
      SUBSTRING(path FROM '^[^/]+/saved/(.+)$'),
      SUBSTRING(path FROM '^saved/(.+)$'),
      path
    ),
    block_height DESC,
    block_timestamp DESC,
    receipt_id DESC,
    id DESC
) latest
ON CONFLICT (account_id, content_path) DO NOTHING;
