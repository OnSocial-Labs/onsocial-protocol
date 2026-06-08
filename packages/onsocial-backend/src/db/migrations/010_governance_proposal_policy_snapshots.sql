-- Immutable vote-time DAO policy captured when a proposal reaches a terminal status.
-- Survives RPC garbage collection so resolved cards keep accurate X/Y vote rules.

CREATE TABLE IF NOT EXISTS governance_proposal_policy_snapshots (
  dao_account_id TEXT NOT NULL,
  proposal_id BIGINT NOT NULL,
  submission_block_height BIGINT NOT NULL,
  policy_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dao_account_id, proposal_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_policy_snapshots_dao
  ON governance_proposal_policy_snapshots (dao_account_id);
