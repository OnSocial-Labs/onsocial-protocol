-- =============================================================================
-- Season settlement snapshots and claim proofs
-- =============================================================================

CREATE TABLE IF NOT EXISTS season_settlements (
  season_id                 TEXT          PRIMARY KEY,
  status                    TEXT          NOT NULL DEFAULT 'finalized',
  root                      TEXT          NOT NULL,
  total_amount              TEXT          NOT NULL,
  indexed_pool_amount       TEXT          NOT NULL,
  participant_count         INTEGER       NOT NULL DEFAULT 0,
  reward_count              INTEGER       NOT NULL DEFAULT 0,
  snapshot                  JSONB         NOT NULL,
  active                    BOOLEAN       NOT NULL DEFAULT true,
  published_tx_hash         TEXT,
  published_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS season_settlement_claims (
  season_id                 TEXT          NOT NULL REFERENCES season_settlements(season_id) ON DELETE CASCADE,
  account_id                TEXT          NOT NULL,
  rank                      INTEGER       NOT NULL,
  score                     INTEGER       NOT NULL,
  amount                    TEXT          NOT NULL,
  proof                     JSONB         NOT NULL DEFAULT '[]'::jsonb,
  standing                  JSONB         NOT NULL,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_season_settlement_claims_rank
  ON season_settlement_claims (season_id, rank);
