-- Managed notifications storage for paid developer tiers.
-- These tables are internal/admin-only. The gateway exposes a stable API on top.

CREATE TABLE IF NOT EXISTS notifications (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id     TEXT        NOT NULL,
  app_id               TEXT        NOT NULL DEFAULT 'default',
  recipient            TEXT        NOT NULL,
  actor                TEXT        NOT NULL,
  notification_type    TEXT        NOT NULL,
  source_contract      TEXT        NOT NULL,
  source_receipt_id    TEXT,
  source_block_height  BIGINT,
  dedupe_key           TEXT        NOT NULL,
  context              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  read                 BOOLEAN     NOT NULL DEFAULT false,
  read_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS owner_account_id TEXT,
  ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE notifications
SET owner_account_id = COALESCE(owner_account_id, recipient)
WHERE owner_account_id IS NULL;

UPDATE notifications
SET dedupe_key = COALESCE(
  dedupe_key,
  CONCAT(
    COALESCE(source_contract, 'unknown'),
    ':',
    COALESCE(source_receipt_id, id::text),
    ':',
    notification_type,
    ':',
    recipient
  )
)
WHERE dedupe_key IS NULL;

ALTER TABLE notifications
  ALTER COLUMN owner_account_id SET NOT NULL,
  ALTER COLUMN dedupe_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications(owner_account_id, app_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_notifications_owner_recipient_unread
  ON notifications(owner_account_id, app_id, recipient, created_at DESC)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_owner_recipient_all
  ON notifications(owner_account_id, app_id, recipient, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_owner_type
  ON notifications(owner_account_id, app_id, notification_type, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_counts (
  owner_account_id  TEXT    NOT NULL,
  app_id            TEXT    NOT NULL DEFAULT 'default',
  account_id        TEXT    NOT NULL,
  unread_count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_account_id, app_id, account_id)
);

ALTER TABLE notification_counts
  ADD COLUMN IF NOT EXISTS owner_account_id TEXT,
  ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT 'default';

UPDATE notification_counts
SET owner_account_id = COALESCE(owner_account_id, account_id)
WHERE owner_account_id IS NULL;

ALTER TABLE notification_counts
  ALTER COLUMN owner_account_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS notification_cursors (
  source_table       TEXT        PRIMARY KEY,
  last_block_height  BIGINT      NOT NULL DEFAULT 0,
  last_processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO notification_cursors (source_table) VALUES
  ('data_updates'),
  ('group_updates'),
  ('rewards_events'),
  ('boost_events'),
  ('scarces_events')
ON CONFLICT (source_table) DO NOTHING;

CREATE OR REPLACE FUNCTION update_notification_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notification_counts (owner_account_id, app_id, account_id, unread_count)
    VALUES (NEW.owner_account_id, NEW.app_id, NEW.recipient, 1)
    ON CONFLICT (owner_account_id, app_id, account_id) DO UPDATE
      SET unread_count = notification_counts.unread_count + 1;
  ELSIF TG_OP = 'UPDATE' AND OLD.read = false AND NEW.read = true THEN
    UPDATE notification_counts
    SET unread_count = GREATEST(unread_count - 1, 0)
    WHERE owner_account_id = NEW.owner_account_id
      AND app_id = NEW.app_id
      AND account_id = NEW.recipient;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_count ON notifications;
CREATE TRIGGER trg_notification_count
  AFTER INSERT OR UPDATE OF read ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_notification_count();

CREATE OR REPLACE FUNCTION mark_notifications_read(
  p_owner_account_id TEXT,
  p_app_id TEXT,
  p_recipient TEXT
) RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE notifications
  SET read = true, read_at = NOW()
  WHERE owner_account_id = p_owner_account_id
    AND app_id = p_app_id
    AND recipient = p_recipient
    AND read = false;
  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE notification_counts
  SET unread_count = 0
  WHERE owner_account_id = p_owner_account_id
    AND app_id = p_app_id
    AND account_id = p_recipient;

  RETURN affected;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE notifications IS 'Managed per-app notifications derived from indexed events.';
COMMENT ON COLUMN notifications.owner_account_id IS 'Developer account that owns this notification namespace.';
COMMENT ON COLUMN notifications.app_id IS 'Developer-defined app namespace used for tenant scoping.';
COMMENT ON COLUMN notifications.dedupe_key IS 'Stable idempotency key preventing duplicate notifications.';
COMMENT ON TABLE notification_counts IS 'Unread notification count cache keyed by developer app and recipient.';
COMMENT ON TABLE notification_cursors IS 'Worker checkpoint state for notification fanout.';