-- feed_hot / feed_pulse keyset: missing heat must not coalesce to +Infinity
-- (that replays page 1). Function bodies live in core_schema_views.sql —
-- this migration is a no-op marker so deploy order stays explicit after the
-- chrono composite keyset land.
SELECT 1;
