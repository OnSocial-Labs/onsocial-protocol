-- Write-through heat: first boost, replay, repeat, self, then absolute refresh.
-- Raises on mismatch. Deletes its rows before returning.

INSERT INTO social_spend_events (
  id, block_height, block_timestamp, receipt_id, account_id,
  event_type, success, spender_id, amount, action, target_type,
  target_id, recipient_id
) VALUES (
  'heat-check-first',
  1,
  (EXTRACT(EPOCH FROM NOW()) * 1000000000)::bigint,
  'heat-check-r1',
  'spender.testnet',
  'SOCIAL_SPENT',
  true,
  'spender.testnet',
  '1000000000000000000',
  'boost_post',
  'post',
  'author.testnet/post/heatcheck',
  'author.testnet'
);

DO $$
DECLARE
  got double precision;
BEGIN
  SELECT heat INTO got
  FROM post_amplify_heat
  WHERE post_path = 'author.testnet/post/heatcheck';
  IF got IS NULL OR abs(got - 1.0) > 0.000001 THEN
    RAISE EXCEPTION 'first boost heat expected ~1, got %', got;
  END IF;
END;
$$;

-- Upsert replay must not add the delta again.
INSERT INTO social_spend_events (
  id, block_height, block_timestamp, receipt_id, account_id,
  event_type, success, spender_id, amount, action, target_type,
  target_id, recipient_id
) VALUES (
  'heat-check-first',
  1,
  (EXTRACT(EPOCH FROM NOW()) * 1000000000)::bigint,
  'heat-check-r1',
  'spender.testnet',
  'SOCIAL_SPENT',
  true,
  'spender.testnet',
  '1000000000000000000',
  'boost_post',
  'post',
  'author.testnet/post/heatcheck',
  'author.testnet'
)
ON CONFLICT (id) DO UPDATE
  SET amount = EXCLUDED.amount;

DO $$
DECLARE
  got double precision;
BEGIN
  SELECT heat INTO got
  FROM post_amplify_heat
  WHERE post_path = 'author.testnet/post/heatcheck';
  IF got IS NULL OR abs(got - 1.0) > 0.000001 THEN
    RAISE EXCEPTION 'replay heat expected ~1, got %', got;
  END IF;
END;
$$;

INSERT INTO social_spend_events (
  id, block_height, block_timestamp, receipt_id, account_id,
  event_type, success, spender_id, amount, action, target_type,
  target_id, recipient_id
) VALUES (
  'heat-check-repeat',
  2,
  (EXTRACT(EPOCH FROM NOW()) * 1000000000)::bigint + 1,
  'heat-check-r2',
  'spender.testnet',
  'SOCIAL_SPENT',
  true,
  'spender.testnet',
  '1000000000000000000',
  'boost_post',
  'post',
  'author.testnet/post/heatcheck',
  'author.testnet'
);

DO $$
DECLARE
  got double precision;
BEGIN
  SELECT heat INTO got
  FROM post_amplify_heat
  WHERE post_path = 'author.testnet/post/heatcheck';
  IF got IS NULL OR abs(got - 1.25) > 0.000001 THEN
    RAISE EXCEPTION 'repeat heat expected ~1.25, got %', got;
  END IF;
END;
$$;

INSERT INTO social_spend_events (
  id, block_height, block_timestamp, receipt_id, account_id,
  event_type, success, spender_id, amount, action, target_type,
  target_id, recipient_id
) VALUES (
  'heat-check-self',
  3,
  (EXTRACT(EPOCH FROM NOW()) * 1000000000)::bigint,
  'heat-check-r3',
  'self.testnet',
  'SOCIAL_SPENT',
  true,
  'self.testnet',
  '1000000000000000000',
  'boost_post',
  'post',
  'self.testnet/post/heatcheck',
  'self.testnet'
);

DO $$
DECLARE
  got double precision;
BEGIN
  SELECT heat INTO got
  FROM post_amplify_heat
  WHERE post_path = 'self.testnet/post/heatcheck';
  IF got IS NULL OR abs(got - 0.25) > 0.000001 THEN
    RAISE EXCEPTION 'self boost heat expected ~0.25, got %', got;
  END IF;
END;
$$;

-- Absolute refresh replaces the sum; it must not add the deltas again.
SELECT refresh_post_amplify_heat();

DO $$
DECLARE
  got double precision;
BEGIN
  SELECT heat INTO got
  FROM post_amplify_heat
  WHERE post_path = 'author.testnet/post/heatcheck';
  IF got IS NULL OR abs(got - 1.25) > 0.0001 THEN
    RAISE EXCEPTION 'refresh heat expected ~1.25, got %', got;
  END IF;
END;
$$;

DELETE FROM social_spend_events
WHERE id IN ('heat-check-first', 'heat-check-repeat', 'heat-check-self');

DELETE FROM post_amplify_heat_state
WHERE post_path IN (
  'author.testnet/post/heatcheck',
  'self.testnet/post/heatcheck'
);
