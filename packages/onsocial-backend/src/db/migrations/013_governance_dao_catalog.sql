-- Factory-backed Sputnik DAO discovery catalog (separate from membership).

CREATE TABLE IF NOT EXISTS governance_dao_catalog (
  dao_account_id TEXT PRIMARY KEY,
  factory_account_id TEXT NOT NULL DEFAULT '',
  network TEXT NOT NULL,
  source TEXT NOT NULL,
  name TEXT,
  purpose TEXT,
  metadata TEXT,
  factory_index BIGINT,
  config_synced_at TIMESTAMPTZ,
  listed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_dao_catalog_listed
  ON governance_dao_catalog (listed_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_dao_catalog_account_lower
  ON governance_dao_catalog (lower(dao_account_id) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_governance_dao_catalog_name_lower
  ON governance_dao_catalog (lower(coalesce(name, '')) text_pattern_ops);

CREATE TABLE IF NOT EXISTS governance_dao_factory_sync (
  factory_account_id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  last_number_daos BIGINT NOT NULL DEFAULT 0,
  last_from_index BIGINT NOT NULL DEFAULT 0,
  last_full_scan_at TIMESTAMPTZ,
  last_incremental_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'idle'
);
