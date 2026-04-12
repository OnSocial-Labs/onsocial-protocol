import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (before imports) ────────────────────────────────────

vi.mock('../../src/services/revolut/index.js', () => ({
  subscriptionStore: {
    getWithValidPeriod: vi.fn(),
  },
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    rateLimits: { free: 60, pro: 600, scale: 3000, service: 10000 },
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getTierInfo, clearTierCache } from '../../src/tiers/index.js';
import { subscriptionStore } from '../../src/services/revolut/index.js';

const mockGetWithValidPeriod = vi.mocked(subscriptionStore.getWithValidPeriod);

// ── Tests ─────────────────────────────────────────────────────

describe('getTierInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the tier cache between tests
    clearTierCache('alice.testnet');
    clearTierCache('bob.testnet');
    clearTierCache('carol.testnet');
  });

  it('should return free tier when no subscription exists', async () => {
    mockGetWithValidPeriod.mockResolvedValue(null);

    const info = await getTierInfo('alice.testnet');

    expect(info.tier).toBe('free');
    expect(info.rateLimit).toBe(60);
    expect(mockGetWithValidPeriod).toHaveBeenCalledWith('alice.testnet');
  });

  it('should return pro tier for active pro subscription', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      tier: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    });

    const info = await getTierInfo('alice.testnet');

    expect(info.tier).toBe('pro');
    expect(info.rateLimit).toBe(600);
  });

  it('should return scale tier for active scale subscription', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      tier: 'scale',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    });

    const info = await getTierInfo('alice.testnet');

    expect(info.tier).toBe('scale');
    expect(info.rateLimit).toBe(3000);
  });

  it('should keep paid tier after cancellation while period is valid', async () => {
    // User cancelled but still has 10 days left on their billing period
    mockGetWithValidPeriod.mockResolvedValue({
      tier: 'pro',
      status: 'cancelled',
      currentPeriodEnd: new Date(Date.now() + 10 * 24 * 3600_000).toISOString(),
    });

    const info = await getTierInfo('alice.testnet');

    expect(info.tier).toBe('pro');
    expect(info.rateLimit).toBe(600);
  });

  it('should keep paid tier during past_due while period is valid', async () => {
    // Payment failed but period hasn't ended yet
    mockGetWithValidPeriod.mockResolvedValue({
      tier: 'pro',
      status: 'past_due',
      currentPeriodEnd: new Date(Date.now() + 5 * 24 * 3600_000).toISOString(),
    });

    const info = await getTierInfo('alice.testnet');

    expect(info.tier).toBe('pro');
    expect(info.rateLimit).toBe(600);
  });

  it('should fall back to free when period has expired', async () => {
    // getWithValidPeriod returns null when period_end < now
    mockGetWithValidPeriod.mockResolvedValue(null);

    const info = await getTierInfo('alice.testnet');

    expect(info.tier).toBe('free');
    expect(info.rateLimit).toBe(60);
  });

  it('should default to free on store error (resilience)', async () => {
    mockGetWithValidPeriod.mockRejectedValue(
      new Error('Hasura: connection refused')
    );

    const info = await getTierInfo('alice.testnet');

    expect(info.tier).toBe('free');
    expect(info.rateLimit).toBe(60);
  });

  it('should cache results and not re-query within TTL', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      tier: 'pro',
      status: 'active',
    });

    const first = await getTierInfo('bob.testnet');
    const second = await getTierInfo('bob.testnet');

    expect(first.tier).toBe('pro');
    expect(second.tier).toBe('pro');
    // Should only query once due to caching
    expect(mockGetWithValidPeriod).toHaveBeenCalledTimes(1);
  });

  it('should re-query after cache is cleared', async () => {
    mockGetWithValidPeriod
      .mockResolvedValueOnce({ tier: 'pro', status: 'active' })
      .mockResolvedValueOnce(null);

    const first = await getTierInfo('carol.testnet');
    expect(first.tier).toBe('pro');

    clearTierCache('carol.testnet');

    const second = await getTierInfo('carol.testnet');
    expect(second.tier).toBe('free');
    expect(mockGetWithValidPeriod).toHaveBeenCalledTimes(2);
  });
});

describe('Subscription lifecycle → tier resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTierCache('user.testnet');
  });

  it('new user → free', async () => {
    mockGetWithValidPeriod.mockResolvedValue(null);
    expect((await getTierInfo('user.testnet')).tier).toBe('free');
  });

  it('user pays → pro', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      tier: 'pro',
      status: 'active',
    });
    clearTierCache('user.testnet');
    expect((await getTierInfo('user.testnet')).tier).toBe('pro');
  });

  it('user cancels → still pro while period valid', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      tier: 'pro',
      status: 'cancelled',
    });
    clearTierCache('user.testnet');
    expect((await getTierInfo('user.testnet')).tier).toBe('pro');
  });

  it('period expires → free', async () => {
    mockGetWithValidPeriod.mockResolvedValue(null);
    clearTierCache('user.testnet');
    expect((await getTierInfo('user.testnet')).tier).toBe('free');
  });

  it('user re-subscribes → pro again', async () => {
    mockGetWithValidPeriod.mockResolvedValue({
      tier: 'pro',
      status: 'active',
    });
    clearTierCache('user.testnet');
    expect((await getTierInfo('user.testnet')).tier).toBe('pro');
  });
});
