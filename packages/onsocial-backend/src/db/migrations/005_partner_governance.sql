ALTER TABLE partner_keys
  ADD COLUMN IF NOT EXISTS governance_proposal_id BIGINT,
  ADD COLUMN IF NOT EXISTS governance_proposal_status TEXT,
  ADD COLUMN IF NOT EXISTS governance_proposal_description TEXT,
  ADD COLUMN IF NOT EXISTS governance_proposal_dao TEXT,
  ADD COLUMN IF NOT EXISTS governance_proposal_payload JSONB,
  ADD COLUMN IF NOT EXISTS governance_proposal_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS governance_proposal_submitted_at TIMESTAMPTZ;