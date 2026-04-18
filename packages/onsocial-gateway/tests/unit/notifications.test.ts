import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListNotifications = vi.fn();
const mockGetUnreadNotificationCount = vi.fn();
const mockMarkNotificationsRead = vi.fn();
const mockListNotificationTypes = vi.fn();
const mockListNotificationRules = vi.fn();
const mockCreateNotificationRule = vi.fn();
const mockDeleteNotificationRule = vi.fn();
const mockListNotificationWebhooks = vi.fn();
const mockCreateNotificationWebhook = vi.fn();
const mockDeleteNotificationWebhook = vi.fn();
const mockIngestAppNotificationEvents = vi.fn();
const mockEnsureDeveloperApp = vi.fn();

vi.mock('../../src/services/notifications/index.js', () => ({
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  getUnreadNotificationCount: (...args: unknown[]) =>
    mockGetUnreadNotificationCount(...args),
  markNotificationsRead: (...args: unknown[]) =>
    mockMarkNotificationsRead(...args),
  listNotificationTypes: (...args: unknown[]) =>
    mockListNotificationTypes(...args),
}));

vi.mock('../../src/services/notifications/rules.js', () => ({
  listNotificationRules: (...args: unknown[]) =>
    mockListNotificationRules(...args),
  createNotificationRule: (...args: unknown[]) =>
    mockCreateNotificationRule(...args),
  deleteNotificationRule: (...args: unknown[]) =>
    mockDeleteNotificationRule(...args),
}));

vi.mock('../../src/services/notifications/webhooks.js', () => ({
  listNotificationWebhooks: (...args: unknown[]) =>
    mockListNotificationWebhooks(...args),
  createNotificationWebhook: (...args: unknown[]) =>
    mockCreateNotificationWebhook(...args),
  deleteNotificationWebhook: (...args: unknown[]) =>
    mockDeleteNotificationWebhook(...args),
}));

vi.mock('../../src/services/notifications/app-events.js', () => ({
  ingestAppNotificationEvents: (...args: unknown[]) =>
    mockIngestAppNotificationEvents(...args),
}));

vi.mock('../../src/services/developer-apps/index.js', () => ({
  ensureDeveloperApp: (...args: unknown[]) => mockEnsureDeveloperApp(...args),
  registerDeveloperApp: vi.fn(),
  listDeveloperApps: vi.fn(),
  deleteDeveloperApp: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import express from 'express';
import request from 'supertest';
import { notificationRouter } from '../../src/routes/notifications.js';

function createApp(auth?: {
  accountId: string;
  method: 'jwt' | 'apikey';
  tier?: 'free' | 'pro' | 'scale' | 'service';
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (auth) {
      req.auth = {
        ...auth,
        tier: auth.tier ?? 'pro',
        iat: 0,
        exp: 0,
      };
    }
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    next();
  });
  app.use('/developer', notificationRouter);
  return app;
}

describe('GET /developer/notifications/types', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the supported notification types', async () => {
    mockListNotificationTypes.mockReturnValue(['reply', 'reaction']);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey' })
    ).get('/developer/notifications/types');

    expect(res.status).toBe(200);
    expect(res.body.types).toEqual(['reply', 'reaction']);
  });
});

describe('GET /developer/notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists notifications for a recipient and app scope', async () => {
    mockListNotifications.mockResolvedValue({
      notifications: [{ id: 'notif-1' }],
      nextCursor: null,
    });

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey', tier: 'scale' })
    )
      .get('/developer/notifications')
      .query({
        recipient: 'bob.testnet',
        appId: 'portal',
        limit: 25,
        read: 'false',
        type: 'reply',
        eventType: 'comment.reply',
      });

    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([{ id: 'notif-1' }]);
    expect(mockListNotifications).toHaveBeenCalledWith({
      ownerAccountId: 'alice.testnet',
      appId: 'portal',
      recipient: 'bob.testnet',
      limit: 25,
      tier: 'scale',
      read: false,
      type: 'reply',
      eventType: 'comment.reply',
      cursor: undefined,
    });
  });

  it('allows free-tier read access', async () => {
    mockListNotifications.mockResolvedValue({
      notifications: [],
      nextCursor: null,
    });

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey', tier: 'free' })
    )
      .get('/developer/notifications')
      .query({ recipient: 'bob.testnet' });

    expect(res.status).toBe(200);
  });

  it('requires recipient', async () => {
    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey' })
    ).get('/developer/notifications');

    expect(res.status).toBe(400);
  });

  it('defaults appId to default when omitted', async () => {
    mockListNotifications.mockResolvedValue({
      notifications: [],
      nextCursor: null,
    });

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey' })
    )
      .get('/developer/notifications')
      .query({ recipient: 'bob.testnet' });

    expect(res.status).toBe(200);
    expect(mockListNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'default' })
    );
  });
});

describe('GET /developer/notifications/count', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unread count', async () => {
    mockGetUnreadNotificationCount.mockResolvedValue(7);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey' })
    )
      .get('/developer/notifications/count')
      .query({
        recipient: 'bob.testnet',
        appId: 'portal',
        eventType: 'comment.reply',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recipient: 'bob.testnet', unread: 7 });
    expect(mockGetUnreadNotificationCount).toHaveBeenCalledWith({
      ownerAccountId: 'alice.testnet',
      appId: 'portal',
      recipient: 'bob.testnet',
      eventType: 'comment.reply',
    });
  });
});

describe('POST /developer/notifications/events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues a single custom app event', async () => {
    mockEnsureDeveloperApp.mockResolvedValue({});
    mockIngestAppNotificationEvents.mockResolvedValue([
      { id: 'evt-1', dedupeKey: 'post:1:bob', status: 'queued' },
    ]);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey', tier: 'pro' })
    )
      .post('/developer/notifications/events')
      .send({
        appId: 'portal',
        recipient: 'bob.testnet',
        actor: 'alice.testnet',
        eventType: 'comment.reply',
        dedupeKey: 'post:1:bob',
        objectId: 'post-1',
        context: { title: 'New reply' },
      });

    expect(res.status).toBe(201);
    expect(res.body.results).toEqual([
      { id: 'evt-1', dedupeKey: 'post:1:bob', status: 'queued' },
    ]);
    expect(mockIngestAppNotificationEvents).toHaveBeenCalledWith({
      ownerAccountId: 'alice.testnet',
      appId: 'portal',
      events: [
        {
          recipient: 'bob.testnet',
          actor: 'alice.testnet',
          eventType: 'comment.reply',
          dedupeKey: 'post:1:bob',
          objectId: 'post-1',
          groupId: undefined,
          sourceContract: undefined,
          sourceReceiptId: undefined,
          sourceBlockHeight: undefined,
          createdAt: undefined,
          context: { title: 'New reply' },
        },
      ],
    });
  });

  it('queues batched custom app events', async () => {
    mockEnsureDeveloperApp.mockResolvedValue({});
    mockIngestAppNotificationEvents.mockResolvedValue([
      { id: 'evt-1', dedupeKey: '1', status: 'queued' },
      { id: null, dedupeKey: '2', status: 'duplicate' },
    ]);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt', tier: 'service' })
    )
      .post('/developer/notifications/events')
      .send({
        appId: 'portal',
        events: [
          {
            recipient: 'bob.testnet',
            eventType: 'feed.featured',
            dedupeKey: '1',
          },
          {
            recipient: 'carol.testnet',
            actor: 'system',
            eventType: 'feed.featured',
            dedupeKey: '2',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.results).toHaveLength(2);
  });

  it('requires appId for events (defaults to default)', async () => {
    mockEnsureDeveloperApp.mockResolvedValue({});
    mockIngestAppNotificationEvents.mockResolvedValue([]);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey', tier: 'pro' })
    )
      .post('/developer/notifications/events')
      .send({
        recipient: 'bob.testnet',
        eventType: 'comment.reply',
        dedupeKey: 'k1',
      });

    expect(res.status).toBe(201);
    expect(mockIngestAppNotificationEvents).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'default' })
    );
  });

  it('rejects free-tier from sending events', async () => {
    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey', tier: 'free' })
    )
      .post('/developer/notifications/events')
      .send({
        appId: 'portal',
        recipient: 'bob.testnet',
        eventType: 'comment.reply',
        dedupeKey: 'k1',
      });

    expect(res.status).toBe(403);
  });

  it('returns validation errors from the service', async () => {
    mockEnsureDeveloperApp.mockResolvedValue({});
    mockIngestAppNotificationEvents.mockResolvedValue({
      code: 'INVALID_APP_EVENT',
      message: 'dedupeKey is required for every event',
    });

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey', tier: 'pro' })
    )
      .post('/developer/notifications/events')
      .send({
        appId: 'portal',
        recipient: 'bob.testnet',
        eventType: 'comment.reply',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_APP_EVENT');
  });
});

describe('POST /developer/notifications/read', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks specific ids as read', async () => {
    mockMarkNotificationsRead.mockResolvedValue(2);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt', tier: 'pro' })
    )
      .post('/developer/notifications/read')
      .send({ recipient: 'bob.testnet', appId: 'portal', ids: ['n1', 'n2'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
    expect(mockMarkNotificationsRead).toHaveBeenCalledWith({
      ownerAccountId: 'alice.testnet',
      appId: 'portal',
      recipient: 'bob.testnet',
      ids: ['n1', 'n2'],
      all: false,
    });
  });

  it('supports mark-all reads', async () => {
    mockMarkNotificationsRead.mockResolvedValue(5);

    const res = await request(
      createApp({
        accountId: 'alice.testnet',
        method: 'apikey',
        tier: 'service',
      })
    )
      .post('/developer/notifications/read')
      .send({ recipient: 'bob.testnet', appId: 'portal', all: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 5 });
  });

  it('requires ids or all=true', async () => {
    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt', tier: 'pro' })
    )
      .post('/developer/notifications/read')
      .send({ recipient: 'bob.testnet' });

    expect(res.status).toBe(400);
  });

  it('defaults appId to default for mark-read', async () => {
    mockMarkNotificationsRead.mockResolvedValue(1);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt', tier: 'pro' })
    )
      .post('/developer/notifications/read')
      .send({ recipient: 'bob.testnet', ids: ['n1'] });

    expect(res.status).toBe(200);
    expect(mockMarkNotificationsRead).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'default' })
    );
  });
});

describe('notification rules endpoints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists rules', async () => {
    mockListNotificationRules.mockResolvedValue([{ id: 'rule-1' }]);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey', tier: 'pro' })
    ).get('/developer/notifications/rules');

    expect(res.status).toBe(200);
    expect(res.body.rules).toEqual([{ id: 'rule-1' }]);
  });

  it('creates a recipient rule', async () => {
    mockCreateNotificationRule.mockResolvedValue({
      id: 'rule-1',
      appId: 'portal',
    });

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt', tier: 'pro' })
    )
      .post('/developer/notifications/rules')
      .send({
        appId: 'portal',
        ruleType: 'recipient',
        recipientAccountId: 'bob.testnet',
        notificationTypes: ['reply'],
      });

    expect(res.status).toBe(201);
    expect(mockCreateNotificationRule).toHaveBeenCalledWith({
      ownerAccountId: 'alice.testnet',
      appId: 'portal',
      ruleType: 'recipient',
      recipientAccountId: 'bob.testnet',
      groupId: undefined,
      notificationTypes: ['reply'],
    });
  });
});

describe('notification webhook endpoints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists webhooks', async () => {
    mockListNotificationWebhooks.mockResolvedValue([{ id: 'wh-1' }]);

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'apikey', tier: 'pro' })
    ).get('/developer/notifications/webhooks');

    expect(res.status).toBe(200);
    expect(res.body.webhooks).toEqual([{ id: 'wh-1' }]);
  });

  it('creates a webhook', async () => {
    mockCreateNotificationWebhook.mockResolvedValue({
      id: 'wh-1',
      appId: 'portal',
    });

    const res = await request(
      createApp({ accountId: 'alice.testnet', method: 'jwt', tier: 'pro' })
    )
      .post('/developer/notifications/webhooks')
      .send({ appId: 'portal', url: 'https://example.com/webhook' });

    expect(res.status).toBe(201);
    expect(mockCreateNotificationWebhook).toHaveBeenCalledWith({
      ownerAccountId: 'alice.testnet',
      appId: 'portal',
      url: 'https://example.com/webhook',
    });
  });
});
