-- Indexed proposer lookup for protocol identity marks (Governance / Treasury).

ALTER TABLE governance_dao_proposal_snapshots
  ADD COLUMN IF NOT EXISTS proposer_account_id TEXT
  GENERATED ALWAYS AS (
    NULLIF(lower(trim(proposal_snapshot->>'proposer')), '')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_governance_dao_proposals_proposer
  ON governance_dao_proposal_snapshots (proposer_account_id, dao_account_id)
  WHERE proposer_account_id IS NOT NULL;
