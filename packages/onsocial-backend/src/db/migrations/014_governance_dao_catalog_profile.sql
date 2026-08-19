-- Cached OnSocial profile presence for Discover empty-browse ranking.
-- Populated by syncDaoCatalogProfileFlags from indexer profile_search.

ALTER TABLE governance_dao_catalog
  ADD COLUMN IF NOT EXISTS has_onsocial_profile BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE governance_dao_catalog
  ADD COLUMN IF NOT EXISTS profile_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_governance_dao_catalog_browse_rank
  ON governance_dao_catalog (
    has_onsocial_profile DESC,
    listed_at DESC,
    dao_account_id ASC
  );
