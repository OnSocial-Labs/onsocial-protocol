-- Cached DAO proposal snapshots for the public governance feed and detail views.
-- Populated by the backend sync worker; terminal rows are write-mostly-once.

CREATE TABLE IF NOT EXISTS governance_dao_proposal_snapshots (
  dao_account_id TEXT NOT NULL,
  proposal_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  submission_time TEXT NOT NULL DEFAULT '',
  submission_block_height BIGINT,
  resolved_block_height BIGINT,
  resolved_at TEXT,
  proposal_snapshot JSONB NOT NULL,
  policy_snapshot JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dao_account_id, proposal_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_dao_proposals_dao
  ON governance_dao_proposal_snapshots (dao_account_id);

CREATE INDEX IF NOT EXISTS idx_governance_dao_proposals_status
  ON governance_dao_proposal_snapshots (dao_account_id, status);
