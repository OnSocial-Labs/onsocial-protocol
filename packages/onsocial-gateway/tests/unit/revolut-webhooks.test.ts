import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetRevolutClient = vi.fn(async () => ({
  verifyWebhookSignature: mockVerifyWebhookSignature,
  getOrder: mockGetOrder,
  getSubscriptionCycles: mockGetSubscriptionCycles,
}));
const mockVerifyWebhookSignature = vi.fn();
const mockGetOrder = vi.fn();
const mockGetSubscriptionCycles = vi.fn();
const mockGetByAccount = vi.fn();
const mockFindBySetupOrderId = vi.fn();
const mockListActiveWithRevolutSub = vi.fn();
const mockUpdatePeriod = vi.fn();
const mockUpdateStatus = vi.fn();
const mockDecrementPromoCycles = vi.fn();
const mockUpdateAccountTier = vi.fn();
const mockClearTierCache = vi.fn();

vi.mock('../../src/config/index.js', () => ({
  config: {
    getRevolutClient: (...args: unknown[]) => mockGetRevolutClient(...args),
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/services/revolut/index.js', () => ({
  subscriptionStore: {
    getByAccount: (...args: unknown[]) => mockGetByAccount(...args),
    findBySetupOrderId: (...args: unknown[]) => mockFindBySetupOrderId(...args),
    listActiveWithRevolutSub: (...args: unknown[]) =>
      mockListActiveWithRevolutSub(...args),
    updatePeriod: (...args: unknown[]) => mockUpdatePeriod(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    decrementPromoCycles: (...args: unknown[]) =>
      mockDecrementPromoCycles(...args),
  },
}));

vi.mock('../../src/services/revolut/plans.js', () => ({
  getPlan: vi.fn((tier: string) => {
    if (tier === 'pro') {
      return {
        tier: 'pro',
        interval: 'month',
        intervalCount: 1,
      };
    }
    if (tier === 'scale') {
      return {
        tier: 'scale',
        interval: 'month',
        intervalCount: 1,
      };
    }
    return null;
  }),
}));

vi.mock('../../src/services/apikeys/index.js', () => ({
  updateAccountTier: (...args: unknown[]) => mockUpdateAccountTier(...args),
}));

vi.mock('../../src/tiers/index.js', () => ({
  clearTierCache: (...args: unknown[]) => mockClearTierCache(...args),
}));

import express from 'express';
import request from 'supertest';
import { webhookRouter } from '../../src/routes/webhooks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures/revolut');

function loadFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), 'utf-8');
}

function createApp() {
  const app = express();
  app.use('/webhooks', webhookRouter);
  return app;
}

describe('Revolut webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRevolutClient.mockResolvedValue({
      verifyWebhookSignature: mockVerifyWebhookSignature,
      getOrder: mockGetOrder,
      getSubscriptionCycles: mockGetSubscriptionCycles,
    });
    mockVerifyWebhookSignature.mockReturnValue(true);
    mockFindBySetupOrderId.mockResolvedValue(null);
    mockListActiveWithRevolutSub.mockResolvedValue([]);
    mockGetSubscriptionCycles.mockResolvedValue([]);
  });

  it('rejects requests without signature headers', async () => {
    const payload = loadFixture('order-completed.json');

    const res = await request(createApp())
      .post('/webhooks/revolut')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing signature');
    expect(mockVerifyWebhookSignature).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid signatures', async () => {
    const payload = loadFixture('order-completed.json');
    mockVerifyWebhookSignature.mockReturnValue(false);

    const res = await request(createApp())
      .post('/webhooks/revolut')
      .set('Content-Type', 'application/json')
      .set('Revolut-Signature', 'v1=test-signature')
      .set('Revolut-Request-Timestamp', '1713139200')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('returns 400 for malformed JSON payloads', async () => {
    const res = await request(createApp())
      .post('/webhooks/revolut')
      .set('Content-Type', 'application/json')
      .set('Revolut-Signature', 'v1=test-signature')
      .set('Revolut-Request-Timestamp', '1713139200')
      .send('{"event":');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  it('returns 503 when Revolut billing is not configured', async () => {
    mockGetRevolutClient.mockResolvedValue(null);

    const res = await request(createApp())
      .post('/webhooks/revolut')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Payment service not configured');
  });

  it('activates a subscription on ORDER_COMPLETED using a realistic webhook payload', async () => {
    const payload = loadFixture('order-completed.json');
    mockGetOrder.mockResolvedValue({
      metadata: {
        account_id: 'alice.testnet',
        tier: 'pro',
      },
    });
    mockGetByAccount.mockResolvedValue({
      accountId: 'alice.testnet',
      tier: 'pro',
      revolutSubscriptionId: 'rev-sub-1',
      revolutLastOrderId: null,
      promotionCyclesRemaining: 0,
    });

    const res = await request(createApp())
      .post('/webhooks/revolut')
      .set('Content-Type', 'application/json')
      .set('Revolut-Signature', 'v1=test-signature')
      .set('Revolut-Request-Timestamp', '1713139200')
      .send(payload);

    expect(res.status).toBe(204);
    expect(mockGetOrder).toHaveBeenCalledWith('order-completed-123');
    expect(mockUpdatePeriod).toHaveBeenCalledTimes(1);
    expect(mockUpdatePeriod.mock.calls[0]?.[0]).toBe('alice.testnet');
    expect(mockUpdatePeriod.mock.calls[0]?.[3]).toBe('order-completed-123');
    expect(mockUpdateAccountTier).toHaveBeenCalledWith('alice.testnet', 'pro');
    expect(mockClearTierCache).toHaveBeenCalledWith('alice.testnet');
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('marks the subscription past_due on ORDER_PAYMENT_FAILED using a realistic webhook payload', async () => {
    const payload = loadFixture('order-payment-failed.json');
    mockGetOrder.mockResolvedValue({
      metadata: {
        account_id: 'alice.testnet',
        tier: 'pro',
      },
    });
    mockGetByAccount.mockResolvedValue({
      accountId: 'alice.testnet',
      tier: 'pro',
      revolutSubscriptionId: 'rev-sub-1',
      revolutLastOrderId: 'order-completed-123',
      promotionCyclesRemaining: 0,
    });

    const res = await request(createApp())
      .post('/webhooks/revolut')
      .set('Content-Type', 'application/json')
      .set('Revolut-Signature', 'v1=test-signature')
      .set('Revolut-Request-Timestamp', '1713139200')
      .send(payload);

    expect(res.status).toBe(204);
    expect(mockGetOrder).toHaveBeenCalledWith('order-failed-456');
    expect(mockUpdateStatus).toHaveBeenCalledWith('alice.testnet', 'past_due');
    expect(mockUpdatePeriod).not.toHaveBeenCalled();
    expect(mockUpdateAccountTier).not.toHaveBeenCalled();
  });

  it('decrements remaining promo cycles on renewal orders', async () => {
    const payload = loadFixture('order-completed.json');
    mockGetOrder.mockResolvedValue({
      metadata: {
        account_id: 'alice.testnet',
        tier: 'pro',
      },
    });
    mockGetByAccount.mockResolvedValue({
      accountId: 'alice.testnet',
      tier: 'pro',
      revolutSubscriptionId: 'rev-sub-1',
      revolutLastOrderId: 'older-order-123',
      promotionCyclesRemaining: 2,
    });

    const res = await request(createApp())
      .post('/webhooks/revolut')
      .set('Content-Type', 'application/json')
      .set('Revolut-Signature', 'v1=test-signature')
      .set('Revolut-Request-Timestamp', '1713139200')
      .send(payload);

    expect(res.status).toBe(204);
    expect(mockDecrementPromoCycles).toHaveBeenCalledWith('alice.testnet');
  });

  it('resolves renewal orders through subscription cycles when metadata is absent', async () => {
    const payload = loadFixture('order-completed.json');
    mockGetOrder.mockResolvedValue({
      metadata: undefined,
    });
    mockFindBySetupOrderId.mockResolvedValue(null);
    mockListActiveWithRevolutSub.mockResolvedValue([
      {
        accountId: 'alice.testnet',
        tier: 'scale',
        revolutSubscriptionId: 'rev-scale-1',
        revolutLastOrderId: 'older-order-123',
        promotionCyclesRemaining: 0,
      },
    ]);
    mockGetSubscriptionCycles.mockResolvedValue([
      {
        id: 'cycle-1',
        order_id: 'order-completed-123',
      },
    ]);

    const res = await request(createApp())
      .post('/webhooks/revolut')
      .set('Content-Type', 'application/json')
      .set('Revolut-Signature', 'v1=test-signature')
      .set('Revolut-Request-Timestamp', '1713139200')
      .send(payload);

    expect(res.status).toBe(204);
    expect(mockGetSubscriptionCycles).toHaveBeenCalledWith('rev-scale-1');
    expect(mockUpdatePeriod).toHaveBeenCalledTimes(1);
    expect(mockUpdateAccountTier).toHaveBeenCalledWith(
      'alice.testnet',
      'scale'
    );
  });
});
