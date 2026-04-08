/**
 * Tests for /developer routes — API key management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateApiKey = vi.fn();
const mockListApiKeys = vi.fn();
const mockRevokeApiKey = vi.fn();
const mockGetUsageSummary = vi.fn();

vi.mock('../../src/services/apikeys/index.js', () => ({
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  listApiKeys: (...args: unknown[]) => mockListApiKeys(...args),
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
  resolveApiKey: vi.fn(),
}));

vi.mock('../../src/services/metering/index.js', () => ({
  recordUsage: vi.fn(),
  getUsageSummary: (...args: unknown[]) => mockGetUsageSummary(...args),
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    nearNetwork: 'testnet',
    jwtSecret: 'test-secret-key-at-least-32-chars-long!!',
    nearRpcUrl: '',
    redisUrl: '',
    nodeEnv: 'test',
    rateLimits: { free: 60, pro: 600, scale: 3000 },
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import express from 'express';
import request from 'supertest';
import { developerRouter } from '../../src/routes/developer.js';

function createApp(auth?: { accountId: string; method: 'jwt' | 'apikey' }) {
  const app = express();
  app.use(express.json());
  // Inject auth to simulate middleware
  app.use((req, _res, next) => {
    if (auth) {
      req.auth = { ...auth, tier: 'free' as const, iat: 0, exp: 0 };
    }
    // Add pino-style logger to req
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    next();
  });
  app.use('/developer', developerRouter);
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /developer/keys — create key
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /developer/keys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a key and returns it with warning', async () => {
    mockCreateApiKey.mockResolvedValue({
      rawKey: 'osk_abc123secret',
      prefix: 'osk_abc',
      label: 'my-key',
      tier: 'free',
    });

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt' })
    )
      .post('/developer/keys')
      .send({ label: 'my-key' });

    expect(res.status).toBe(201);
    expect(res.body.key).toBe('osk_abc123secret');
    expect(res.body.prefix).toBe('osk_abc');
    expect(res.body.label).toBe('my-key');
    expect(res.body.warning).toMatch(/save/i);
    expect(mockCreateApiKey).toHaveBeenCalledWith('alice.testnet', 'my-key');
  });

  it('uses default label when none provided', async () => {
    mockCreateApiKey.mockResolvedValue({
      rawKey: 'osk_xyz',
      prefix: 'osk_x',
      label: 'default',
      tier: 'free',
    });

    await request(createApp({ accountId: 'alice.testnet', method: 'jwt' }))
      .post('/developer/keys')
      .send({});

    expect(mockCreateApiKey).toHaveBeenCalledWith('alice.testnet', 'default');
  });

  it('returns 409 when MAX_KEYS_REACHED', async () => {
    mockCreateApiKey.mockResolvedValue({
      code: 'MAX_KEYS_REACHED',
      message: 'Maximum 5 keys per account',
    });

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt' })
    )
      .post('/developer/keys')
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MAX_KEYS_REACHED');
  });

  it('rejects API key auth (must use JWT)', async () => {
    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey' })
    )
      .post('/developer/keys')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/JWT/i);
    expect(mockCreateApiKey).not.toHaveBeenCalled();
  });

  it('returns 401 without auth', async () => {
    const res = await request(createApp()).post('/developer/keys').send({});

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /developer/keys — list keys
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /developer/keys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns list of masked keys', async () => {
    const keys = [
      { prefix: 'osk_abc', label: 'prod', created: '2026-01-01' },
      { prefix: 'osk_xyz', label: 'dev', created: '2026-02-01' },
    ];
    mockListApiKeys.mockResolvedValue(keys);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt' })
    ).get('/developer/keys');

    expect(res.status).toBe(200);
    expect(res.body.keys).toEqual(keys);
    expect(mockListApiKeys).toHaveBeenCalledWith('alice.testnet');
  });

  it('rejects API key auth', async () => {
    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey' })
    ).get('/developer/keys');

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /developer/keys/:prefix — revoke key
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /developer/keys/:prefix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes a key and returns status', async () => {
    mockRevokeApiKey.mockResolvedValue(true);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt' })
    ).delete('/developer/keys/osk_abc');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('revoked');
    expect(mockRevokeApiKey).toHaveBeenCalledWith('alice.testnet', 'osk_abc');
  });

  it('returns 404 when key not found', async () => {
    mockRevokeApiKey.mockResolvedValue(false);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt' })
    ).delete('/developer/keys/osk_nope');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('rejects API key auth', async () => {
    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey' })
    ).delete('/developer/keys/osk_abc');

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /developer/usage — usage statistics
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /developer/usage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns usage summary', async () => {
    const summary = { today: 100, thisMonth: 2500 };
    mockGetUsageSummary.mockResolvedValue(summary);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt' })
    ).get('/developer/usage');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
    expect(mockGetUsageSummary).toHaveBeenCalledWith('alice.testnet');
  });

  it('returns 500 on service error', async () => {
    mockGetUsageSummary.mockRejectedValue(new Error('redis down'));

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt' })
    ).get('/developer/usage');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/usage/i);
  });
});
