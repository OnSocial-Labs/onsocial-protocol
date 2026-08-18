import { describe, expect, it } from 'vitest';
import { profileSignalsHaveFaceMetrics } from './profile-signals';

describe('profileSignalsHaveFaceMetrics', () => {
  const empty = {
    standingCount: 0,
    standingWithCount: 0,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    postCount: 0,
    reputation: null,
  };

  it('hides all-zero dormant faces', () => {
    expect(profileSignalsHaveFaceMetrics(empty)).toBe(false);
  });

  it('shows when any social count is non-zero', () => {
    expect(
      profileSignalsHaveFaceMetrics({ ...empty, standingCount: 1 })
    ).toBe(true);
    expect(
      profileSignalsHaveFaceMetrics({ ...empty, endorsementsGivenCount: 2 })
    ).toBe(true);
  });

  it('shows when reputation is positive', () => {
    expect(
      profileSignalsHaveFaceMetrics({
        ...empty,
        reputation: {
          reputation: 12,
          rank: 3,
          socialScore: 0,
          commitmentScore: 0,
          qualityScore: 0,
          consistencyScore: 0,
          scarcesScore: 0,
          confidenceScore: 0,
          totalPosts: 0,
          paidSupportSpenders: 0,
          uniqueInboundPeers: 0,
          uniqueScarceFans: 0,
          amplifyEvents: 0,
          lockMonths: 0,
        },
      })
    ).toBe(true);
  });
});
