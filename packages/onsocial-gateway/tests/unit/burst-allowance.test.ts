import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/index.js', () => ({
  config: {
    rateLimits: { free: 60, pro: 600, scale: 3000, service: 10000 },
    nodeEnv: 'test',
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  activateBurstForWindow,
  getBurstAllowanceStatus,
  resetBurstAllowanceStoreForTests,
  resolveBoostedLimitForTier,
} from '../../src/services/burst-allowance/index.js';
import {
  computeBoostedLimit,
  computeOverflowPoints,
} from '../../src/services/burst-allowance/config.js';

describe('burst allowance config', () => {
  it('caps scale boost at service RPM ceiling', () => {
    expect(resolveBoostedLimitForTier('scale')).toBe(10000);
    expect(computeOverflowPoints(3000, 10000)).toBe(7000);
  });

  it('doubles pro tier within cap', () => {
    expect(resolveBoostedLimitForTier('pro')).toBe(1200);
    expect(computeBoostedLimit(600, 2, 10000)).toBe(1200);
  });

  it('free tier has no overflow headroom', () => {
    expect(resolveBoostedLimitForTier('free')).toBe(60);
  });
});

describe('burst allowance store (memory)', () => {
  beforeEach(() => {
    resetBurstAllowanceStoreForTests();
  });

  it('consumes one credit per burst window', async () => {
    const first = await activateBurstForWindow('alice.testnet', 'scale', 60);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.consumedCredit).toBe(true);
      expect(first.creditsRemaining).toBe(4);
      expect(first.boostedLimit).toBe(10000);
    }

    const sameWindow = await activateBurstForWindow(
      'alice.testnet',
      'scale',
      60
    );
    expect(sameWindow.ok).toBe(true);
    if (sameWindow.ok) {
      expect(sameWindow.consumedCredit).toBe(false);
      expect(sameWindow.creditsRemaining).toBe(4);
    }
  });

  it('exhausts monthly credits', async () => {
    vi.useFakeTimers();
    const accountId = 'carol.testnet';

    for (let i = 0; i < 3; i++) {
      const result = await activateBurstForWindow(accountId, 'pro', 60);
      expect(result.ok).toBe(true);
      vi.advanceTimersByTime(61_000);
    }

    const blocked = await activateBurstForWindow(accountId, 'pro', 60);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.creditsRemaining).toBe(0);
    }

    vi.useRealTimers();
  });

  it('returns status snapshot', async () => {
    const status = await getBurstAllowanceStatus('alice.testnet', 'scale');
    expect(status.creditsPerMonth).toBe(5);
    expect(status.creditsRemaining).toBe(5);
    expect(status.multiplier).toBe(5);
    expect(status.boostedLimit).toBe(10000);
    expect(status.burstActive).toBe(false);
    expect(status.resetsAt).toMatch(/T00:00:00.000Z$/);
  });

  it('free tier cannot activate burst', async () => {
    const result = await activateBurstForWindow('alice.testnet', 'free', 60);
    expect(result.ok).toBe(false);
  });
});
