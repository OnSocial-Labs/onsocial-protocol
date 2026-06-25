import { describe, expect, it } from 'vitest';
import { emptyPortalRewardActionProgress } from '../../src/services/portal-reward-progress.js';

describe('portal-reward-progress', () => {
  it('seeds every action with zero count and policy cap', () => {
    const progress = emptyPortalRewardActionProgress();

    expect(progress.profile_created).toEqual({ count: 0, cap: 1 });
    expect(progress.daily_active).toEqual({ count: 0, cap: 1 });
    expect(progress.stand_given).toEqual({ count: 0, cap: 3 });
    expect(progress.mutual_stand_created).toEqual({ count: 0, cap: 3 });
    expect(progress.endorsement_given).toEqual({ count: 0, cap: 3 });
  });
});
