-- Current Group-role membership derived from live get_policy.
-- Replaced wholesale per dao_account_id on each policy membership sync.

CREATE TABLE IF NOT EXISTS governance_dao_memberships (
  account_id TEXT NOT NULL,
  dao_account_id TEXT NOT NULL,
  role_names TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, dao_account_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_dao_memberships_account
  ON governance_dao_memberships (account_id);

CREATE INDEX IF NOT EXISTS idx_governance_dao_memberships_dao
  ON governance_dao_memberships (dao_account_id);

CREATE TABLE IF NOT EXISTS governance_dao_policy_sync (
  dao_account_id TEXT PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  role_count INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0
);
