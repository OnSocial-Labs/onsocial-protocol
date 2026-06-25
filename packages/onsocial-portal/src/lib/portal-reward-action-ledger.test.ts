import { describe, expect, it } from 'vitest';

import {
  PORTAL_REWARD_CREDIT_YOCTO,
  emptyPortalRewardActionProgress,
} from '@/lib/portal-reward-constants';
import {
  confirmPortalRewardActionCredit,
  estimatePortalRewardActionProgressFromDailyCredits,
  reconcilePortalRewardActionProgress,
} from '@/lib/portal-reward-action-ledger';

describe('portal-reward-action-ledger', () => {
  it('estimates check-in and stand from on-chain daily credits when log is empty', () => {
    const empty = emptyPortalRewardActionProgress();
    const fourCredits = PORTAL_REWARD_CREDIT_YOCTO * 4n;

    const estimated = estimatePortalRewardActionProgressFromDailyCredits(
      empty,
      fourCredits
    );

    expect(estimated.daily_active.count).toBe(1);
    expect(estimated.stand_given.count).toBe(3);
    expect(estimated.mutual_stand_created.count).toBe(0);
  });

  it('does not override non-empty activity log counts', () => {
    const progress = emptyPortalRewardActionProgress();
    progress.stand_given.count = 2;

    const estimated = estimatePortalRewardActionProgressFromDailyCredits(
      progress,
      PORTAL_REWARD_CREDIT_YOCTO * 4n
    );

    expect(estimated.stand_given.count).toBe(2);
    expect(estimated.daily_active.count).toBe(0);
  });

  it('confirms and reconciles per-action counts', () => {
    const local = confirmPortalRewardActionCredit(
      emptyPortalRewardActionProgress(),
      'stand_given'
    );
    const api = emptyPortalRewardActionProgress();

    expect(
      reconcilePortalRewardActionProgress(local, api).stand_given.count
    ).toBe(1);
  });
});
