-- Amplify heat write-through.
-- New boost_post inserts add undecayed heat immediately. The 5-minute
-- gateway job replaces this table from post_amplify_heat_live (decay).
-- Safe to run before social_spend views exist: seed and the serving-view
-- switch wait until post_amplify_heat_live is present.

CREATE TABLE IF NOT EXISTS post_amplify_heat_state (
  post_path TEXT PRIMARY KEY,
  heat DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_amplify_heat_state_heat
  ON post_amplify_heat_state (heat DESC);

CREATE OR REPLACE FUNCTION refresh_post_amplify_heat()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  LOCK TABLE post_amplify_heat_state IN EXCLUSIVE MODE;
  INSERT INTO post_amplify_heat_state (post_path, heat)
  SELECT post_path, heat
  FROM post_amplify_heat_live
  ON CONFLICT (post_path) DO UPDATE
    SET heat = EXCLUDED.heat;
  DELETE FROM post_amplify_heat_state AS state
  WHERE NOT EXISTS (
    SELECT 1
    FROM post_amplify_heat_live AS live
    WHERE live.post_path = state.post_path
  );
END;
$$;

CREATE OR REPLACE FUNCTION apply_post_amplify_heat_delta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  social numeric;
  is_repeat boolean;
  unique_factor double precision;
  self_factor double precision;
  delta double precision;
BEGIN
  IF NEW.success IS NOT TRUE
     OR NEW.event_type IS DISTINCT FROM 'SOCIAL_SPENT'
     OR NEW.action IS DISTINCT FROM 'boost_post'
     OR NEW.target_type IS DISTINCT FROM 'post'
     OR NEW.target_id IS NULL
     OR btrim(NEW.target_id) = ''
     OR NEW.spender_id IS NULL
     OR btrim(NEW.spender_id) = ''
     OR NEW.amount IS NULL
     OR NEW.amount !~ '^[0-9]+$'
  THEN
    RETURN NEW;
  END IF;

  social := NEW.amount::numeric / 1000000000000000000::numeric;
  IF social <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM social_spend_events AS prior
    WHERE prior.success = true
      AND prior.event_type = 'SOCIAL_SPENT'
      AND prior.action = 'boost_post'
      AND prior.target_type = 'post'
      AND prior.target_id = NEW.target_id
      AND lower(trim(prior.spender_id)) = lower(trim(NEW.spender_id))
      AND prior.block_timestamp > (
        (EXTRACT(EPOCH FROM NOW()) * 1000000000)::bigint
        - (14::bigint * 24 * 3600 * 1000000000)
      )
      AND (prior.block_timestamp, prior.id)
        < (NEW.block_timestamp, NEW.id)
  ) INTO is_repeat;

  unique_factor := CASE WHEN is_repeat THEN 0.25 ELSE 1.0 END;
  self_factor := CASE
    WHEN NEW.recipient_id IS NOT NULL
     AND lower(trim(NEW.spender_id)) = lower(trim(NEW.recipient_id))
      THEN 0.25
    ELSE 1.0
  END;
  delta := (LN(1 + social) / LN(2))::double precision
    * unique_factor
    * self_factor;
  IF delta <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO post_amplify_heat_state (post_path, heat)
  VALUES (NEW.target_id, delta)
  ON CONFLICT (post_path) DO UPDATE
    SET heat = post_amplify_heat_state.heat + EXCLUDED.heat;

  RETURN NEW;
END;
$$;

-- Backfill only when the formula view is already installed. A fresh
-- schema apply creates that view later and seeds there. Databases without
-- the spend table (schema slices) skip the trigger entirely.
DO $$
BEGIN
  IF to_regclass('public.social_spend_events') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $idx$
    CREATE INDEX IF NOT EXISTS idx_social_spend_events_boost_post
      ON social_spend_events (
        target_id,
        lower(trim(spender_id)),
        block_timestamp,
        id
      )
      WHERE success = true
        AND event_type = 'SOCIAL_SPENT'
        AND action = 'boost_post'
        AND target_type = 'post'
  $idx$;

  DROP TRIGGER IF EXISTS trg_post_amplify_heat_delta ON social_spend_events;
  CREATE TRIGGER trg_post_amplify_heat_delta
    AFTER INSERT ON social_spend_events
    FOR EACH ROW
    EXECUTE FUNCTION apply_post_amplify_heat_delta();

  IF to_regclass('public.post_amplify_heat_live') IS NULL THEN
    RETURN;
  END IF;

  PERFORM refresh_post_amplify_heat();

  EXECUTE
    'CREATE OR REPLACE VIEW post_amplify_heat AS
     SELECT post_path, heat FROM post_amplify_heat_state';
END;
$$;
