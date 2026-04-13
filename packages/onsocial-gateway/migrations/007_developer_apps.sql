CREATE TABLE IF NOT EXISTS developer_apps (
  app_id            TEXT        PRIMARY KEY,
  owner_account_id  TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_developer_apps_owner
  ON developer_apps(owner_account_id, created_at ASC);

COMMENT ON TABLE developer_apps IS 'Developer-owned app namespaces used for notification scoping and product tenancy.';
COMMENT ON COLUMN developer_apps.app_id IS 'Stable developer-chosen application namespace.';
COMMENT ON COLUMN developer_apps.owner_account_id IS 'Developer account that owns this app namespace.';