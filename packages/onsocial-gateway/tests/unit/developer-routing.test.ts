import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateApiKey = vi.fn();

vi.mock('../../src/services/apikeys/index.js', () => ({
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
  resolveApiKey: vi.fn(),
}));

vi.mock('../../src/services/metering/index.js', () => ({
  recordUsage: vi.fn(),
  getUsageSummary: vi.fn(),
}));

vi.mock('../../src/services/developer-apps/index.js', () => ({
  ensureDeveloperApp: vi.fn(),
  registerDeveloperApp: vi.fn(),
  listDeveloperApps: vi.fn(),
  deleteDeveloperApp: vi.fn(),
}));

vi.mock('../../src/services/notifications/index.js', () => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationsRead: vi.fn(),
  listNotificationTypes: vi.fn(),
}));

vi.mock('../../src/services/notifications/rules.js', () => ({
  listNotificationRules: vi.fn(),
  createNotificationRule: vi.fn(),
  deleteNotificationRule: vi.fn(),
}));

vi.mock('../../src/services/notifications/webhooks.js', () => ({
  listNotificationWebhooks: vi.fn(),
  createNotificationWebhook: vi.fn(),
  deleteNotificationWebhook: vi.fn(),
}));

vi.mock('../../src/services/notifications/app-events.js', () => ({
  ingestAppNotificationEvents: vi.fn(),
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    nearNetwork: 'testnet',
    jwtSecret: 'test-secret-key-at-least-32-chars-long!!',
    nearRpcUrl: '',
    redisUrl: '',
    nodeEnv: 'test',
    rateLimits: { free: 60, pro: 600, scale: 3000, service: 10000 },
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import express from 'express';
import request from 'supertest';
import { developerRouter } from '../../src/routes/developer.js';
import { notificationRouter } from '../../src/routes/notifications.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      accountId: 'alice.testnet',
      method: 'jwt',
      tier: 'free',
      iat: 0,
      exp: 0,
    };
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    next();
  });
  app.use('/developer', notificationRouter);
  app.use('/developer', developerRouter);
  return app;
}

describe('developer route mounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not let notification tier checks block free-tier key creation', async () => {
    mockCreateApiKey.mockResolvedValue({
      rawKey: 'onsocial_abc123secret',
      prefix: 'onsocial_abc123',
      label: 'default',
      tier: 'free',
    });

    const res = await request(createApp()).post('/developer/keys').send({});

    expect(res.status).toBe(201);
    expect(res.body.prefix).toBe('onsocial_abc123');
    expect(mockCreateApiKey).toHaveBeenCalledWith('alice.testnet', 'default');
  });
});
