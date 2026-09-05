-- Newest-first sale / mint peeks read scarces_events by type + op + height.
-- Without this, Moving "Just sold" walks type_op then sorts.
CREATE INDEX IF NOT EXISTS idx_scarces_events_type_op_block
  ON scarces_events(event_type, operation, block_height DESC);
