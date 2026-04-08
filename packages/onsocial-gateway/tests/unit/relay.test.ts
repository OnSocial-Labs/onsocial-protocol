/**
 * Tests for /relay routes — intent, signed, and delegate relay proxies.
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
import { requireAuth } from '../../src/middleware/index.js';

const JWT_SECRET = 'test-secret-key-at-least-32-chars-long!!';

function createApp() {
  const app = express();
  app.use(express.json());
  // Simulate auth middleware injecting req.auth
  app.use((req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as {
          sub: string;
        };
        req.auth = { accountId: payload.sub, method: 'jwt' as const, tier: 'free' as const, iat: 0, exp: 0 };
      } catch {
        // leave auth undefined
      }
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
// POST /relay/execute
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /relay/execute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('relays an intent action with JWT actor_id', async () => {
    relaySuccess('tx_intent_1');
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: { type: 'set', data: { 'profile/bio': 'hello' } } });

    expect(res.status).toBe(200);
    expect(res.body.tx_hash).toBe('tx_intent_1');

    // Verify relayer received correct payload
    const relayBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(relayBody.auth.type).toBe('intent');
    expect(relayBody.auth.actor_id).toBe('alice.testnet');
    expect(relayBody.target_account).toBe('alice.testnet');
    expect(relayBody.action.type).toBe('set');
  });

  it('returns 400 when action is missing', async () => {
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/action/i);
  });

  it('returns 400 when action.type is missing', async () => {
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: {} });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(createApp())
      .post('/relay/execute')
      .send({ action: { type: 'set', data: {} } });

    expect(res.status).toBe(401);
  });

  it('returns 502 when relayer is unreachable', async () => {
    relayFailure();
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: { type: 'set', data: {} } });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/relay/i);
  });

  it('includes relay API key header', async () => {
    relaySuccess('tx_2');
    const token = makeToken('alice.testnet');

    await request(createApp())
      .post('/relay/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: { type: 'set', data: {} } });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Api-Key']).toBe('test-relay-key');
  });

  it('allows target_account override', async () => {
    relaySuccess('tx_3');
    const token = makeToken('alice.testnet');

    await request(createApp())
      .post('/relay/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: { type: 'set', data: {} },
        target_account: 'bob.testnet',
      });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('bob.testnet');
    // actor_id still locked to JWT identity
    expect(body.auth.actor_id).toBe('alice.testnet');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /relay/signed
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /relay/signed', () => {
  beforeEach(() => vi.clearAllMocks());

  const validSignedBody = {
    target_account: 'alice.testnet',
    action: { type: 'set', data: {} },
    auth: {
      type: 'signed_payload',
      public_key: 'ed25519:abc123',
      nonce: '1',
      expires_at_ms: '9999999999999',
      signature: 'base64sig==',
    },
  };

  it('relays a signed payload action', async () => {
    relaySuccess('tx_signed_1');
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/signed')
      .set('Authorization', `Bearer ${token}`)
      .send(validSignedBody);

    expect(res.status).toBe(200);
    expect(res.body.tx_hash).toBe('tx_signed_1');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.auth.type).toBe('signed_payload');
    expect(body.auth.public_key).toBe('ed25519:abc123');
  });

  it('returns 400 when target_account is missing', async () => {
    const token = makeToken('alice.testnet');
    const { target_account: _, ...body } = validSignedBody;

    const res = await request(createApp())
      .post('/relay/signed')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target_account/i);
  });

  it('returns 400 when auth.type is not signed_payload', async () => {
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/signed')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validSignedBody,
        auth: { type: 'intent' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signed_payload/);
  });

  it('returns 400 when auth fields are incomplete', async () => {
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/signed')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validSignedBody,
        auth: { type: 'signed_payload', public_key: 'ed25519:abc' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 502 when relayer is unreachable', async () => {
    relayFailure();
    const token = makeToken('alice.testnet');

    const res = await request(createApp())
      .post('/relay/signed')
      .set('Authorization', `Bearer ${token}`)
      .send(validSignedBody);

    expect(res.status).toBe(502);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /relay/delegate
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /relay/delegate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when auth.type is not delegate_action', async () => {
    const token = makeToken('pro.testnet');

    // Simulate pro tier in auth
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { accountId: 'pro.testnet', method: 'jwt' as const, tier: 'pro' as const, iat: 0, exp: 0 };
      next();
    });
    app.use('/relay', relayRouter);

    const res = await request(app)
      .post('/relay/delegate')
      .send({
        target_account: 'pro.testnet',
        action: { type: 'set', data: {} },
        auth: { type: 'wrong_type' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/delegate_action/);
  });

  it('returns 400 when fields are missing', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { accountId: 'pro.testnet', method: 'jwt' as const, tier: 'pro' as const, iat: 0, exp: 0 };
      next();
    });
    app.use('/relay', relayRouter);

    const res = await request(app)
      .post('/relay/delegate')
      .send({ target_account: 'pro.testnet' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });
});
