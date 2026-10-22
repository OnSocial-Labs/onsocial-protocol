-- Live Influence needs lock expiry without a new contract event.
-- Same 30-day month as contracts/boost-onsocial MONTH_NS:
--   30 * 24 * 60 * 60 * 1e9 = 2592000000000000
ALTER TABLE booster_state
  ADD COLUMN IF NOT EXISTS unlock_at BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('public.boost_events') IS NULL THEN
    RETURN;
  END IF;

  UPDATE booster_state AS bs
  SET unlock_at = src.unlock_at
  FROM (
    SELECT DISTINCT ON (account_id)
      account_id,
      CASE
        WHEN event_type = 'BOOST_UNLOCK' THEN 0
        WHEN event_type = 'BOOST_EXTEND' THEN
          block_timestamp + COALESCE(new_months, 0) * 2592000000000000
        ELSE
          block_timestamp + COALESCE(months, 0) * 2592000000000000
      END AS unlock_at
    FROM boost_events
    WHERE success = true
      AND event_type IN ('BOOST_LOCK', 'BOOST_EXTEND', 'BOOST_UNLOCK')
    ORDER BY
      account_id,
      block_height DESC,
      block_timestamp DESC,
      receipt_id DESC,
      id DESC
  ) AS src
  WHERE bs.account_id = src.account_id;
END $$;
