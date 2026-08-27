import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListCommunityAppCatalog = vi.fn();

vi.mock('../../src/services/developer-apps/index.js', () => ({
  listCommunityAppCatalog: (...args: unknown[]) =>
    mockListCommunityAppCatalog(...args),
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import express from 'express';
import request from 'supertest';
import { communityAppsRouter } from '../../src/routes/community-apps.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    next();
  });
  app.use('/developer', communityAppsRouter);
  return app;
}

describe('GET /developer/apps/catalog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns public listings without auth', async () => {
    mockListCommunityAppCatalog.mockResolvedValue([
      {
        appId: 'tracker',
        ownerAccountId: 'alice.testnet',
        createdAt: Date.now(),
        name: 'Tracker',
        iconUrl: null,
        href: 'https://track.example.com/',
        listed: true,
      },
    ]);

    const res = await request(createApp()).get('/developer/apps/catalog');

    expect(res.status).toBe(200);
    expect(res.body.apps).toEqual([
      {
        appId: 'tracker',
        name: 'Tracker',
        iconUrl: null,
        href: 'https://track.example.com/',
      },
    ]);
  });
});
