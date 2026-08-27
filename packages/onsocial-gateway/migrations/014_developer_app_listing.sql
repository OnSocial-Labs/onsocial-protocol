-- Public community-board listing on a developer app namespace.
ALTER TABLE developer_apps
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS icon_url TEXT,
  ADD COLUMN IF NOT EXISTS href TEXT,
  ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_developer_apps_listed
  ON developer_apps(listed, created_at ASC)
  WHERE listed = TRUE;

COMMENT ON COLUMN developer_apps.name IS 'Public board label.';
COMMENT ON COLUMN developer_apps.icon_url IS 'Public https icon URL.';
COMMENT ON COLUMN developer_apps.href IS 'Public https website for the dapp.';
COMMENT ON COLUMN developer_apps.listed IS 'When true, the app appears on the community launcher board.';
