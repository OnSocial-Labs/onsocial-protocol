/**
 * Tests for /relay routes — execute (Direct), delegate (NEP-366), and latest-block.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../../src/config/index.js', () => ({
  config: {
    nearNetwork: 'testnet',
    relayUrl: 'http://localhost:3030',
    relayApiKey: 'test-relay-key',
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

vi.mock('../../src/services/metering/index.js', () => ({
  recordUsage: vi.fn(),
}));

vi.mock('../../src/services/apikeys/index.js', () => ({
  resolveApiKey: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { relayRouter } from '../../src/routes/relay.js';

const JWT_SECRET = 'test-secret-key-at-least-32-chars-long!!';

function createApp() {
  const app = express();
  app.use(express.json());
  // Simulate auth middleware injecting req.auth.
  // - "Bearer <jwt>"  → method = jwt
  // - "X-Api-Key: ..." (or query/body actorId) → method = apikey
  app.use((req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as {
          sub: string;
        };
        req.auth = {
          accountId: payload.sub,
          method: 'jwt' as const,
          tier: 'free' as const,
          iat: 0,
          exp: 0,
        };
      } catch {
        // leave auth undefined
      }
    } else if (req.headers['x-api-key']) {
      req.auth = {
        accountId: 'svc.testnet',
        method: 'apikey' as const,
        tier: 'pro' as const,
        iat: 0,
        exp: 0,
      };
    }
    next();
  });
  app.use('/relay', relayRouter);
  return app;
}

function makeToken(accountId: string): string {
  return jwt.sign({ sub: accountId }, JWT_SECRET, { expiresIn: '1h' });
}

function relaySuccess(txHash: string) {
  mockFetch.mockResolvedValueOnce({
    status: 200,
    json: async () => ({ tx_hash: txHash }),
  });
}

function relayFailure() {
  mockFetch.mockRejectedValueOnce(new Error('connection refused'));
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /relay/delegate (NEP-366)
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /relay/delegate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when signed_delegate is missing', async () => {
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/delegate')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signed_delegate/i);
  });

  it('returns 400 when signed_delegate is not a string', async () => {
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/delegate')
      .set('Authorization', `Bearer ${token}`)
      .send({ signed_delegate: 12345 });

    expect(res.status).toBe(400);
  });

  it('forwards base64 signed_delegate to relayer /execute_delegate', async () => {
    relaySuccess('delegate-tx-hash');
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/delegate')
      .set('Authorization', `Bearer ${token}`)
      .send({ signed_delegate: 'AAAA' });

    expect(res.status).toBe(200);
    expect(res.body.tx_hash).toBe('delegate-tx-hash');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3030/execute_delegate');
    expect((init as { method: string }).method).toBe('POST');
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ signed_delegate: 'AAAA' });
  });

  it('passes through ?wait=true', async () => {
    relaySuccess('committed-hash');
    const token = makeToken('alice.testnet');

    await request(createApp())
      .post('/relay/delegate?wait=true')
      .set('Authorization', `Bearer ${token}`)
      .send({ signed_delegate: 'AAAA' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3030/execute_delegate?wait=true');
  });

  it('forwards options when present', async () => {
    relaySuccess('h');
    const token = makeToken('alice.testnet');

    await request(createApp())
      .post('/relay/delegate')
      .set('Authorization', `Bearer ${token}`)
      .send({ signed_delegate: 'AAAA', options: { topup_yocto: '100' } });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.options).toEqual({ topup_yocto: '100' });
  });

  it('returns 502 when relayer is unreachable', async () => {
    relayFailure();
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/delegate')
      .set('Authorization', `Bearer ${token}`)
      .send({ signed_delegate: 'AAAA' });

    expect(res.status).toBe(502);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(createApp())
      .post('/relay/delegate')
      .send({ signed_delegate: 'AAAA' });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /relay/latest-block
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /relay/latest-block', () => {
  beforeEach(() => vi.clearAllMocks());

  it('proxies the upstream relayer /latest_block (no auth required)', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ block_hash: 'AbCdEf', block_height: 123_456 }),
    });

    const res = await request(createApp()).get('/relay/latest-block');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ block_hash: 'AbCdEf', block_height: 123_456 });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3030/latest_block',
      expect.any(Object)
    );
  });

  it('returns 502 when upstream is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(createApp()).get('/relay/latest-block');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Upstream unavailable');
  });
});
