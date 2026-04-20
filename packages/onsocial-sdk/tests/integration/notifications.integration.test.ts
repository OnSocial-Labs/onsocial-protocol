// ---------------------------------------------------------------------------
// Integration: Notifications — send events, list, count, mark-read, rules
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { getClient, testId, confirmIndexed, ACCOUNT_ID } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('notifications', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getClient();
  });

  // ── Types ───────────────────────────────────────────────────────────────

  it('should list available notification types', async () => {
    const types = await os.notifications.types();
    expect(types).toBeInstanceOf(Array);
    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain('app_event');
  });

  // ── Send custom events ────────────────────────────────────────────────

  describe('send events', () => {
    it('should send a single custom notification event', async () => {
      const eventId = testId();

      const results = await os.notifications.sendEvents({
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: `integ:${eventId}`,
            actor: 'system',
            objectId: eventId,
            context: { source: 'sdk-integration-test' },
          },
        ],
      });
      expect(results).toBeInstanceOf(Array);
      expect(results).toHaveLength(1);
    });

    it('should send a batch of multiple events', async () => {
      const batchId = testId();
      const results = await os.notifications.sendEvents({
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: `batch-a:${batchId}`,
            actor: 'system',
          },
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: `batch-b:${batchId}`,
            actor: 'system',
          },
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: `batch-c:${batchId}`,
            actor: 'system',
          },
        ],
      });
      expect(results).toBeInstanceOf(Array);
      expect(results).toHaveLength(3);
    });

    it('should send events with explicit appId', async () => {
      const results = await os.notifications.sendEvents({
        appId: 'default',
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: `explicit-app:${testId()}`,
            actor: 'system',
          },
        ],
      });
      expect(results).toBeInstanceOf(Array);
      expect(results).toHaveLength(1);
    });

    it('should send events with rich context', async () => {
      const results = await os.notifications.sendEvents({
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: `ctx:${testId()}`,
            actor: 'alice.testnet',
            objectId: 'post-123',
            groupId: 'group-456',
            context: {
              action: 'replied',
              preview: 'Great post!',
              nested: { depth: 1 },
            },
          },
        ],
      });
      expect(results).toHaveLength(1);
    });
  });

  // ── List & count ──────────────────────────────────────────────────────

  describe('list & count', () => {
    it('should see the notification in the list', async () => {
      const eventId = testId();

      await os.notifications.sendEvents({
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: `integ:${eventId}`,
            actor: 'system',
            objectId: eventId,
            context: { source: 'sdk-integration-test' },
          },
        ],
      });

      const result = await confirmIndexed(
        async () => {
          const res = await os.notifications.list({
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            limit: 5,
          });
          const match = res.notifications.find(
            (n) =>
              n.type === 'app_event' &&
              n.context?.source === 'sdk-integration-test' &&
              n.dedupeKey === `integ:${eventId}:${ACCOUNT_ID}`
          );
          return match ? res : null;
        },
        'notification in list',
        { timeoutMs: 60_000, intervalMs: 3_000 }
      );
      expect(result!.notifications.length).toBeGreaterThan(0);
    }, 65_000);

    it('should list with explicit appId', async () => {
      const result = await os.notifications.list({
        appId: 'default',
        recipient: ACCOUNT_ID,
        limit: 5,
      });
      expect(result).toHaveProperty('notifications');
      expect(result).toHaveProperty('nextCursor');
      expect(result.notifications).toBeInstanceOf(Array);
    });

    it('should return notification shape correctly', async () => {
      const { notifications } = await os.notifications.list({
        recipient: ACCOUNT_ID,
        limit: 1,
      });
      if (notifications.length > 0) {
        const n = notifications[0];
        expect(n).toHaveProperty('id');
        expect(n).toHaveProperty('recipient');
        expect(n).toHaveProperty('type');
        expect(n).toHaveProperty('read');
        expect(n).toHaveProperty('createdAt');
        expect(n).toHaveProperty('source');
        expect(typeof n.read).toBe('boolean');
      }
    });

    it('should filter by read status', async () => {
      const unreadResult = await os.notifications.list({
        recipient: ACCOUNT_ID,
        read: false,
        limit: 50,
      });
      for (const n of unreadResult.notifications) {
        expect(n.read).toBe(false);
      }
    });

    it('should filter by event type', async () => {
      const result = await os.notifications.list({
        recipient: ACCOUNT_ID,
        eventType: 'integration_test',
        limit: 10,
      });
      // All results should be app_event type with integration_test eventType
      expect(result.notifications).toBeInstanceOf(Array);
    });

    it('should respect limit parameter', async () => {
      const result = await os.notifications.list({
        recipient: ACCOUNT_ID,
        limit: 2,
      });
      expect(result.notifications.length).toBeLessThanOrEqual(2);
    });

    it('should support cursor-based pagination', async () => {
      const page1 = await os.notifications.list({
        recipient: ACCOUNT_ID,
        limit: 2,
      });

      if (page1.nextCursor) {
        const page2 = await os.notifications.list({
          recipient: ACCOUNT_ID,
          limit: 2,
          cursor: page1.nextCursor,
        });
        expect(page2.notifications).toBeInstanceOf(Array);
        // Pages should not overlap
        const ids1 = new Set(page1.notifications.map((n) => n.id));
        for (const n of page2.notifications) {
          expect(ids1.has(n.id)).toBe(false);
        }
      }
    });

    it('should report unread count >= 0', async () => {
      const count = await os.notifications.unreadCount(ACCOUNT_ID);
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should report unread count with explicit appId', async () => {
      const count = await os.notifications.unreadCount(ACCOUNT_ID, {
        appId: 'default',
      });
      expect(typeof count).toBe('number');
    });

    it('should report unread count filtered by eventType', async () => {
      const count = await os.notifications.unreadCount(ACCOUNT_ID, {
        eventType: 'integration_test',
      });
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Mark read ─────────────────────────────────────────────────────────

  describe('mark read', () => {
    it('should mark specific notifications as read by ids', async () => {
      // Get some unread notifications first
      const { notifications } = await os.notifications.list({
        recipient: ACCOUNT_ID,
        read: false,
        limit: 2,
      });

      if (notifications.length > 0) {
        const ids = notifications.map((n) => n.id);
        const updated = await os.notifications.markRead(ACCOUNT_ID, { ids });
        expect(updated).toBeGreaterThanOrEqual(1);
        expect(updated).toBeLessThanOrEqual(ids.length);
      }
    });

    it('should mark all notifications as read', async () => {
      const updated = await os.notifications.markRead(ACCOUNT_ID, {
        all: true,
      });
      expect(updated).toBeGreaterThanOrEqual(0);

      // Verify unread count is now 0
      const count = await os.notifications.unreadCount(ACCOUNT_ID);
      expect(count).toBe(0);
    });

    it('should mark read with explicit appId', async () => {
      const updated = await os.notifications.markRead(ACCOUNT_ID, {
        all: true,
        appId: 'default',
      });
      expect(typeof updated).toBe('number');
    });
  });

  // ── Rules CRUD ────────────────────────────────────────────────────────

  describe('rules', () => {
    let ruleId: string;

    it('should create a recipient-type notification rule', async () => {
      const rule = await os.notifications.createRule({
        ruleType: 'recipient',
        recipientAccountId: ACCOUNT_ID,
        notificationTypes: ['app_event'],
      });
      expect(rule.id).toBeTruthy();
      expect(rule.ruleType).toBe('recipient');
      expect(rule.recipientAccountId).toBe(ACCOUNT_ID);
      expect(rule.notificationTypes).toContain('app_event');
      expect(rule.ownerAccountId).toBeTruthy();
      expect(rule.appId).toBe('default');
      expect(rule.createdAt).toBeTruthy();
      ruleId = rule.id;
    });

    it('should create a rule with explicit appId', async () => {
      const rule = await os.notifications.createRule({
        appId: 'default',
        ruleType: 'recipient',
        recipientAccountId: ACCOUNT_ID,
        notificationTypes: ['app_event'],
      });
      expect(rule.appId).toBe('default');
      // Clean up
      await os.notifications.deleteRule(rule.id);
    });

    it('should create a group-type notification rule', async () => {
      const groupId = `test-group-${testId()}`;
      const rule = await os.notifications.createRule({
        ruleType: 'group',
        groupId,
        notificationTypes: ['app_event'],
      });
      expect(rule.id).toBeTruthy();
      expect(rule.ruleType).toBe('group');
      expect(rule.groupId).toBe(groupId);
      // Clean up
      await os.notifications.deleteRule(rule.id);
    });

    it('should list rules including the new one', async () => {
      const rules = await os.notifications.listRules();
      expect(rules).toBeInstanceOf(Array);
      expect(rules.some((r) => r.id === ruleId)).toBe(true);
    });

    it('should include correct shape in listed rules', async () => {
      const rules = await os.notifications.listRules();
      if (rules.length > 0) {
        const r = rules[0];
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('ownerAccountId');
        expect(r).toHaveProperty('appId');
        expect(r).toHaveProperty('ruleType');
        expect(r).toHaveProperty('createdAt');
      }
    });

    it('should delete the rule', async () => {
      await os.notifications.deleteRule(ruleId);
      const rules = await os.notifications.listRules();
      expect(rules.some((r) => r.id === ruleId)).toBe(false);
    });
  });

  // ── Dedup idempotency ─────────────────────────────────────────────────

  describe('deduplication', () => {
    it('should deduplicate events with the same key', async () => {
      const dedupeKey = `dedup:${testId()}`;
      const fullKey = `${dedupeKey}:${ACCOUNT_ID}`;

      // Send twice with the same dedupeKey
      await os.notifications.sendEvents({
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey,
            actor: 'system',
          },
        ],
      });
      await os.notifications.sendEvents({
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey,
            actor: 'system',
          },
        ],
      });

      // Wait for the worker to pick up events
      const result = await confirmIndexed(
        async () => {
          const res = await os.notifications.list({
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            limit: 50,
          });
          return res.notifications.find((n) => n.dedupeKey === fullKey)
            ? res
            : null;
        },
        'dedup notification',
        { timeoutMs: 35_000, intervalMs: 3_000 }
      );
      const matches = result!.notifications.filter(
        (n) => n.dedupeKey === fullKey
      );
      expect(matches).toHaveLength(1);
    }, 40_000);

    it('should not deduplicate events with different keys', async () => {
      const baseId = testId();
      const keyA = `no-dedup-a:${baseId}`;
      const keyB = `no-dedup-b:${baseId}`;
      const fullKeyA = `${keyA}:${ACCOUNT_ID}`;
      const fullKeyB = `${keyB}:${ACCOUNT_ID}`;

      await os.notifications.sendEvents({
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: keyA,
            actor: 'system',
          },
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: keyB,
            actor: 'system',
          },
        ],
      });

      const result = await confirmIndexed(
        async () => {
          const res = await os.notifications.list({
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            limit: 50,
          });
          const matchA = res.notifications.find(
            (n) => n.dedupeKey === fullKeyA
          );
          const matchB = res.notifications.find(
            (n) => n.dedupeKey === fullKeyB
          );
          return matchA && matchB ? res : null;
        },
        'distinct events',
        { timeoutMs: 35_000, intervalMs: 3_000 }
      );

      const matchesA = result!.notifications.filter(
        (n) => n.dedupeKey === fullKeyA
      );
      const matchesB = result!.notifications.filter(
        (n) => n.dedupeKey === fullKeyB
      );
      expect(matchesA).toHaveLength(1);
      expect(matchesB).toHaveLength(1);
    }, 40_000);
  });

  // ── Default appId behaviour ───────────────────────────────────────────

  describe('default appId', () => {
    it('should use default appId when omitted from sendEvents', async () => {
      const key = `default-app:${testId()}`;
      const fullKey = `${key}:${ACCOUNT_ID}`;

      await os.notifications.sendEvents({
        // no appId specified — should default to 'default'
        events: [
          {
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            dedupeKey: key,
            actor: 'system',
          },
        ],
      });

      const result = await confirmIndexed(
        async () => {
          const res = await os.notifications.list({
            appId: 'default',
            recipient: ACCOUNT_ID,
            eventType: 'integration_test',
            limit: 50,
          });
          return res.notifications.find((n) => n.dedupeKey === fullKey)
            ? res
            : null;
        },
        'default appId event',
        {
          timeoutMs: 30_000,
          intervalMs: 3_000,
        }
      );

      const match = result!.notifications.find((n) => n.dedupeKey === fullKey);
      expect(match).toBeTruthy();
    }, 35_000);

    it('should use default appId when omitted from list', async () => {
      // Omitting appId should list from 'default' namespace
      const result = await os.notifications.list({
        recipient: ACCOUNT_ID,
        limit: 5,
      });
      expect(result).toHaveProperty('notifications');
      expect(result.notifications).toBeInstanceOf(Array);
    });

    it('should use default appId when omitted from unreadCount', async () => {
      const count = await os.notifications.unreadCount(ACCOUNT_ID);
      expect(typeof count).toBe('number');
    });

    it('should use default appId when omitted from markRead', async () => {
      const updated = await os.notifications.markRead(ACCOUNT_ID, {
        all: true,
      });
      expect(typeof updated).toBe('number');
    });

    it('should use default appId when omitted from createRule', async () => {
      const rule = await os.notifications.createRule({
        ruleType: 'recipient',
        recipientAccountId: ACCOUNT_ID,
        notificationTypes: ['app_event'],
      });
      expect(rule.appId).toBe('default');
      await os.notifications.deleteRule(rule.id);
    });
  });
});
