/**
 * Tests for RevolutClient — covers:
 *   1. 204 No Content handling (cancelSubscription)
 *   2. Multi-signature webhook verification (secret rotation)
 *   3. Webhook timestamp replay protection (5-minute window)
 */

import { createHmac } from 'crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  RevolutClient,
  type RevolutConfig,
} from '../../src/services/revolut/client.js';

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const TEST_SIGNING_SECRET = 'wsk_test_signing_secret_1234567890';

const baseCfg: RevolutConfig = {
  secretKey: 'sk_test_key',
  publicKey: 'pk_test_key',
  webhookSigningSecret: TEST_SIGNING_SECRET,
  apiUrl: 'https://sandbox-merchant.revolut.com/api',
  apiVersion: '2025-12-04',
};

function computeSignature(
  body: string,
  timestamp: string,
  secret: string = TEST_SIGNING_SECRET
): string {
  const payload = `v1.${timestamp}.${body}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// ── 204 No Content handling ─────────────────────────────────────────────────

describe('RevolutClient: 204 No Content handling', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('handles 204 No Content from cancelSubscription without crashing', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 204, statusText: 'No Content' })
    );

    const client = new RevolutClient(baseCfg);
    // Should NOT throw
    await expect(client.cancelSubscription('sub-123')).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain('/subscriptions/sub-123/cancel');
  });

  it('still parses JSON for non-204 responses', async () => {
    const orderData = {
      id: 'order-1',
      state: 'completed',
      checkout_url: 'https://example.com',
    };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(orderData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = new RevolutClient(baseCfg);
    const result = await client.getOrder('order-1');
    expect(result.id).toBe('order-1');
    expect(result.state).toBe('completed');
  });
});

// ── Webhook signature verification ─────────────────────────────────────────

describe('RevolutClient: webhook signature verification', () => {
  const client = new RevolutClient(baseCfg);
  const body = '{"event":"ORDER_COMPLETED","order_id":"abc-123"}';

  it('accepts a valid single signature', () => {
    const ts = Date.now().toString();
    const sig = computeSignature(body, ts);
    expect(client.verifyWebhookSignature(body, `v1=${sig}`, ts)).toBe(true);
  });

  it('rejects an invalid single signature', () => {
    const ts = Date.now().toString();
    expect(
      client.verifyWebhookSignature(
        body,
        'v1=0000000000000000000000000000000000000000000000000000000000000000',
        ts
      )
    ).toBe(false);
  });

  it('rejects a malformed signature header', () => {
    const ts = Date.now().toString();
    expect(client.verifyWebhookSignature(body, 'invalid', ts)).toBe(false);
  });

  // --- Multi-signature (secret rotation) ---

  it('accepts when one of multiple comma-separated signatures matches', () => {
    const ts = Date.now().toString();
    const validSig = computeSignature(body, ts);
    const oldSig = computeSignature(body, ts, 'wsk_old_rotated_secret');
    const header = `v1=${oldSig},v1=${validSig}`;

    expect(client.verifyWebhookSignature(body, header, ts)).toBe(true);
  });

  it('accepts when valid signature is first in multi-signature header', () => {
    const ts = Date.now().toString();
    const validSig = computeSignature(body, ts);
    const oldSig = computeSignature(body, ts, 'wsk_old_rotated_secret');
    const header = `v1=${validSig},v1=${oldSig}`;

    expect(client.verifyWebhookSignature(body, header, ts)).toBe(true);
  });

  it('rejects when no comma-separated signatures match', () => {
    const ts = Date.now().toString();
    const sig1 = computeSignature(body, ts, 'wsk_wrong_secret_1');
    const sig2 = computeSignature(body, ts, 'wsk_wrong_secret_2');
    const header = `v1=${sig1},v1=${sig2}`;

    expect(client.verifyWebhookSignature(body, header, ts)).toBe(false);
  });

  it('handles whitespace around comma-separated signatures', () => {
    const ts = Date.now().toString();
    const validSig = computeSignature(body, ts);
    const oldSig = computeSignature(body, ts, 'wsk_old_rotated_secret');
    const header = `v1=${oldSig} , v1=${validSig}`;

    expect(client.verifyWebhookSignature(body, header, ts)).toBe(true);
  });

  // --- Timestamp replay protection ---

  it('rejects a timestamp older than 5 minutes', () => {
    const staleTs = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
    const sig = computeSignature(body, staleTs);

    expect(client.verifyWebhookSignature(body, `v1=${sig}`, staleTs)).toBe(
      false
    );
  });

  it('rejects a timestamp far in the future (>5 min)', () => {
    const futureTs = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes ahead
    const sig = computeSignature(body, futureTs);

    expect(client.verifyWebhookSignature(body, `v1=${sig}`, futureTs)).toBe(
      false
    );
  });

  it('accepts a timestamp within 5-minute window', () => {
    const recentTs = (Date.now() - 2 * 60 * 1000).toString(); // 2 minutes ago
    const sig = computeSignature(body, recentTs);

    expect(client.verifyWebhookSignature(body, `v1=${sig}`, recentTs)).toBe(
      true
    );
  });

  it('accepts a timestamp at the edge of the window (exactly 5 minutes)', () => {
    // 4m59s ago — should still be within tolerance
    const edgeTs = (Date.now() - 4 * 60 * 1000 - 59 * 1000).toString();
    const sig = computeSignature(body, edgeTs);

    expect(client.verifyWebhookSignature(body, `v1=${sig}`, edgeTs)).toBe(true);
  });

  it('rejects a non-numeric timestamp', () => {
    const sig = computeSignature(body, 'not-a-number');

    expect(
      client.verifyWebhookSignature(body, `v1=${sig}`, 'not-a-number')
    ).toBe(false);
  });
});
