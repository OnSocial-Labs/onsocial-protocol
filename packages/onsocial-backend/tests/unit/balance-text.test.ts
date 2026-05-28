import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockViewUserReward = vi.fn();
const mockViewContract = vi.fn();

vi.mock('../../src/config/index.js', () => ({
  config: {
    appId: 'onsocial_telegram',
    nearNetwork: 'testnet',
    rewards: {
      dailyCap: 1.0,
      minClaimAmount: 1.0,
    },
  },
}));

vi.mock('../../src/services/near.js', () => ({
  viewUserReward: (...args: unknown[]) => mockViewUserReward(...args),
  viewContract: (...args: unknown[]) => mockViewContract(...args),
}));

import {
  buildBalanceText,
  REWARD_ECOSYSTEM_CLAIM_HINT,
  REWARD_TELEGRAM_DAILY_SCOPE_HINT,
} from '../../src/bot/balance.js';

const YOCTO_ONE = '1000000000000000000';
const YOCTO_TENTH = '100000000000000000';
const YOCTO_HALF = '500000000000000000';

function currentDay(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function mockOnChainViews({
  reward = null as {
    claimable: string;
    daily_earned: string;
    last_day: number;
    total_earned: string;
    total_claimed: string;
  } | null,
  appReward = null as {
    total_earned: string;
    daily_earned: string;
    last_day: number;
  } | null,
  dailyCap = YOCTO_ONE,
}: {
  reward?: {
    claimable: string;
    daily_earned: string;
    last_day: number;
    total_earned: string;
    total_claimed: string;
  } | null;
  appReward?: {
    total_earned: string;
    daily_earned: string;
    last_day: number;
  } | null;
  dailyCap?: string;
}) {
  mockViewUserReward.mockResolvedValue(reward);
  mockViewContract.mockImplementation((method: string) => {
    if (method === 'get_user_app_reward') {
      return Promise.resolve(appReward);
    }
    if (method === 'get_app_config') {
      return Promise.resolve({
        label: 'OnSocial Telegram',
        daily_cap: dailyCap,
        reward_per_action: YOCTO_TENTH,
      });
    }
    return Promise.resolve(null);
  });
}

describe('buildBalanceText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows zero daily progress for users without telegram app earnings', async () => {
    mockOnChainViews({
      reward: {
        claimable: YOCTO_HALF,
        daily_earned: '0',
        last_day: currentDay(),
        total_earned: YOCTO_HALF,
        total_claimed: '0',
      },
      appReward: null,
    });

    const text = await buildBalanceText('alice.testnet');

    expect(text).toContain('Daily progress: 0 / 1 SOCIAL');
    expect(text).toContain('Unclaimed: 0.5 SOCIAL');
    expect(text).toContain(REWARD_ECOSYSTEM_CLAIM_HINT);
    expect(text).toContain(REWARD_TELEGRAM_DAILY_SCOPE_HINT);
    expect(text).toContain('Total earned: 0.5 SOCIAL');
    expect(text).not.toContain('Earned in this group');
  });

  it('shows per-app daily progress for telegram earnings', async () => {
    const day = currentDay();
    mockOnChainViews({
      reward: {
        claimable: YOCTO_TENTH,
        daily_earned: '0',
        last_day: day,
        total_earned: YOCTO_TENTH,
        total_claimed: '0',
      },
      appReward: {
        daily_earned: '200000000000000000',
        total_earned: YOCTO_TENTH,
        last_day: day,
      },
    });

    const text = await buildBalanceText('alice.testnet');

    expect(text).toContain('Daily progress: 0.2 / 1 SOCIAL');
  });

  it('shows separate telegram and total earned when user earns from multiple apps', async () => {
    const day = currentDay();
    mockOnChainViews({
      reward: {
        claimable: YOCTO_ONE,
        daily_earned: '0',
        last_day: day,
        total_earned: '2000000000000000000',
        total_claimed: '0',
      },
      appReward: {
        daily_earned: YOCTO_TENTH,
        total_earned: YOCTO_TENTH,
        last_day: day,
      },
    });

    const text = await buildBalanceText('alice.testnet');

    expect(text).toContain('Earned in this group: 0.1 SOCIAL');
    expect(text).toContain(REWARD_ECOSYSTEM_CLAIM_HINT);
    expect(text).toContain('Total earned: 2 SOCIAL');
  });

  it('marks cap reached when telegram daily earnings hit the on-chain cap', async () => {
    const day = currentDay();
    mockOnChainViews({
      reward: {
        claimable: YOCTO_ONE,
        daily_earned: '0',
        last_day: day,
        total_earned: YOCTO_ONE,
        total_claimed: '0',
      },
      appReward: {
        daily_earned: YOCTO_ONE,
        total_earned: YOCTO_ONE,
        last_day: day,
      },
    });

    const text = await buildBalanceText('alice.testnet');

    expect(text).toContain('Daily progress: 1 / 1 SOCIAL');
    expect(text).toContain('Cap reached (resets in');
  });
});
