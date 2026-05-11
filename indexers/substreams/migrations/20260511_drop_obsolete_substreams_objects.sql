-- One-time cleanup for databases created by earlier substreams schemas.
-- Current contracts and sinks use core actor_id/payer_id and scarces has no executor field.

ALTER TABLE IF EXISTS data_updates DROP COLUMN IF EXISTS auth_type;
ALTER TABLE IF EXISTS storage_updates DROP COLUMN IF EXISTS auth_type;
ALTER TABLE IF EXISTS contract_updates DROP COLUMN IF EXISTS auth_type;
ALTER TABLE IF EXISTS scarces_events DROP COLUMN IF EXISTS executor;

DROP FUNCTION IF EXISTS refresh_core_views();
DROP FUNCTION IF EXISTS refresh_leaderboard_views();