import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDeveloperAppById = vi.fn();
const mockGetTierInfo = vi.fn();

vi.mock('../../src/services/developer-apps/index.js', () => ({
  getDeveloperAppById: (...args: unknown[]) => mockGetDeveloperAppById(...args),
}));

vi.mock('../../src/tiers/index.js', () => ({
  getTierInfo: (...args: unknown[]) => mockGetTierInfo(...args),
  clearTierCache: vi.fn(),
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    jwtSecret: 'test-secret-key-for-handoff-routes',
    jwtExpiresIn: '1h',
    refreshSecret: 'test-refresh-secret-for-handoff-routes',
    refreshExpiresIn: '7d',
    refreshCookieName: 'onsocial_refresh',
    nodeEnv: 'test',
    nearNetwork: 'testnet',
    nearRpcUrl: 'https://rpc.testnet.near.org',
    rateLimits: { free: 60, pro: 600, scale: 3000, service: 10000 },
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../../src/services/revolut/index.js', () => ({
  SUBSCRIPTION_PLANS: [],
  formatPrice: (plan: { price: unknown }) => plan.price,
}));

import express from 'express';
import request from 'supertest';
import { restrictAppScopedSession } from '../../src/middleware/index.js';
import { authRouter } from '../../src/routes/auth.js';

const listedApp = {
  appId: 'tracker',
  ownerAccountId: 'alice.testnet',
  createdAt: Date.now(),
  name: 'Tracker',
  iconUrl: null,
  href: 'https://track.example.com/app',
  listed: true,
};

function createApp(auth?: {
  accountId: string;
  method: 'jwt' | 'apikey';
  appId?: string;
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (auth) {
      req.auth = {
        ...auth,
        tier: 'free',
        iat: 0,
        exp: 0,
      };
    }
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    next();
  });
  app.use(restrictAppScopedSession);
  app.use('/auth', authRouter);
  app.get('/developer/dm', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/graph/query', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('POST /auth/app-handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTierInfo.mockResolvedValue({ tier: 'free', rateLimit: 60 });
  });

  it('requires a viewer JWT', async () => {
    const res = await request(createApp())
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    expect(res.status).toBe(401);
  });

  it('rejects API key auth', async () => {
    const res = await request(
      createApp({ accountId: 'bob.testnet', method: 'apikey' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    expect(res.status).toBe(403);
  });

  it('rejects an app-scoped JWT', async () => {
    const res = await request(
      createApp({
        accountId: 'bob.testnet',
        method: 'jwt',
        appId: 'tracker',
      })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    expect(res.status).toBe(403);
  });

  it('rejects an unlisted app', async () => {
    mockGetDeveloperAppById.mockResolvedValue({
      ...listedApp,
      listed: false,
    });
    const res = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_LISTED');
  });

  it('issues a one-time code for a listed app', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const res = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(res.body.href).toBe(listedApp.href);
    expect(res.body.expiresIn).toBe(90);
  });
});

describe('POST /auth/app-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTierInfo.mockResolvedValue({ tier: 'free', rateLimit: 60 });
  });

  it('exchanges a code for an app-scoped JWT', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });

    const exchanged = await request(createApp())
      .post('/auth/app-session')
      .set('Origin', 'https://track.example.com')
      .send({ code: issued.body.code, appId: 'tracker' });

    expect(exchanged.status).toBe(200);
    expect(exchanged.body.accountId).toBe('bob.testnet');
    expect(exchanged.body.appId).toBe('tracker');
    expect(exchanged.body.token).toBeTruthy();
    expect(exchanged.body.refreshToken).toBeTruthy();
    expect(exchanged.headers['set-cookie']).toBeUndefined();
  });

  it('allows a server-side exchange without Origin', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });

    const exchanged = await request(createApp())
      .post('/auth/app-session')
      .send({ code: issued.body.code, appId: 'tracker' });
    expect(exchanged.status).toBe(200);
  });

  it('rejects a mismatched Origin', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });

    const exchanged = await request(createApp())
      .post('/auth/app-session')
      .set('Origin', 'https://other.example')
      .send({ code: issued.body.code, appId: 'tracker' });
    expect(exchanged.status).toBe(400);
    expect(exchanged.body.code).toBe('INVALID_HANDOFF');
  });

  it('rejects a reused code', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });

    await request(createApp())
      .post('/auth/app-session')
      .send({ code: issued.body.code, appId: 'tracker' });
    const again = await request(createApp())
      .post('/auth/app-session')
      .send({ code: issued.body.code, appId: 'tracker' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_HANDOFF');
  });
});

describe('restrictAppScopedSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTierInfo.mockResolvedValue({ tier: 'free', rateLimit: 60 });
  });

  it('allows /graph and /auth/me', async () => {
    const app = createApp({
      accountId: 'bob.testnet',
      method: 'jwt',
      appId: 'tracker',
    });
    expect((await request(app).get('/graph/query')).status).toBe(200);
    const me = await request(app).get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.appId).toBe('tracker');
  });

  it('still allows exchanging a new handoff while holding an app JWT', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });

    const exchanged = await request(
      createApp({
        accountId: 'bob.testnet',
        method: 'jwt',
        appId: 'other',
      })
    )
      .post('/auth/app-session')
      .send({ code: issued.body.code, appId: 'tracker' });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body.appId).toBe('tracker');
  });
});

describe('POST /auth/app-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTierInfo.mockResolvedValue({ tier: 'free', rateLimit: 60 });
  });

  it('rotates an app-scoped refresh token without a cookie', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    const exchanged = await request(createApp())
      .post('/auth/app-session')
      .set('Origin', 'https://track.example.com')
      .send({ code: issued.body.code, appId: 'tracker' });

    const refreshed = await request(createApp())
      .post('/auth/app-refresh')
      .set('Origin', 'https://track.example.com')
      .send({
        refreshToken: exchanged.body.refreshToken,
        appId: 'tracker',
      });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accountId).toBe('bob.testnet');
    expect(refreshed.body.appId).toBe('tracker');
    expect(refreshed.body.token).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(exchanged.body.refreshToken);
    expect(refreshed.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a viewer refresh token', async () => {
    const { generateRefreshToken } = await import('../../src/auth/index.js');
    const viewer = generateRefreshToken('bob.testnet');
    const res = await request(createApp())
      .post('/auth/app-refresh')
      .send({ refreshToken: viewer, appId: 'tracker' });
    expect(res.status).toBe(401);
  });

  it('rejects a mismatched appId', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    const exchanged = await request(createApp())
      .post('/auth/app-session')
      .send({ code: issued.body.code, appId: 'tracker' });

    const res = await request(createApp()).post('/auth/app-refresh').send({
      refreshToken: exchanged.body.refreshToken,
      appId: 'other',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a mismatched Origin when the app is listed', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    const exchanged = await request(createApp())
      .post('/auth/app-session')
      .send({ code: issued.body.code, appId: 'tracker' });

    const res = await request(createApp())
      .post('/auth/app-refresh')
      .set('Origin', 'https://other.example')
      .send({
        refreshToken: exchanged.body.refreshToken,
        appId: 'tracker',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_HANDOFF');
  });
});

describe('restrictAppScopedSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTierInfo.mockResolvedValue({ tier: 'free', rateLimit: 60 });
  });

  it('allows app-refresh while holding an app JWT', async () => {
    mockGetDeveloperAppById.mockResolvedValue(listedApp);
    const issued = await request(
      createApp({ accountId: 'bob.testnet', method: 'jwt' })
    )
      .post('/auth/app-handoff')
      .send({ appId: 'tracker' });
    const exchanged = await request(createApp())
      .post('/auth/app-session')
      .send({ code: issued.body.code, appId: 'tracker' });

    const refreshed = await request(
      createApp({
        accountId: 'bob.testnet',
        method: 'jwt',
        appId: 'tracker',
      })
    )
      .post('/auth/app-refresh')
      .send({
        refreshToken: exchanged.body.refreshToken,
        appId: 'tracker',
      });
    expect(refreshed.status).toBe(200);
  });

  it('blocks DMs and refresh', async () => {
    const app = createApp({
      accountId: 'bob.testnet',
      method: 'jwt',
      appId: 'tracker',
    });
    expect((await request(app).get('/developer/dm')).status).toBe(403);
    const refresh = await request(app).post('/auth/refresh');
    expect(refresh.status).toBe(403);
    expect(refresh.body.error).toMatch(/app-scoped/i);
  });
});
