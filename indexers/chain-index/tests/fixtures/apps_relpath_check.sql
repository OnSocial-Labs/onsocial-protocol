-- Semantic check for generated app_relpath + apps_current.
DELETE FROM data_updates WHERE id LIKE 'apps-relpath-fixture-%';

INSERT INTO data_updates (
  id, path, data_type, data_id, value, block_height, block_timestamp, receipt_id
) VALUES
  (
    'apps-relpath-fixture-1',
    'alice.near/apps/acme-track/lot/lot_123',
    'apps',
    'acme-track',
    '{"id":"lot_123"}',
    10,
    10,
    'r1'
  ),
  (
    'apps-relpath-fixture-2',
    'alice.near/apps/acme-track',
    'apps',
    'acme-track',
    '{}',
    10,
    10,
    'r2'
  ),
  (
    'apps-relpath-fixture-3',
    'alice.near/apps/acme-track/',
    'apps',
    'acme-track',
    '{}',
    10,
    10,
    'r3'
  ),
  (
    'apps-relpath-fixture-4',
    'alice.near/review/item-001',
    'review',
    'item-001',
    '{}',
    10,
    10,
    'r4'
  ),
  (
    'apps-relpath-fixture-5',
    'alice.near/apps/acme-track/lottery/x',
    'apps',
    'acme-track',
    '{"id":"x"}',
    10,
    10,
    'r5'
  );
