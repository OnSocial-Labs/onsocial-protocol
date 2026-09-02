-- OnSocial Substreams SQL Schema
-- Used by substreams-sink-sql

CREATE TABLE IF NOT EXISTS data_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  path TEXT,
  value TEXT,
  account_id TEXT,
  data_type TEXT,
  data_id TEXT,
  group_id TEXT,
  group_path TEXT,
  is_group_content BOOLEAN,
  target_account TEXT,
  parent_path TEXT,
  parent_author TEXT,
  parent_type TEXT,
  ref_path TEXT,
  ref_author TEXT,
  ref_type TEXT,
  refs TEXT,
  ref_authors TEXT,
  derived_id TEXT,
  derived_type TEXT,
  writes TEXT,
  extra_data TEXT,
  reaction_kind TEXT,
  channel TEXT,
  kind TEXT,
  audiences TEXT,
  actor_id TEXT,
  payer_id TEXT
);

CREATE TABLE IF NOT EXISTS storage_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  amount TEXT,
  previous_balance TEXT,
  new_balance TEXT,
  pool_id TEXT,
  pool_key TEXT,
  group_id TEXT,
  reason TEXT,
  actor_id TEXT,
  payer_id TEXT,
  target_id TEXT,
  available_balance TEXT,
  donor TEXT,
  payer TEXT,
  previous_pool_balance TEXT,
  new_pool_balance TEXT,
  bytes TEXT,
  remaining_allowance TEXT,
  pool_account TEXT,
  max_bytes TEXT,
  new_shared_bytes TEXT,
  new_used_bytes TEXT,
  pool_available_bytes TEXT,
  used_bytes TEXT,
  extra_data TEXT
);

CREATE TABLE IF NOT EXISTS group_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,

  -- Group identification
  group_id TEXT,

  -- Member fields
  member_id TEXT,
  member_nonce BIGINT,
  member_nonce_path TEXT,
  role TEXT,
  level INTEGER,

  -- Path and value
  path TEXT,
  value TEXT,

  -- Pool fields
  pool_key TEXT,
  amount TEXT,
  previous_pool_balance TEXT,
  new_pool_balance TEXT,

  -- Sponsor quota
  quota_bytes TEXT,
  quota_used TEXT,
  daily_limit TEXT,
  previously_enabled BOOLEAN,

  -- Proposal fields
  proposal_id TEXT,
  proposal_type TEXT,
  status TEXT,
  sequence_number BIGINT,
  title TEXT,
  description TEXT,
  auto_vote BOOLEAN,
  created_at BIGINT,
  locked_member_count INTEGER,
  locked_deposit TEXT,
  expires_at BIGINT,
  tally_path TEXT,
  counter_path TEXT,

  -- Voting fields
  voter TEXT,
  approve BOOLEAN,
  total_votes INTEGER,
  yes_votes INTEGER,
  no_votes INTEGER,
  should_execute BOOLEAN,
  should_reject BOOLEAN,
  voted_at BIGINT,

  -- Voting config
  voting_period BIGINT,
  participation_quorum INTEGER,
  approval_threshold INTEGER,

  -- Permission fields
  permission_key TEXT,
  permission_value TEXT,
  permission_target TEXT,

  -- Create group fields
  name TEXT,
  is_public BOOLEAN,
  creator_role TEXT,
  storage_allocation TEXT,

  -- Full JSON catch-all
  extra_data TEXT
);

CREATE TABLE IF NOT EXISTS contract_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  path TEXT,
  derived_id TEXT,
  derived_type TEXT,
  target_id TEXT,
  actor_id TEXT,
  payer_id TEXT,
  extra_data TEXT
);

CREATE TABLE IF NOT EXISTS permission_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  path TEXT,
  target_id TEXT,
  public_key TEXT,
  level INTEGER,
  expires_at BIGINT,
  value TEXT,
  deleted BOOLEAN,
  derived_id TEXT,
  derived_type TEXT,
  permission_nonce BIGINT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_data_updates_author ON data_updates(author);
CREATE INDEX IF NOT EXISTS idx_data_updates_account_id ON data_updates(account_id);
CREATE INDEX IF NOT EXISTS idx_data_updates_block_height ON data_updates(block_height);
CREATE INDEX IF NOT EXISTS idx_data_updates_data_type ON data_updates(data_type);
CREATE INDEX IF NOT EXISTS idx_data_updates_post_channel ON data_updates(channel) WHERE data_type = 'post' AND channel IS NOT NULL AND channel != '';
CREATE INDEX IF NOT EXISTS idx_data_updates_post_kind ON data_updates(kind) WHERE data_type = 'post' AND kind IS NOT NULL AND kind != '';
CREATE INDEX IF NOT EXISTS idx_data_updates_post_audiences ON data_updates(audiences) WHERE data_type = 'post' AND audiences IS NOT NULL AND audiences != '';

-- JSON object/array values are indexed without changing the raw `value` column.
ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS value_json jsonb
  GENERATED ALWAYS AS (
    CASE WHEN value ~ '^[\[\{]' THEN value::jsonb ELSE NULL END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_data_updates_value_json_gin
  ON data_updates USING gin (value_json jsonb_path_ops)
  WHERE value_json IS NOT NULL;

-- Relative path under apps/<appId>/… for prefix lists (byAppPrefix).
-- NULL unless data_type = 'apps'. Empty string at the app root.
ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS app_relpath TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN data_type = 'apps' AND data_id IS NOT NULL AND data_id <> ''
       AND position(('/apps/' || data_id || '/') in path) > 0
      THEN substring(
        path from
        position(('/apps/' || data_id || '/') in path)
        + char_length('/apps/' || data_id || '/')
      )
      WHEN data_type = 'apps' AND data_id IS NOT NULL AND data_id <> ''
       AND (
         path = split_part(path, '/', 1) || '/apps/' || data_id
         OR path = split_part(path, '/', 1) || '/apps/' || data_id || '/'
       )
      THEN ''
      ELSE NULL
    END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_data_updates_app_relpath
  ON data_updates (data_id, app_relpath text_pattern_ops)
  WHERE data_type = 'apps' AND app_relpath IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_updates_apps_id_block
  ON data_updates (data_id, block_height DESC)
  WHERE data_type = 'apps';

ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE data_updates ADD COLUMN IF NOT EXISTS payer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_data_updates_actor_id ON data_updates(actor_id) WHERE actor_id IS NOT NULL AND actor_id != '';
CREATE INDEX IF NOT EXISTS idx_data_updates_payer_id ON data_updates(payer_id) WHERE payer_id IS NOT NULL AND payer_id != '';

CREATE INDEX IF NOT EXISTS idx_storage_updates_author ON storage_updates(author);
CREATE INDEX IF NOT EXISTS idx_storage_updates_block_height ON storage_updates(block_height);
CREATE INDEX IF NOT EXISTS idx_group_updates_group_id ON group_updates(group_id);
CREATE INDEX IF NOT EXISTS idx_group_updates_author ON group_updates(author);
CREATE INDEX IF NOT EXISTS idx_group_updates_operation ON group_updates(operation);
CREATE INDEX IF NOT EXISTS idx_group_updates_proposal_id ON group_updates(proposal_id);
CREATE INDEX IF NOT EXISTS idx_group_updates_sequence_number ON group_updates(sequence_number);
CREATE INDEX IF NOT EXISTS idx_group_updates_status ON group_updates(status);
CREATE INDEX IF NOT EXISTS idx_group_updates_voter ON group_updates(voter);
CREATE INDEX IF NOT EXISTS idx_group_updates_block_height ON group_updates(block_height);
CREATE INDEX IF NOT EXISTS idx_permission_updates_author ON permission_updates(author);

-- Sink-maintained current social state (upsert from core_db_out; data_updates stays append-only).
-- Live DBs may still have these as VIEWs: CREATE TABLE IF NOT EXISTS would skip and
-- CREATE INDEX would fail — drop views first (CASCADE; dependent views reapplied after).
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
  root_path TEXT NOT NULL DEFAULT '',
  root_author TEXT NOT NULL DEFAULT '',
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
ALTER TABLE posts_current ADD COLUMN IF NOT EXISTS root_path TEXT NOT NULL DEFAULT '';
ALTER TABLE posts_current ADD COLUMN IF NOT EXISTS root_author TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_posts_current_root
  ON posts_current(root_path)
  WHERE root_path IS NOT NULL AND root_path != '';

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
