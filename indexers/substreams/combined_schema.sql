-- =============================================================================
-- OnSocial Combined Schema — All Contracts
-- =============================================================================
-- Apply once to the shared Postgres database. Each substreams-sink-sql
-- process writes to its own tables; this file simply aggregates them.
--
-- Usage:  psql "$DATABASE_URL" -f combined_schema.sql
-- =============================================================================

-- ===================== CORE-ONSOCIAL =====================
\i core_schema.sql

-- ===================== STAKING-ONSOCIAL ==================
\i staking_schema.sql

-- ===================== TOKEN-ONSOCIAL ====================
\i token_schema.sql
