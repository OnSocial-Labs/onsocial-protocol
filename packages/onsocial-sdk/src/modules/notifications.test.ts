import { describe, expect, it, vi } from 'vitest';
import { NotificationsModule } from './notifications.js';
import type { HttpClient } from '../internal/http.js';

function makeHttp(responses: {
  get?: Record<string, unknown>;
  post?: Record<string, unknown>;
  del?: Record<string, unknown>;
}) {
  const get = vi.fn(async (path: string, ..._rest: unknown[]) => {
    void _rest;
    const key = path.split('?')[0]!;
    return responses.get?.[key] ?? responses.get?.[path] ?? {};
  });
  const post = vi.fn(async (path: string, ..._rest: unknown[]) => {
    void _rest;
    return responses.post?.[path] ?? {};
  });
  const del = vi.fn(async (path: string, ..._rest: unknown[]) => {
    void _rest;
    return responses.del?.[path] ?? {};
  });
  return {
    spies: { get, post, del },
    http: { get, post, delete: del } as unknown as HttpClient,
  };
}

describe('NotificationsModule.list', () => {
  it('builds query string with all params, defaults appId to "default"', async () => {
    const { http, spies } = makeHttp({
      get: {
        '/developer/notifications': {
          notifications: [],
          nextCursor: null,
        },
      },
    });
    const m = new NotificationsModule(http);
    await m.list({
      recipient: 'alice.near',
      limit: 25,
      cursor: 'c1',
      read: false,
      type: 'standing',
      eventType: 'app_event',
    });
    const url = spies.get.mock.calls[0]![0] as string;
    expect(url.startsWith('/developer/notifications?')).toBe(true);
    expect(url).toContain('appId=default');
    expect(url).toContain('recipient=alice.near');
    expect(url).toContain('limit=25');
    expect(url).toContain('cursor=c1');
    expect(url).toContain('read=false');
    expect(url).toContain('type=standing');
    expect(url).toContain('eventType=app_event');
  });

  it('uses constructor appId when no override given', async () => {
    const { http, spies } = makeHttp({
      get: {
        '/developer/notifications': { notifications: [], nextCursor: null },
      },
    });
    const m = new NotificationsModule(http, 'my-app');
    await m.list({ recipient: 'alice.near' });
    expect(spies.get.mock.calls[0]![0]).toContain('appId=my-app');
  });

  it('per-call appId overrides default', async () => {
    const { http, spies } = makeHttp({
      get: {
        '/developer/notifications': { notifications: [], nextCursor: null },
      },
    });
    const m = new NotificationsModule(http, 'my-app');
    await m.list({ recipient: 'alice.near', appId: 'other' });
    expect(spies.get.mock.calls[0]![0]).toContain('appId=other');
  });
});

describe('NotificationsModule.unreadCount', () => {
  it('returns the unread number from the response', async () => {
    const { http } = makeHttp({
      get: {
        '/developer/notifications/count': {
          recipient: 'alice.near',
          unread: 7,
        },
      },
    });
    const m = new NotificationsModule(http);
    expect(await m.unreadCount('alice.near')).toBe(7);
  });

  it('forwards eventType in query string when provided', async () => {
    const { http, spies } = makeHttp({
      get: {
        '/developer/notifications/count': {
          recipient: 'alice.near',
          unread: 0,
        },
      },
    });
    const m = new NotificationsModule(http);
    await m.unreadCount('alice.near', { eventType: 'mention' });
    expect(spies.get.mock.calls[0]![0]).toContain('eventType=mention');
  });
});

describe('NotificationsModule.markRead', () => {
  it('posts ids and returns updated count', async () => {
    const { http, spies } = makeHttp({
      post: { '/developer/notifications/read': { updated: 3 } },
    });
    const m = new NotificationsModule(http);
    const updated = await m.markRead('alice.near', { ids: ['n1', 'n2', 'n3'] });
    expect(updated).toBe(3);
    expect(spies.post.mock.calls[0]![1]).toEqual({
      appId: 'default',
      recipient: 'alice.near',
      ids: ['n1', 'n2', 'n3'],
      all: undefined,
    });
  });

  it('supports all=true', async () => {
    const { http, spies } = makeHttp({
      post: { '/developer/notifications/read': { updated: 42 } },
    });
    const m = new NotificationsModule(http);
    const updated = await m.markRead('alice.near', { all: true });
    expect(updated).toBe(42);
    expect((spies.post.mock.calls[0]![1] as { all: boolean }).all).toBe(true);
  });
});

describe('NotificationsModule.sendEvents', () => {
  it('posts events and returns results array', async () => {
    const { http, spies } = makeHttp({
      post: {
        '/developer/notifications/events': {
          results: [{ id: 'n1' }, { id: 'n2' }],
        },
      },
    });
    const m = new NotificationsModule(http, 'my-app');
    const events = [
      {
        recipient: 'a.near',
        eventType: 'mention',
        dedupeKey: 'k1',
        sourceContract: 'custom-dapp',
        sourceReceiptId: 'receipt-1',
        sourceBlockHeight: 123,
        createdAt: '2026-05-15T00:00:00.000Z',
      },
      { recipient: 'b.near', eventType: 'reply', dedupeKey: 'k2' },
    ];
    const results = await m.sendEvents({ events });
    expect(results).toHaveLength(2);
    expect(spies.post.mock.calls[0]![1]).toEqual({ appId: 'my-app', events });
  });
});

describe('NotificationsModule.rules', () => {
  it('listRules returns rules array', async () => {
    const { http } = makeHttp({
      get: {
        '/developer/notifications/rules': {
          rules: [
            {
              id: 'r1',
              ownerAccountId: 'alice.near',
              appId: 'default',
              ruleType: 'recipient',
              recipientAccountId: 'alice.near',
              groupId: null,
              notificationTypes: null,
              createdAt: 't',
            },
          ],
        },
      },
    });
    const m = new NotificationsModule(http);
    const rules = await m.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe('r1');
  });

  it('createRule forwards appId default', async () => {
    const { http, spies } = makeHttp({
      post: {
        '/developer/notifications/rules': {
          rule: {
            id: 'r2',
            ownerAccountId: 'alice.near',
            appId: 'default',
            ruleType: 'recipient',
            recipientAccountId: 'alice.near',
            groupId: null,
            notificationTypes: null,
            createdAt: 't',
          },
        },
      },
    });
    const m = new NotificationsModule(http);
    const rule = await m.createRule({
      ruleType: 'recipient',
      recipientAccountId: 'alice.near',
    });
    expect(rule.id).toBe('r2');
    expect((spies.post.mock.calls[0]![1] as { appId: string }).appId).toBe(
      'default'
    );
  });

  it('deleteRule hits DELETE endpoint', async () => {
    const { http, spies } = makeHttp({
      del: { '/developer/notifications/rules/r1': { status: 'ok' } },
    });
    const m = new NotificationsModule(http);
    await m.deleteRule('r1');
    expect(spies.del.mock.calls[0]![0]).toBe(
      '/developer/notifications/rules/r1'
    );
  });
});

describe('NotificationsModule.types', () => {
  it('returns the types array', async () => {
    const { http } = makeHttp({
      get: {
        '/developer/notifications/types': { types: ['mention', 'standing'] },
      },
    });
    const m = new NotificationsModule(http);
    expect(await m.types()).toEqual(['mention', 'standing']);
  });
});
