import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nodeEnv: 'development' as string,
  cancelSubscription: vi.fn(),
  getOrCreateCustomer: vi.fn(),
  createSubscription: vi.fn(),
  getWithValidPeriod: vi.fn(),
  getByAccount: vi.fn(),
  updateStatus: vi.fn(),
  getActiveByAccount: vi.fn(),
  upsert: vi.fn(),
  getOrder: vi.fn(),
  updatePeriod: vi.fn(),
  updateAccountTier: vi.fn(),
  clearTierCache: vi.fn(),
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    get nodeEnv() {
      return mocks.nodeEnv;
    },
    rateLimits: { free: 60, pro: 600, scale: 3000, service: 10000 },
    redisUrl: '',
    jwtSecret: 'test-secret-key-at-least-32-chars-long!!',
    nearNetwork: 'testnet',
    getRevolutClient: vi.fn(async () => ({
      cancelSubscription: mocks.cancelSubscription,
      getOrCreateCustomer: mocks.getOrCreateCustomer,
      createSubscription: mocks.createSubscription,
      getOrder: mocks.getOrder,
    })),
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/tiers/index.js', () => ({
  isAdmin: vi.fn(() => false),
  clearTierCache: (...args: unknown[]) => mocks.clearTierCache(...args),
}));

vi.mock('../../src/services/apikeys/index.js', () => ({
  updateAccountTier: (...args: unknown[]) => mocks.updateAccountTier(...args),
}));

vi.mock('../../src/services/revolut/charge-variations.js', () => ({
  resolveRevolutPlanVariationId: vi.fn(
    async (
      _client: unknown,
      plan: { amountMinor: number; revolutPlanVariationId?: string },
      totalMinor: number
    ) => {
      if (totalMinor === plan.amountMinor) {
        return plan.revolutPlanVariationId || 'net-plan';
      }
      return `gross-${totalMinor}`;
    }
  ),
  clearChargeVariationCache: vi.fn(),
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
  hasPaidAccess: (sub: { status: string; currentPeriodEnd: string }) =>
    sub.status !== 'pending' &&
    sub.status !== 'expired' &&
    new Date(sub.currentPeriodEnd) > new Date(),
  subscriptionStore: {
    getWithValidPeriod: (...args: unknown[]) =>
      mocks.getWithValidPeriod(...args),
    getByAccount: (...args: unknown[]) => mocks.getByAccount(...args),
    updateStatus: (...args: unknown[]) => mocks.updateStatus(...args),
    getActiveByAccount: (...args: unknown[]) =>
      mocks.getActiveByAccount(...args),
    upsert: (...args: unknown[]) => mocks.upsert(...args),
    updatePeriod: (...args: unknown[]) => mocks.updatePeriod(...args),
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
    mocks.nodeEnv = 'development';
    vi.mocked(
      (await import('../../src/config/index.js')).config.getRevolutClient
    ).mockResolvedValue({
      cancelSubscription: mocks.cancelSubscription,
      getOrCreateCustomer: mocks.getOrCreateCustomer,
      createSubscription: mocks.createSubscription,
      getOrder: mocks.getOrder,
    } as never);
    mocks.getOrCreateCustomer.mockResolvedValue({ id: 'cust-1' });
    mocks.createSubscription.mockResolvedValue({
      id: 'rev-sub-1',
      setup_order_id: 'setup-order-1',
    });
    mocks.getWithValidPeriod.mockResolvedValue(null);
    mocks.getByAccount.mockResolvedValue(null);
    mocks.updatePeriod.mockResolvedValue(undefined);
    mocks.updateAccountTier.mockResolvedValue(undefined);
    mocks.getOrder.mockResolvedValue({
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
    mocks.getWithValidPeriod.mockResolvedValue({
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
      .send({ tier: 'pro', email: 'alice@example.com', country: 'GB' });

    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(true);
    expect(res.body.checkoutUrl).toBe(
      'https://sandbox-checkout.revolut.com/payment-link/resume'
    );
    // Resume reuses the Revolut setup order; upsert only refreshes billing identity.
    expect(mocks.createSubscription).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sub-1',
        status: 'pending',
        revolutSetupOrderId: 'setup-order-1',
        billingEmail: 'alice@example.com',
        billingCountry: 'GB',
      })
    );
  });

  it('clears a terminal pending setup so a fresh checkout can be created', async () => {
    mocks.getOrCreateCustomer.mockResolvedValue({ id: 'cust-1' });
    mocks.createSubscription.mockResolvedValue({
      id: 'rev-pro-2',
      setup_order_id: 'setup-order-2',
    });
    mocks.getOrder
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
      cancelSubscription: mocks.cancelSubscription,
      getOrCreateCustomer: mocks.getOrCreateCustomer,
      createSubscription: mocks.createSubscription,
      getOrder: mocks.getOrder,
    } as never);

    mocks.getWithValidPeriod.mockResolvedValue({
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
      .send({ tier: 'pro', email: 'alice@example.com', country: 'GB' });

    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toBe(
      'https://sandbox-checkout.revolut.com/payment-link/new'
    );
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'alice.testnet',
      'cancelled'
    );
    expect(mocks.createSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns the effective paid tier for cancelled subscriptions with remaining period', async () => {
    mocks.getByAccount.mockResolvedValue({
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

  it('returns free tier while subscription checkout is still pending', async () => {
    mocks.getByAccount.mockResolvedValue({
      id: 'sub-1',
      tier: 'pro',
      status: 'pending',
      currentPeriodStart: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
      promotionCode: null,
      promotionCyclesRemaining: 0,
    });

    const res = await request(createApp()).get('/developer/subscription');

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('free');
    expect(res.body.subscription.status).toBe('pending');
  });

  it('cancels old subscription and immediately creates checkout for downgrade', async () => {
    mocks.getWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'scale',
      status: 'active',
      revolutSubscriptionId: 'rev-scale-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp())
      .post('/developer/subscribe')
      .send({ tier: 'pro', email: 'alice@example.com', country: 'GB' });

    expect(res.status).toBe(200);
    // Old Revolut subscription cancelled
    expect(mocks.cancelSubscription).toHaveBeenCalledWith('rev-scale-1');
    // New subscription created with checkout URL
    expect(res.body.checkoutUrl).toBe(
      'https://sandbox-checkout.revolut.com/payment-link/resume'
    );
    expect(res.body.plan).toMatchObject({ tier: 'pro', name: 'Pro' });
    // New subscription upserted in pending state with grace period from old tier
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'pending',
      revolutLastOrderId: null,
      graceTier: 'scale',
      gracePeriodEnd: '2099-01-01T00:00:00.000Z',
    });
  });

  it('preserves prior paid tier via grace while upgrade checkout is pending', async () => {
    mocks.getWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'active',
      revolutSubscriptionId: 'rev-pro-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp())
      .post('/developer/subscribe')
      .send({ tier: 'scale', email: 'alice@example.com', country: 'GB' });

    expect(res.status).toBe(200);
    expect(mocks.cancelSubscription).toHaveBeenCalledWith('rev-pro-1');
    expect(res.body.plan).toMatchObject({ tier: 'scale' });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      tier: 'scale',
      status: 'pending',
      revolutLastOrderId: null,
      graceTier: 'pro',
      gracePeriodEnd: '2099-01-01T00:00:00.000Z',
    });
  });

  it('rejects same-tier re-subscribe while paid access is still active', async () => {
    mocks.getWithValidPeriod.mockResolvedValue({
      id: 'sub-1',
      accountId: 'alice.testnet',
      tier: 'pro',
      status: 'cancelled',
      revolutSubscriptionId: 'rev-pro-1',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    });

    const res = await request(createApp())
      .post('/developer/subscribe')
      .send({ tier: 'pro', email: 'alice@example.com', country: 'GB' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already subscribed/i);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it('clears billing on explicit cancel while preserving access to period end', async () => {
    mocks.getWithValidPeriod.mockResolvedValue({
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
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      'alice.testnet',
      'cancelled'
    );
  });

  it('allows dev-only completion of a pending subscription', async () => {
    mocks.getByAccount.mockResolvedValue({
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
    expect(mocks.updatePeriod).toHaveBeenCalledTimes(1);
    expect(mocks.updateAccountTier).toHaveBeenCalledWith(
      'alice.testnet',
      'pro'
    );
    expect(mocks.clearTierCache).toHaveBeenCalledWith('alice.testnet');
  });

  it('hides the dev completion endpoint in production', async () => {
    mocks.nodeEnv = 'production';
    mocks.getByAccount.mockResolvedValue({
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

    expect(res.status).toBe(404);
    expect(mocks.updatePeriod).not.toHaveBeenCalled();
    expect(mocks.updateAccountTier).not.toHaveBeenCalled();
  });

  it('does not send a redirect URL to Revolut for localhost origins', async () => {
    const res = await request(createApp())
      .post('/developer/subscribe')
      .set('Origin', 'http://localhost:3000')
      .send({ tier: 'pro', email: 'alice@example.com', country: 'GB' });

    expect(res.status).toBe(200);
    expect(mocks.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: undefined,
      })
    );
  });

  it('sends a success redirect URL to Revolut for public origins', async () => {
    const res = await request(createApp())
      .post('/developer/subscribe')
      .set('Origin', 'https://testnet.onsocial.id')
      .send({ tier: 'pro', email: 'alice@example.com', country: 'GB' });

    expect(res.status).toBe(200);
    expect(mocks.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: 'https://testnet.onsocial.id/onapi/keys?checkout=success',
      })
    );
  });

  it('previews UK VAT on net plan price before checkout', async () => {
    const res = await request(createPublicApp())
      .post('/developer/tax-preview')
      .send({ tier: 'pro', country: 'GB' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      tier: 'pro',
      netMinor: 4900,
      totalMinor: 5880,
      taxTreatment: 'uk_vat',
      taxRateBps: 2000,
    });
    expect(res.body.netMinor + res.body.taxMinor).toBe(5880);
    expect(res.body.taxMinor).toBe(980);
    expect(res.body.totalFormatted).toBe('$58.80');
    expect(res.body.chargeNote).toMatch(/OnSocial tax invoice/i);
  });

  it('previews EU OSS VAT until VIES reverse charge is verified', async () => {
    const pending = await request(createPublicApp())
      .post('/developer/tax-preview')
      .send({
        tier: 'pro',
        country: 'DE',
        vatId: 'DE123456789',
        verifyVat: false,
      });

    expect(pending.status).toBe(200);
    expect(pending.body.taxTreatment).toBe('eu_oss_vat');
    expect(pending.body.taxMinor).toBeGreaterThan(0);
    expect(pending.body.taxNote).toMatch(/VIES/i);
  });

  it('previews US sales tax when state and ZIP are provided', async () => {
    const res = await request(createPublicApp())
      .post('/developer/tax-preview')
      .send({
        tier: 'pro',
        country: 'US',
        region: 'TX',
        postalCode: '78701',
        line1: '100 Congress Ave',
        city: 'Austin',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      taxTreatment: 'us_sales_tax',
      taxRateBps: 625,
      netMinor: 4900,
      totalMinor: 5206,
    });
  });

  it('rejects US tax preview without a ZIP code', async () => {
    const res = await request(createPublicApp())
      .post('/developer/tax-preview')
      .send({
        tier: 'pro',
        country: 'US',
        region: 'TX',
        line1: '100 Congress Ave',
        city: 'Austin',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ZIP/i);
  });

  it('rejects US tax preview without a street address', async () => {
    const res = await request(createPublicApp())
      .post('/developer/tax-preview')
      .send({
        tier: 'pro',
        country: 'US',
        region: 'TX',
        postalCode: '78701',
        city: 'Austin',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/street/i);
  });

  it('rejects tax preview without a billing country', async () => {
    const res = await request(createPublicApp())
      .post('/developer/tax-preview')
      .send({ tier: 'pro' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/country/i);
  });
});
