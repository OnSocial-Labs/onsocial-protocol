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
  writes TEXT
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
  auth_type TEXT,
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
  auth_type TEXT,
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
