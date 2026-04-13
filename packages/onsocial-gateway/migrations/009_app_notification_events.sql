CREATE TABLE IF NOT EXISTS app_notification_events (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence             BIGSERIAL   NOT NULL,
  owner_account_id     TEXT        NOT NULL,
  app_id               TEXT        NOT NULL,
  recipient            TEXT        NOT NULL,
  actor                TEXT        NOT NULL,
  event_type           TEXT        NOT NULL,
  dedupe_key           TEXT        NOT NULL,
  object_id            TEXT,
  group_id             TEXT,
  source_contract      TEXT        NOT NULL DEFAULT 'app',
  source_receipt_id    TEXT,
  source_block_height  BIGINT,
  context              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_notification_events_sequence
  ON app_notification_events(sequence);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_notification_events_dedupe
  ON app_notification_events(owner_account_id, app_id, recipient, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_app_notification_events_owner_app_sequence
  ON app_notification_events(owner_account_id, app_id, sequence ASC);

CREATE INDEX IF NOT EXISTS idx_app_notification_events_owner_app_event_type
  ON app_notification_events(owner_account_id, app_id, event_type, created_at DESC);

INSERT INTO notification_cursors (source_table)
VALUES ('app_notification_events')
ON CONFLICT (source_table) DO NOTHING;

COMMENT ON TABLE app_notification_events IS 'Developer-defined app events queued for managed notification fanout.';
COMMENT ON COLUMN app_notification_events.dedupe_key IS 'Developer-supplied idempotency key scoped by owner, app, and recipient.';
COMMENT ON COLUMN app_notification_events.context IS 'Developer-defined event payload forwarded in notification context.';