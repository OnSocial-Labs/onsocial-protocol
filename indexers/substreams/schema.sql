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
  donor TEXT,
  payer TEXT
);

CREATE TABLE IF NOT EXISTS group_updates (
  id TEXT PRIMARY KEY,
  block_height BIGINT,
  block_timestamp BIGINT,
  receipt_id TEXT,
  operation TEXT,
  author TEXT,
  partition_id INTEGER,
  group_id TEXT,
  member_id TEXT,
  role TEXT,
  level INTEGER,
  path TEXT,
  value TEXT,
  proposal_id TEXT,
  proposal_type TEXT,
  status TEXT,
  description TEXT,
  voter TEXT,
  approve BOOLEAN,
  total_votes INTEGER,
  yes_votes INTEGER,
  no_votes INTEGER
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
  payer_id TEXT
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
  account_id TEXT,
  permission_type TEXT,
  target_path TEXT,
  permission_key TEXT,
  granted BOOLEAN,
  value TEXT
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
CREATE INDEX IF NOT EXISTS idx_permission_updates_author ON permission_updates(author);
