import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCancelSubscription = vi.fn();
const mockGetOrCreateCustomer = vi.fn();
const mockCreateSubscription = vi.fn();
const mockGetWithValidPeriod = vi.fn();
const mockGetByAccount = vi.fn();
const mockUpdateStatus = vi.fn();
const mockGetActiveByAccount = vi.fn();
const mockUpsert = vi.fn();
const mockGetOrder = vi.fn();
const mockUpdatePeriod = vi.fn();
const mockUpdateAccountTier = vi.fn();
const mockClearTierCache = vi.fn();

vi.mock('../../src/config/index.js', () => ({
  config: {
    nodeEnv: 'development',
    rateLimits: { free: 60, pro: 600, scale: 3000, service: 10000 },
    redisUrl: '',
    jwtSecret: 'test-secret-key-at-least-32-chars-long!!',
    nearNetwork: 'testnet',
    getRevolutClient: vi.fn(async () => ({
      cancelSubscription: mockCancelSubscription,
      getOrCreateCustomer: mockGetOrCreateCustomer,
      createSubscription: mockCreateSubscription,
      getOrder: mockGetOrder,
    })),
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/tiers/index.js', () => ({
  isAdmin: vi.fn(() => false),
  clearTierCache: (...args: unknown[]) => mockClearTierCache(...args),
}));

vi.mock('../../src/services/apikeys/index.js', () => ({
  updateAccountTier: (...args: unknown[]) => mockUpdateAccountTier(...args),
}));

vi.mock('../../src/services/revolut/index.js', () => ({
  getPlan: vi.fn((tier: string) => {
    if (tier === 'pro') {
      return {
        tier: 'pro',
        name: 'Pro',
        amountMinor: 4900,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
        rateLimit: 600,
        revolutPlanVariationId: 'pro-plan',
      };
    }
    if (tier === 'scale') {
      return {
        tier: 'scale',
        name: 'Scale',
        amountMinor: 19900,
        currency: 'USD',
        interval: 'month',
        intervalCount: 1,
        rateLimit: 3000,
        revolutPlanVariationId: 'scale-plan',
      };
    }
    return null;
  }),
  subscribableTiers: vi.fn(() => ['pro', 'scale']),
  SUBSCRIPTION_PLANS: [
    {
      tier: 'pro',
      name: 'Pro',
      amountMinor: 4900,
      currency: 'USD',
      interval: 'month',
      rateLimit: 600,
    },
    {
      tier: 'scale',
      name: 'Scale',
      amountMinor: 19900,
      currency: 'USD',
      interval: 'month',
      rateLimit: 3000,
    },
  ],
  formatPrice: vi.fn((plan: { amountMinor: number }) => `$${plan.amountMinor}`),
  subscriptionStore: {
    getWithValidPeriod: (...args: unknown[]) => mockGetWithValidPeriod(...args),
    getByAccount: (...args: unknown[]) => mockGetByAccount(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    getActiveByAccount: (...args: unknown[]) => mockGetActiveByAccount(...args),
    upsert: (...args: unknown[]) => mockUpsert(...args),
    updatePeriod: (...args: unknown[]) => mockUpdatePeriod(...args),
  },
  getPromotion: vi.fn(),
  getActivePromoForTier: vi.fn(),
  promoAppliesToTier: vi.fn(() => false),
  resolvePrice: vi.fn(),
  formatDiscount: vi.fn(),
}));

import express from 'express';
import request from 'supertest';
import { subscriptionRouter } from '../../src/routes/subscription.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      accountId: 'alice.testnet',
      method: 'jwt',
      tier: 'scale',
      iat: 0,
      exp: 0,
    };
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    next();
  });
  app.use('/developer', subscriptionRouter);
  return app;
}

function createPublicApp() {
  const app = express();
  app.use(express.json());
  app.use('/developer', subscriptionRouter);
  return app;
}

describe('subscription routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(
      (await import('../../src/config/index.js')).config.getRevolutClient
    ).mockResolvedValue({
      cancelSubscription: mockCancelSubscription,
      getOrCreateCustomer: mockGetOrCreateCustomer,
      createSubscription: mockCreateSubscription,
      getOrder: mockGetOrder,
    } as never);
    mockGetOrCreateCustomer.mockResolvedValue({ id: 'cust-1' });
    mockCreateSubscription.mockResolvedValue({
      id: 'rev-sub-1',
      setup_order_id: 'setup-order-1',
    });
    mockGetWithValidPeriod.mockResolvedValue(null);
    mockGetByAccount.mockResolvedValue(null);
    mockUpdatePeriod.mockResolvedValue(undefined);
    mockUpdateAccountTier.mockResolvedValue(undefined);
    mockGetOrder.mockResolvedValue({
      id: 'setup-order-1',
      state: 'pending',
      checkout_url: 'https://sandbox-checkout.revolut.com/payment-link/resume',
    });
  });

  it('exposes subscription plans publicly without auth', async () => {
    const res = await request(createPublicApp()).get('/developer/plans');

    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(2);
    expect(res.body.plans[0]).toMatchObject({
      tier: 'pro',
      rateLimit: 600,
    });
  });

  it('resumes an existing pending checkout instead of blocking retries', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'pending',
      revolutSubscriptionId: 'rev-pro-1',
      revolutSetupOrderId: 'setup-order-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp())
      .post('/developer/subscribe')
      .send({ tier: 'pro', email: 'alice@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(true);
    expect(res.body.checkoutUrl).toBe(
      'https://sandbox-checkout.revolut.com/payment-link/resume'
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('clears a terminal pending setup so a fresh checkout can be created', async () => {
    const mockGetOrCreateCustomer = vi.fn().mockResolvedValue({ id: 'cust-1' });
    const mockCreateSubscription = vi.fn().mockResolvedValue({
      id: 'rev-pro-2',
      setup_order_id: 'setup-order-2',
    });
    mockGetOrder
      .mockResolvedValueOnce({
        id: 'setup-order-1',
        state: 'cancelled',
      })
      .mockResolvedValueOnce({
        id: 'setup-order-2',
        state: 'pending',
        checkout_url: 'https://sandbox-checkout.revolut.com/payment-link/new',
      });

    vi.mocked(
      (await import('../../src/config/index.js')).config.getRevolutClient
    ).mockResolvedValue({
      cancelSubscription: mockCancelSubscription,
      getOrCreateCustomer: mockGetOrCreateCustomer,
      createSubscription: mockCreateSubscription,
      getOrder: mockGetOrder,
    } as never);

    mockGetWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'pending',
      revolutSubscriptionId: 'rev-pro-1',
      revolutSetupOrderId: 'setup-order-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp())
      .post('/developer/subscribe')
      .send({ tier: 'pro', email: 'alice@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toBe(
      'https://sandbox-checkout.revolut.com/payment-link/new'
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith('alice.testnet', 'cancelled');
    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it('returns the effective paid tier for cancelled subscriptions with remaining period', async () => {
    mockGetByAccount.mockResolvedValue({
      id: 'sub-1',
      tier: 'scale',
      status: 'cancelled',
      currentPeriodStart: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
      promotionCode: null,
      promotionCyclesRemaining: 0,
    });

    const res = await request(createApp()).get('/developer/subscription');

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('scale');
  });

  it('cancels old subscription and immediately creates checkout for downgrade', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'scale',
      status: 'active',
      revolutSubscriptionId: 'rev-scale-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp())
      .post('/developer/subscribe')
      .send({ tier: 'pro', email: 'alice@example.com' });

    expect(res.status).toBe(200);
    // Old Revolut subscription cancelled
    expect(mockCancelSubscription).toHaveBeenCalledWith('rev-scale-1');
    // New subscription created with checkout URL
    expect(res.body.checkoutUrl).toBe(
      'https://sandbox-checkout.revolut.com/payment-link/resume'
    );
    expect(res.body.plan).toMatchObject({ tier: 'pro', name: 'Pro' });
    // New subscription upserted in pending state with grace period from old tier
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'pending',
      graceTier: 'scale',
      gracePeriodEnd: '2099-01-01T00:00:00.000Z',
    });
  });

  it('does not set grace fields when upgrading', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'active',
      revolutSubscriptionId: 'rev-pro-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp())
      .post('/developer/subscribe')
      .send({ tier: 'scale', email: 'alice@example.com' });

    expect(res.status).toBe(200);
    expect(mockCancelSubscription).toHaveBeenCalledWith('rev-pro-1');
    expect(res.body.plan).toMatchObject({ tier: 'scale' });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      tier: 'scale',
      graceTier: null,
      gracePeriodEnd: null,
    });
  });

  it('rejects same-tier re-subscribe while paid access is still active', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'cancelled',
      revolutSubscriptionId: 'rev-pro-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp())
      .post('/developer/subscribe')
      .send({ tier: 'pro', email: 'alice@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already subscribed/i);
    expect(mockCancelSubscription).not.toHaveBeenCalled();
  });

  it('clears billing on explicit cancel while preserving access to period end', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'scale',
      status: 'cancelled',
      revolutSubscriptionId: 'rev-scale-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp()).post(
      '/developer/subscription/cancel'
    );

    expect(res.status).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith('alice.testnet', 'cancelled');
  });

  it('allows dev-only completion of a pending subscription', async () => {
    mockGetByAccount.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'pending',
      revolutSetupOrderId: 'setup-order-1',
      revolutLastOrderId: null,
    });

    const res = await request(createApp()).post(
      '/developer/subscription/dev-complete'
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(mockUpdatePeriod).toHaveBeenCalledTimes(1);
    expect(mockUpdateAccountTier).toHaveBeenCalledWith('alice.testnet', 'pro');
    expect(mockClearTierCache).toHaveBeenCalledWith('alice.testnet');
  });

  it('does not send a redirect URL to Revolut for localhost origins', async () => {
    const res = await request(createApp())
      .post('/developer/subscribe')
      .set('Origin', 'http://localhost:3000')
      .send({ tier: 'pro', email: 'alice@example.com' });

    expect(res.status).toBe(200);
    expect(mockCreateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: undefined,
      })
    );
  });

  it('sends a success redirect URL to Revolut for public origins', async () => {
    const res = await request(createApp())
      .post('/developer/subscribe')
      .set('Origin', 'https://testnet.onsocial.id')
      .send({ tier: 'pro', email: 'alice@example.com' });

    expect(res.status).toBe(200);
    expect(mockCreateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: 'https://testnet.onsocial.id/onapi/keys?checkout=success',
      })
    );
  });
});
