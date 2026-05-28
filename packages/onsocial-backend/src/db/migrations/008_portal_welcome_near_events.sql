-- =============================================================================
-- Portal welcome NEAR drip events (one per account, ever)
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_welcome_near_events (
  id              BIGSERIAL     PRIMARY KEY,
  account_id      TEXT          NOT NULL UNIQUE,
  amount_yocto    TEXT          NOT NULL,
  network         TEXT          NOT NULL,
  public_key      TEXT          NOT NULL,
  transfer_tx_hash TEXT,
  status          TEXT          NOT NULL DEFAULT 'pending',
  error           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_welcome_near_events_created_at
  ON portal_welcome_near_events (created_at DESC);
