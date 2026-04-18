// ---------------------------------------------------------------------------
// Integration: Webhooks — CRUD, default appId, signing secret, lifecycle
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getClient, testId, ACCOUNT_ID } from './helpers.js';
import type { OnSocial } from '../../src/client.js';
import { verifyWebhookSignature } from '../../src/webhooks.js';

describe('webhooks', () => {
  let os: OnSocial;
  /** Track webhook IDs created during tests for cleanup. */
  const createdWebhookIds: string[] = [];

  beforeAll(async () => {
    os = await getClient();
  });

  afterAll(async () => {
    // Best-effort cleanup of any webhooks created during tests
    for (const id of createdWebhookIds) {
      try {
        await os.webhooks.delete(id);
      } catch {
        // already deleted or test failure — ignore
      }
    }
  });

  // ── Create ────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a webhook endpoint', async () => {
      const webhook = await os.webhooks.create({
        url: 'https://httpbin.org/post',
      });

      expect(webhook.id).toBeTruthy();
      expect(typeof webhook.id).toBe('string');
      expect(webhook.url).toBe('https://httpbin.org/post');
      expect(webhook.signingSecret).toBeTruthy();
      expect(typeof webhook.signingSecret).toBe('string');
      expect(webhook.active).toBe(true);
      expect(webhook.ownerAccountId).toBeTruthy();
      expect(webhook.appId).toBe('default');
      expect(webhook.createdAt).toBeTruthy();

      createdWebhookIds.push(webhook.id);
    });

    it('should create a webhook with explicit appId', async () => {
      const webhook = await os.webhooks.create({
        appId: 'default',
        url: 'https://httpbin.org/post',
      });

      expect(webhook.id).toBeTruthy();
      expect(webhook.appId).toBe('default');

      createdWebhookIds.push(webhook.id);
    });

    it('should create multiple webhooks with different URLs', async () => {
      const urlA = `https://httpbin.org/post?tag=a-${testId()}`;
      const urlB = `https://httpbin.org/post?tag=b-${testId()}`;

      const [webhookA, webhookB] = await Promise.all([
        os.webhooks.create({ url: urlA }),
        os.webhooks.create({ url: urlB }),
      ]);

      expect(webhookA.id).not.toBe(webhookB.id);
      expect(webhookA.url).toBe(urlA);
      expect(webhookB.url).toBe(urlB);

      // Each webhook gets a unique signing secret
      expect(webhookA.signingSecret).not.toBe(webhookB.signingSecret);

      createdWebhookIds.push(webhookA.id, webhookB.id);
    });

    it('should return a usable signing secret', async () => {
      const webhook = await os.webhooks.create({
        url: 'https://httpbin.org/post',
      });
      createdWebhookIds.push(webhook.id);

      // The signing secret should work with verifyWebhookSignature
      const body = JSON.stringify({
        event: 'notification.created',
        notification: { id: '1', recipient: ACCOUNT_ID },
      });
      const timestamp = new Date().toISOString();

      // Compute expected HMAC
      const { createHmac } = await import('node:crypto');
      const expectedSig = createHmac('sha256', webhook.signingSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex');

      const valid = verifyWebhookSignature({
        body,
        signature: expectedSig,
        timestamp,
        secret: webhook.signingSecret,
      });
      expect(valid).toBe(true);
    });
  });

  // ── List ──────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should list all webhooks for the account', async () => {
      const webhooks = await os.webhooks.list();
      expect(webhooks).toBeInstanceOf(Array);
      // We created some above, so there should be at least one
      expect(webhooks.length).toBeGreaterThan(0);
    });

    it('should include webhook shape in listed results', async () => {
      const webhooks = await os.webhooks.list();
      if (webhooks.length > 0) {
        const w = webhooks[0];
        expect(w).toHaveProperty('id');
        expect(w).toHaveProperty('ownerAccountId');
        expect(w).toHaveProperty('appId');
        expect(w).toHaveProperty('url');
        expect(w).toHaveProperty('signingSecret');
        expect(w).toHaveProperty('active');
        expect(w).toHaveProperty('createdAt');
      }
    });

    it('should include newly created webhooks in the list', async () => {
      const tag = testId();
      const url = `https://httpbin.org/post?list-check=${tag}`;
      const webhook = await os.webhooks.create({ url });
      createdWebhookIds.push(webhook.id);

      const webhooks = await os.webhooks.list();
      const found = webhooks.find((w) => w.id === webhook.id);
      expect(found).toBeTruthy();
      expect(found!.url).toBe(url);
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a webhook by ID', async () => {
      const webhook = await os.webhooks.create({
        url: 'https://httpbin.org/post',
      });

      // Confirm it exists
      let webhooks = await os.webhooks.list();
      expect(webhooks.some((w) => w.id === webhook.id)).toBe(true);

      // Delete it
      await os.webhooks.delete(webhook.id);

      // Confirm it's gone
      webhooks = await os.webhooks.list();
      expect(webhooks.some((w) => w.id === webhook.id)).toBe(false);
    });

    it('should throw on deleting a non-existent webhook', async () => {
      await expect(
        os.webhooks.delete('non-existent-webhook-id')
      ).rejects.toThrow();
    });
  });

  // ── Full lifecycle ────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should handle create → list → verify → delete flow', async () => {
      // 1. Create
      const webhook = await os.webhooks.create({
        url: `https://httpbin.org/post?lifecycle=${testId()}`,
      });
      expect(webhook.id).toBeTruthy();

      // 2. List & verify present
      let webhooks = await os.webhooks.list();
      expect(webhooks.some((w) => w.id === webhook.id)).toBe(true);

      // 3. Verify signing secret is functional
      const body = '{"test":true}';
      const timestamp = new Date().toISOString();
      const { createHmac } = await import('node:crypto');
      const sig = createHmac('sha256', webhook.signingSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex');
      expect(
        verifyWebhookSignature({
          body,
          signature: sig,
          timestamp,
          secret: webhook.signingSecret,
        })
      ).toBe(true);

      // 4. Delete
      await os.webhooks.delete(webhook.id);

      // 5. Confirm removed
      webhooks = await os.webhooks.list();
      expect(webhooks.some((w) => w.id === webhook.id)).toBe(false);
    });
  });

  // ── Default appId behaviour ───────────────────────────────────────────

  describe('default appId', () => {
    it('should use default appId when omitted from create', async () => {
      const webhook = await os.webhooks.create({
        url: 'https://httpbin.org/post',
      });
      expect(webhook.appId).toBe('default');
      createdWebhookIds.push(webhook.id);
    });

    it('should match explicitly-set default appId', async () => {
      const webhookImplicit = await os.webhooks.create({
        url: `https://httpbin.org/post?implicit=${testId()}`,
      });
      const webhookExplicit = await os.webhooks.create({
        appId: 'default',
        url: `https://httpbin.org/post?explicit=${testId()}`,
      });

      expect(webhookImplicit.appId).toBe(webhookExplicit.appId);

      createdWebhookIds.push(webhookImplicit.id, webhookExplicit.id);
    });
  });
});
