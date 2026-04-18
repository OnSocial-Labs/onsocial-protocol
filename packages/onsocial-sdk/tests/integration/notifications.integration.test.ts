// ---------------------------------------------------------------------------
// Integration: Notifications — send events, list, count, mark-read, rules, webhooks
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getClient, testId, waitFor, ACCOUNT_ID } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('notifications', () => {
  let os: OnSocial;
  const appId = 'default';
  const eventId = testId();

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

  it('should send a custom notification event', async () => {
    const results = await os.notifications.sendEvents({
      appId,
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

  // ── List & count ──────────────────────────────────────────────────────

  it('should see the notification in the list', async () => {
    const { notifications } = await waitFor(
      async () => {
        const result = await os.notifications.list({
          appId,
          recipient: ACCOUNT_ID,
          eventType: 'integration_test',
          limit: 5,
        });
        const match = result.notifications.find(
          (n) =>
            n.type === 'app_event' &&
            n.context?.source === 'sdk-integration-test' &&
            n.dedupeKey === `integ:${eventId}:${ACCOUNT_ID}`
        );
        return match ? result : null;
      },
      { timeoutMs: 30_000, intervalMs: 3_000, label: 'notification in list' }
    );
    expect(notifications.length).toBeGreaterThan(0);
  }, 35_000);

  it('should report unread count > 0', async () => {
    const count = await os.notifications.unreadCount(ACCOUNT_ID);
    expect(count).toBeGreaterThanOrEqual(1);
  }, 10_000);

  // ── Mark read ─────────────────────────────────────────────────────────

  it('should mark all notifications as read', async () => {
    const updated = await os.notifications.markRead(ACCOUNT_ID, {
      all: true,
    });
    expect(updated).toBeGreaterThanOrEqual(1);

    // Verify unread count is now 0
    const count = await os.notifications.unreadCount(ACCOUNT_ID);
    expect(count).toBe(0);
  }, 10_000);

  // ── Rules CRUD ────────────────────────────────────────────────────────

  describe('rules', () => {
    let ruleId: string;

    it('should create a notification rule', async () => {
      const rule = await os.notifications.createRule({
        appId,
        ruleType: 'recipient',
        recipientAccountId: ACCOUNT_ID,
        notificationTypes: ['app_event'],
      });
      expect(rule.id).toBeTruthy();
      expect(rule.ruleType).toBe('recipient');
      ruleId = rule.id;
    });

    it('should list rules including the new one', async () => {
      const rules = await os.notifications.listRules();
      expect(rules.some((r) => r.id === ruleId)).toBe(true);
    });

    it('should delete the rule', async () => {
      await os.notifications.deleteRule(ruleId);
      const rules = await os.notifications.listRules();
      expect(rules.some((r) => r.id === ruleId)).toBe(false);
    });
  });

  // ── Webhooks CRUD ─────────────────────────────────────────────────────

  describe('webhooks', () => {
    let webhookId: string;

    it('should create a webhook endpoint', async () => {
      const webhook = await os.webhooks.create({
        appId,
        url: 'https://httpbin.org/post',
      });
      expect(webhook.id).toBeTruthy();
      expect(webhook.signingSecret).toBeTruthy();
      expect(webhook.url).toBe('https://httpbin.org/post');
      webhookId = webhook.id;
    });

    it('should list webhooks including the new one', async () => {
      const webhooks = await os.webhooks.list();
      expect(webhooks.some((w) => w.id === webhookId)).toBe(true);
    });

    it('should delete the webhook', async () => {
      await os.webhooks.delete(webhookId);
      const webhooks = await os.webhooks.list();
      expect(webhooks.some((w) => w.id === webhookId)).toBe(false);
    });
  });

  // ── Dedup idempotency ─────────────────────────────────────────────────

  it('should deduplicate events with the same key', async () => {
    const dedupeKey = `dedup:${testId()}`;
    const fullKey = `${dedupeKey}:${ACCOUNT_ID}`;

    // Send twice with the same dedupeKey
    await os.notifications.sendEvents({
      appId,
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
      appId,
      events: [
        {
          recipient: ACCOUNT_ID,
          eventType: 'integration_test',
          dedupeKey,
          actor: 'system',
        },
      ],
    });

    // Wait for the worker to pick up events (polls every ~15s)
    const { notifications } = await waitFor(
      async () => {
        const result = await os.notifications.list({
          appId,
          recipient: ACCOUNT_ID,
          eventType: 'integration_test',
          limit: 50,
        });
        const match = result.notifications.find((n) => n.dedupeKey === fullKey);
        return match ? result : null;
      },
      { timeoutMs: 35_000, intervalMs: 3_000, label: 'dedup notification' }
    );
    const matches = notifications.filter((n) => n.dedupeKey === fullKey);
    expect(matches).toHaveLength(1);
  }, 40_000);
});
