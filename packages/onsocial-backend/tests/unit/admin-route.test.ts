import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();
vi.mock('../../src/db/index.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import express from 'express';
import request from 'supertest';

// Set ADMIN_SECRET before importing the router (reads it at module load)
process.env.ADMIN_SECRET = 'test_admin_secret_1234';

// Dynamic import so mocks and env are in place
const { default: adminRouter } = await import('../../src/routes/admin.js');

const app = express();
app.use(express.json());
app.use('/v1/admin', adminRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRows(rows: Record<string, unknown>[]) {
  return { rows };
}

const ADMIN_HEADER = { 'X-Admin-Secret': 'test_admin_secret_1234' };

// ---------------------------------------------------------------------------
// POST /v1/admin/apply
// ---------------------------------------------------------------------------

describe('POST /v1/admin/apply', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    // Default: return empty rows so unhandled queries don't throw
    mockQuery.mockResolvedValue(makeRows([]));
  });

  it('rejects missing label', async () => {
    const res = await request(app).post('/v1/admin/apply').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label is required/);
  });

  it('rejects label that produces too-short slug', async () => {
    const res = await request(app).post('/v1/admin/apply').send({ label: 'A' });
    expect(res.status).toBe(400);
    // Single char label → slug "a" → fails 3-char minimum on app_id
    expect(res.body.error).toMatch(/app_id must be/);
  });

  it('rejects label exceeding 100 chars', async () => {
    const longLabel = 'A'.repeat(101);
    const res = await request(app)
      .post('/v1/admin/apply')
      .send({ label: longLabel, app_id: 'valid_app_id' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label must be 2-100 characters/);
  });

  it('rejects invalid app_id pattern', async () => {
    const res = await request(app)
      .post('/v1/admin/apply')
      .send({ label: 'Test App', app_id: 'AB' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/app_id must be/);
  });

  it('rejects duplicate app_id', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([{ id: 1, status: 'pending' }]));

    const res = await request(app)
      .post('/v1/admin/apply')
      .send({ label: 'Test App', app_id: 'test_app' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already pending/);
  });

  it('creates pending application successfully', async () => {
    // First query: check existing (none)
    mockQuery.mockResolvedValueOnce(makeRows([]));
    // Second query: insert
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(app).post('/v1/admin/apply').send({
      label: 'My Awesome Bot',
      description: 'A Telegram bot',
      wallet_id: 'alice.testnet',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.app_id).toBe('my_awesome_bot');
    expect(res.body.status).toBe('pending');
  });

  it('auto-generates slug from label', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(app)
      .post('/v1/admin/apply')
      .send({ label: 'Cool Dapp 2026!' });
    expect(res.status).toBe(200);
    expect(res.body.app_id).toBe('cool_dapp_2026');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/status/:wallet
// ---------------------------------------------------------------------------

describe('GET /v1/admin/status/:wallet', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue(makeRows([]));
  });

  it('returns none for unknown wallet', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(app).get('/v1/admin/status/unknown.testnet');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
  });

  it('hides api_key for pending apps', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test',
          status: 'pending',
          api_key: null,
          created_at: '2026-01-01',
        },
      ])
    );

    const res = await request(app).get('/v1/admin/status/alice.testnet');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.api_key).toBeUndefined();
  });

  it('reveals api_key for approved apps', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([
        {
          app_id: 'test_app',
          label: 'Test',
          status: 'approved',
          api_key: 'os_live_abc123',
          created_at: '2026-01-01',
        },
      ])
    );

    const res = await request(app).get('/v1/admin/status/alice.testnet');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.api_key).toBe('os_live_abc123');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/applications (admin-only)
// ---------------------------------------------------------------------------

describe('GET /v1/admin/applications', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue(makeRows([]));
  });

  it('rejects without admin secret', async () => {
    const res = await request(app).get('/v1/admin/applications');
    expect(res.status).toBe(403);
  });

  it('rejects wrong admin secret', async () => {
    const res = await request(app)
      .get('/v1/admin/applications')
      .set('X-Admin-Secret', 'wrong');
    expect(res.status).toBe(403);
  });

  it('returns applications list with correct secret', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([{ app_id: 'app1', status: 'pending' }])
    );

    const res = await request(app)
      .get('/v1/admin/applications')
      .set(ADMIN_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.applications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/approve/:appId (admin-only)
// ---------------------------------------------------------------------------

describe('POST /v1/admin/approve/:appId', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue(makeRows([]));
  });

  it('rejects without admin secret', async () => {
    const res = await request(app).post('/v1/admin/approve/test_app');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown app', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(app)
      .post('/v1/admin/approve/unknown_app')
      .set(ADMIN_HEADER);
    expect(res.status).toBe(404);
  });

  it('approves and returns new API key', async () => {
    // SELECT existing
    mockQuery.mockResolvedValueOnce(makeRows([{ id: 1, status: 'pending' }]));
    // UPDATE
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(app)
      .post('/v1/admin/approve/test_app')
      .set(ADMIN_HEADER)
      .send({ admin_notes: 'Looks good' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.app_id).toBe('test_app');
    expect(res.body.api_key).toMatch(/^os_live_[a-f0-9]{64}$/);
    expect(res.body.status).toBe('approved');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/reject/:appId (admin-only)
// ---------------------------------------------------------------------------

describe('POST /v1/admin/reject/:appId', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue(makeRows([]));
  });

  it('rejects without admin secret', async () => {
    const res = await request(app).post('/v1/admin/reject/test_app');
    expect(res.status).toBe(403);
  });

  it('rejects an application', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(app)
      .post('/v1/admin/reject/test_app')
      .set(ADMIN_HEADER)
      .send({ admin_notes: 'Not a good fit' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/rotate-key/:wallet
// ---------------------------------------------------------------------------

describe('POST /v1/admin/rotate-key/:wallet', () => {
  const STORED_KEY =
    'os_live_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue(makeRows([]));
  });

  it('rejects without X-Api-Key header', async () => {
    const res = await request(app).post('/v1/admin/rotate-key/alice.testnet');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/X-Api-Key header required/);
  });

  it('returns 404 when no active partner found', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(app)
      .post('/v1/admin/rotate-key/unknown.testnet')
      .set('X-Api-Key', 'os_live_whatever');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No active partner/);
  });

  it('rejects wrong API key', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([{ id: 1, app_id: 'test_app', api_key: STORED_KEY }])
    );

    const res = await request(app)
      .post('/v1/admin/rotate-key/alice.testnet')
      .set(
        'X-Api-Key',
        'os_live_wrong_key_0000000000000000000000000000000000000000000000000000'
      );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Invalid API key/);
  });

  it('rejects key with different length (timing-safe)', async () => {
    mockQuery.mockResolvedValueOnce(
      makeRows([{ id: 1, app_id: 'test_app', api_key: STORED_KEY }])
    );

    const res = await request(app)
      .post('/v1/admin/rotate-key/alice.testnet')
      .set('X-Api-Key', 'short');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Invalid API key/);
  });

  it('rotates key successfully with correct current key', async () => {
    // SELECT partner row
    mockQuery.mockResolvedValueOnce(
      makeRows([{ id: 42, app_id: 'test_app', api_key: STORED_KEY }])
    );
    // UPDATE with new key
    mockQuery.mockResolvedValueOnce(makeRows([]));

    const res = await request(app)
      .post('/v1/admin/rotate-key/alice.testnet')
      .set('X-Api-Key', STORED_KEY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.app_id).toBe('test_app');
    expect(res.body.api_key).toMatch(/^os_live_[a-f0-9]{64}$/);
    // New key should differ from old key
    expect(res.body.api_key).not.toBe(STORED_KEY);

    // Verify UPDATE was called with the new key and correct row id
    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE partner_keys SET api_key/);
    expect(updateCall[1][1]).toBe(42); // row id
  });

  it('handles DB error gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .post('/v1/admin/rotate-key/alice.testnet')
      .set('X-Api-Key', STORED_KEY);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Key rotation failed/);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/register (legacy)
// ---------------------------------------------------------------------------

describe('POST /v1/admin/register (legacy)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue(makeRows([]));
  });

  it('rejects missing label', async () => {
    const res = await request(app).post('/v1/admin/register').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label is required/);
  });

  it('rejects duplicate app_id', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([{ id: 1 }]));

    const res = await request(app)
      .post('/v1/admin/register')
      .send({ label: 'Existing App', app_id: 'existing' });
    expect(res.status).toBe(409);
  });

  it('registers and returns API key (no admin auth required)', async () => {
    mockQuery.mockResolvedValueOnce(makeRows([])); // check existing
    mockQuery.mockResolvedValueOnce(makeRows([])); // insert

    const res = await request(app)
      .post('/v1/admin/register')
      .send({ label: 'Legacy App' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.app_id).toBe('legacy_app');
    expect(res.body.api_key).toMatch(/^os_live_[a-f0-9]{64}$/);
  });
});
