CREATE TABLE IF NOT EXISTS developer_notification_rules (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id      TEXT        NOT NULL,
  app_id                TEXT        NOT NULL,
  rule_type             TEXT        NOT NULL CHECK (rule_type IN ('recipient', 'group')),
  recipient_account_id  TEXT,
  group_id              TEXT,
  notification_types    TEXT[],
  active                BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_rules_owner_app
  ON developer_notification_rules(owner_account_id, app_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_notification_rules_recipient
  ON developer_notification_rules(recipient_account_id)
  WHERE recipient_account_id IS NOT NULL AND active = true;

CREATE INDEX IF NOT EXISTS idx_notification_rules_group
  ON developer_notification_rules(group_id)
  WHERE group_id IS NOT NULL AND active = true;

CREATE TABLE IF NOT EXISTS notification_webhook_endpoints (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id  TEXT        NOT NULL,
  app_id            TEXT        NOT NULL,
  url               TEXT        NOT NULL,
  signing_secret    TEXT        NOT NULL,
  active            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_webhook_owner_app
  ON notification_webhook_endpoints(owner_account_id, app_id, created_at ASC);

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id      UUID        NOT NULL REFERENCES notification_webhook_endpoints(id) ON DELETE CASCADE,
  notification_id  UUID        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  status_code      INTEGER,
  success          BOOLEAN     NOT NULL,
  error_message    TEXT,
  delivered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempts_endpoint
  ON notification_delivery_attempts(endpoint_id, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempts_notification
  ON notification_delivery_attempts(notification_id, delivered_at DESC);

COMMENT ON TABLE developer_notification_rules IS 'Routes core social notifications into developer app namespaces.';
COMMENT ON TABLE notification_webhook_endpoints IS 'Outbound developer webhook destinations for managed notifications.';
COMMENT ON TABLE notification_delivery_attempts IS 'Best-effort delivery log for notification webhooks.';