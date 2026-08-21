-- Web Push subscriptions for first-party Activity (PWA).
-- Auth'd gateway API scopes reads/writes to the JWT / API-key account.
-- Delivery fans out from AFTER INSERT on notifications via NOTIFY.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id   TEXT        NOT NULL,
  endpoint           TEXT        NOT NULL,
  p256dh             TEXT        NOT NULL,
  auth               TEXT        NOT NULL,
  user_agent         TEXT,
  enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_account_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner_enabled
  ON push_subscriptions(owner_account_id)
  WHERE enabled = TRUE;

COMMENT ON TABLE push_subscriptions IS
  'Browser Web Push endpoints per account (PWA Activity alerts).';
COMMENT ON COLUMN push_subscriptions.owner_account_id IS
  'Account that owns the subscription (recipient of Activity).';
COMMENT ON COLUMN push_subscriptions.endpoint IS
  'Push service endpoint URL from PushSubscription.endpoint.';
COMMENT ON COLUMN push_subscriptions.p256dh IS
  'PushSubscription.getKey(p256dh) as base64url.';
COMMENT ON COLUMN push_subscriptions.auth IS
  'PushSubscription.getKey(auth) as base64url.';

-- Wake the notification worker to deliver Web Push for every new row,
-- including DM and DAO writers that bypass the worker insert helper.
CREATE OR REPLACE FUNCTION notify_notification_push() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('notification_push', NEW.id::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notifications_push_notify ON notifications;
CREATE TRIGGER notifications_push_notify
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_notification_push();
