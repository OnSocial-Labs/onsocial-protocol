import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockViewContract = vi.fn();
vi.mock('../../src/services/near.js', () => ({
  viewContract: (...args: unknown[]) => mockViewContract(...args),
}));

import {
  evaluateAppCredit,
  formatSocialAmount,
  socialDecimalToYocto,
  yoctoToSocialNumber,
} from '../../src/services/app-reward-limits.js';

describe('app-reward-limits helpers', () => {
  it('converts yocto to SOCIAL decimal', () => {
    expect(yoctoToSocialNumber(100_000_000_000_000_000n)).toBe(0.1);
    expect(formatSocialAmount(100_000_000_000_000_000n)).toBe('0.1');
  });

  it('converts SOCIAL decimal to yocto', () => {
    expect(socialDecimalToYocto('0.1')).toBe(100_000_000_000_000_000n);
    expect(socialDecimalToYocto(1)).toBe(1_000_000_000_000_000_000n);
  });
});

describe('evaluateAppCredit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockAppWithHeadroom({
    rewardPerAction = '100000000000000000',
    dailyCap = '1000000000000000000',
    dailyRemaining = '1000000000000000000',
    active = true,
  }: {
    rewardPerAction?: string;
    dailyCap?: string;
    dailyRemaining?: string;
    active?: boolean;
  } = {}) {
    mockViewContract.mockImplementation((method: string) => {
      if (method === 'get_app_config') {
        return Promise.resolve({
          label: 'Test App',
          reward_per_action: rewardPerAction,
          daily_cap: dailyCap,
          active,
        });
      }
      if (method === 'get_user_rewards_overview') {
        return Promise.resolve({
          app: {
            app_active: active,
            daily_earned: '0',
            daily_remaining: dailyRemaining,
          },
        });
      }
      return Promise.resolve(null);
    });
  }

  it('allows credit when per-app headroom is sufficient', async () => {
    mockAppWithHeadroom();
    const decision = await evaluateAppCredit(
      'alice.testnet',
      'onsocial_portal'
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.amountYocto).toBe(100_000_000_000_000_000n);
    }
  });

  it('rejects when per-app daily cap is exhausted', async () => {
    mockAppWithHeadroom({ dailyRemaining: '0' });
    const decision = await evaluateAppCredit(
      'alice.testnet',
      'onsocial_portal'
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe('daily_cap');
    }
  });

  it('rejects inactive apps', async () => {
    mockAppWithHeadroom({ active: false });
    const decision = await evaluateAppCredit(
      'alice.testnet',
      'onsocial_portal'
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe('app_inactive');
    }
  });

  it('uses explicit amount when provided', async () => {
    mockAppWithHeadroom();
    const decision = await evaluateAppCredit(
      'alice.testnet',
      'onsocial_portal',
      500_000_000_000_000_000n
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.amountYocto).toBe(500_000_000_000_000_000n);
    }
  });
});
