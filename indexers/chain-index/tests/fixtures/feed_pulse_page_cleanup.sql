DELETE FROM reactions_current
WHERE account_id IN (
  'pulsepage-fan1.near',
  'pulsepage-fan2.near',
  'pulsepage-fan3.near'
);

DELETE FROM posts_current
WHERE account_id IN (
  'pulsepage.near',
  'pulsepage-stranger.near',
  'pulsepage-src.near',
  'pulsepage-fan.near'
);

DO $$
BEGIN
  IF to_regclass('public.post_amplify_heat_state') IS NOT NULL THEN
    DELETE FROM post_amplify_heat_state
    WHERE post_path LIKE 'pulsepage.near/%'
       OR post_path LIKE 'pulsepage-stranger.near/%'
       OR post_path LIKE 'pulsepage-src.near/%'
       OR post_path LIKE 'pulsepage-fan.near/%';
  END IF;
END $$;

DROP FUNCTION IF EXISTS feed_pulse_unfenced(text[], integer, integer, text);
