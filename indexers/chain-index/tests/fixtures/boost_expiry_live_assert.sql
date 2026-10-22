SELECT account_id
FROM leaderboard_boost
WHERE account_id IN (
  'boost-live-fixture.near',
  'boost-expired-fixture.near',
  'boost-unlocked-fixture.near'
)
ORDER BY account_id;
