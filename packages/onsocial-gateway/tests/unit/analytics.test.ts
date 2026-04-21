import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAnalyticsOverview = vi.fn();
const mockGetAnalyticsDrilldown = vi.fn();
const mockIsAdmin = vi.fn();

vi.mock('../../src/services/analytics/index.js', () => ({
  getAnalyticsOverview: (...args: unknown[]) =>
    mockGetAnalyticsOverview(...args),
  getAnalyticsDrilldown: (...args: unknown[]) =>
    mockGetAnalyticsDrilldown(...args),
}));

vi.mock('../../src/tiers/index.js', () => ({
  isAdmin: (...args: unknown[]) => mockIsAdmin(...args),
}));

import express from 'express';
import request from 'supertest';
import { analyticsRouter } from '../../src/routes/analytics.js';

function createApp(auth?: {
  accountId: string;
  method: 'jwt' | 'apikey';
  tier?: 'free' | 'service';
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (auth) {
      req.auth = {
        accountId: auth.accountId,
        method: auth.method,
        tier: auth.tier ?? 'free',
        iat: 0,
        exp: 0,
      };
    }
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    next();
  });
  app.use('/developer', analyticsRouter);
  return app;
}

describe('GET /developer/analytics/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(false);
  });

  it('requires authentication', async () => {
    const res = await request(createApp()).get('/developer/analytics/overview');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication required/i);
  });

  it('blocks non-admin free-tier callers', async () => {
    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt', tier: 'free' })
    ).get('/developer/analytics/overview');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/internal analytics/i);
    expect(mockGetAnalyticsOverview).not.toHaveBeenCalled();
  });

  it('allows service-tier callers', async () => {
    mockGetAnalyticsOverview.mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      windowHours: 24,
      totals: { profiles: 12, posts: 34, reactions: 56, claims: 7, groups: 3 },
      recent24h: {
        profiles: 2,
        posts: 5,
        reactions: 9,
        claims: 1,
        groups: 1,
        permissionChanges: 4,
        storageWrites: 6,
        contractEvents: 8,
      },
      latestIndexed: {
        posts: { blockHeight: 10, blockTimestamp: '1000' },
        reactions: { blockHeight: 11, blockTimestamp: '1001' },
        groups: { blockHeight: 12, blockTimestamp: '1002' },
      },
    });

    const res = await request(
      createApp({
        accountId: 'service.testnet',
        method: 'apikey',
        tier: 'service',
      })
    ).get('/developer/analytics/overview');

    expect(res.status).toBe(200);
    expect(res.body.totals.posts).toBe(34);
    expect(mockGetAnalyticsOverview).toHaveBeenCalledWith('service.testnet');
  });

  it('allows admin wallets even without service tier', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockGetAnalyticsOverview.mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      windowHours: 24,
      totals: { profiles: 1, posts: 1, reactions: 1, claims: 1, groups: 1 },
      recent24h: {
        profiles: 1,
        posts: 1,
        reactions: 1,
        claims: 1,
        groups: 1,
        permissionChanges: 1,
        storageWrites: 1,
        contractEvents: 1,
      },
      latestIndexed: { posts: null, reactions: null, groups: null },
    });

    const res = await request(
      createApp({ accountId: 'admin.testnet', method: 'jwt', tier: 'free' })
    ).get('/developer/analytics/overview');

    expect(res.status).toBe(200);
    expect(mockIsAdmin).toHaveBeenCalledWith('admin.testnet');
  });
});

describe('GET /developer/analytics/drilldown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(false);
  });

  it('requires exactly one focus parameter', async () => {
    const res = await request(
      createApp({
        accountId: 'service.testnet',
        method: 'apikey',
        tier: 'service',
      })
    ).get('/developer/analytics/drilldown');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly one/i);
  });

  it('rejects requests that pass both accountId and partitionId', async () => {
    const res = await request(
      createApp({
        accountId: 'service.testnet',
        method: 'apikey',
        tier: 'service',
      })
    ).get(
      '/developer/analytics/drilldown?accountId=alice.testnet&partitionId=12'
    );

    expect(res.status).toBe(400);
    expect(mockGetAnalyticsDrilldown).not.toHaveBeenCalled();
  });

  it('loads account drilldown for service callers', async () => {
    mockGetAnalyticsDrilldown.mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      windowHours: 24,
      focus: { type: 'account', accountId: 'alice.testnet' },
      stream: 'all',
      requestedLimit: 12,
      hasMore: false,
      totals: {
        posts: 1,
        reactions: 2,
        claims: 3,
        groups: 4,
        permissions: 5,
        contracts: 6,
        total: 21,
      },
      latestByStream: {
        posts: { blockHeight: 10, blockTimestamp: '1000' },
        reactions: null,
        claims: null,
        groups: null,
        permissions: null,
        contracts: null,
      },
      recent: [],
    });

    const res = await request(
      createApp({
        accountId: 'service.testnet',
        method: 'apikey',
        tier: 'service',
      })
    ).get('/developer/analytics/drilldown?accountId=alice.testnet');

    expect(res.status).toBe(200);
    expect(res.body.focus.accountId).toBe('alice.testnet');
    expect(mockGetAnalyticsDrilldown).toHaveBeenCalledWith(
      'service.testnet',
      {
        type: 'account',
        accountId: 'alice.testnet',
      },
      'all',
      12
    );
  });

  it('loads partition drilldown for admin callers', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockGetAnalyticsDrilldown.mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      windowHours: 24,
      focus: { type: 'partition', partitionId: 42 },
      stream: 'all',
      requestedLimit: 12,
      hasMore: false,
      totals: {
        posts: 0,
        reactions: 0,
        claims: 0,
        groups: 2,
        permissions: 3,
        contracts: 4,
        total: 9,
      },
      latestByStream: {
        posts: null,
        reactions: null,
        claims: null,
        groups: { blockHeight: 10, blockTimestamp: '1000' },
        permissions: null,
        contracts: null,
      },
      recent: [],
    });

    const res = await request(
      createApp({ accountId: 'admin.testnet', method: 'jwt', tier: 'free' })
    ).get('/developer/analytics/drilldown?partitionId=42');

    expect(res.status).toBe(200);
    expect(mockGetAnalyticsDrilldown).toHaveBeenCalledWith(
      'admin.testnet',
      {
        type: 'partition',
        partitionId: 42,
      },
      'all',
      12
    );
  });

  it('rejects unknown stream filters', async () => {
    const res = await request(
      createApp({
        accountId: 'service.testnet',
        method: 'apikey',
        tier: 'service',
      })
    ).get(
      '/developer/analytics/drilldown?accountId=alice.testnet&stream=weird'
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid stream/i);
  });

  it('passes through stream filters', async () => {
    mockGetAnalyticsDrilldown.mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      windowHours: 24,
      focus: { type: 'account', accountId: 'alice.testnet' },
      stream: 'posts',
      requestedLimit: 12,
      hasMore: false,
      totals: {
        posts: 1,
        reactions: 0,
        claims: 0,
        groups: 0,
        permissions: 0,
        contracts: 0,
        total: 1,
      },
      latestByStream: {
        posts: { blockHeight: 10, blockTimestamp: '1000' },
        reactions: null,
        claims: null,
        groups: null,
        permissions: null,
        contracts: null,
      },
      recent: [],
    });

    const res = await request(
      createApp({
        accountId: 'service.testnet',
        method: 'apikey',
        tier: 'service',
      })
    ).get(
      '/developer/analytics/drilldown?accountId=alice.testnet&stream=posts'
    );

    expect(res.status).toBe(200);
    expect(mockGetAnalyticsDrilldown).toHaveBeenCalledWith(
      'service.testnet',
      {
        type: 'account',
        accountId: 'alice.testnet',
      },
      'posts',
      12
    );
  });

  it('rejects invalid limits', async () => {
    const res = await request(
      createApp({
        accountId: 'service.testnet',
        method: 'apikey',
        tier: 'service',
      })
    ).get('/developer/analytics/drilldown?accountId=alice.testnet&limit=0');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid limit/i);
  });

  it('passes through explicit limits', async () => {
    mockGetAnalyticsDrilldown.mockResolvedValue({
      generatedAt: '2025-01-01T00:00:00.000Z',
      windowHours: 24,
      focus: { type: 'account', accountId: 'alice.testnet' },
      stream: 'all',
      requestedLimit: 24,
      hasMore: true,
      totals: {
        posts: 10,
        reactions: 10,
        claims: 10,
        groups: 10,
        permissions: 10,
        contracts: 10,
        total: 60,
      },
      latestByStream: {
        posts: { blockHeight: 10, blockTimestamp: '1000' },
        reactions: null,
        claims: null,
        groups: null,
        permissions: null,
        contracts: null,
      },
      recent: [],
    });

    const res = await request(
      createApp({
        accountId: 'service.testnet',
        method: 'apikey',
        tier: 'service',
      })
    ).get('/developer/analytics/drilldown?accountId=alice.testnet&limit=24');

    expect(res.status).toBe(200);
    expect(mockGetAnalyticsDrilldown).toHaveBeenCalledWith(
      'service.testnet',
      {
        type: 'account',
        accountId: 'alice.testnet',
      },
      'all',
      24
    );
  });
});
