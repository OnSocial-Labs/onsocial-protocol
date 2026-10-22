-- Live vs expired lockers. unlock_at is nanoseconds; 1 is expired, 9e18 is active.
INSERT INTO booster_state (
  account_id,
  locked_amount,
  effective_boost,
  lock_months,
  unlock_at,
  last_event_block,
  updated_at
) VALUES
  (
    'boost-live-fixture.near',
    '1000000000000000000',
    '1500000000000000000',
    1,
    9000000000000000000,
    1,
    1
  ),
  (
    'boost-expired-fixture.near',
    '1000000000000000000',
    '1500000000000000000',
    1,
    1,
    1,
    1
  ),
  (
    'boost-unlocked-fixture.near',
    '0',
    '0',
    0,
    0,
    1,
    1
  );
