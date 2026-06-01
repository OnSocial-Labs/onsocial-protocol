import { describe, expect, it } from 'vitest';

import {
  SEASON_ZERO_JOIN_RALLY_MIN_YOCTO,
  scoreSeasonZero,
  scoreSeasonZeroProfile,
} from '../../src/services/seasons/season-zero-policy.js';

const ONE_SOCIAL = 1_000_000_000_000_000_000n;

function baseSignals() {
  return {
    accountId: 'alice.testnet',
    joinAmountYocto: SEASON_ZERO_JOIN_RALLY_MIN_YOCTO,
    profile: {
      hasName: true,
      hasBio: true,
      hasAvatar: true,
      linkCount: 2,
    },
    uniqueEndorsers: 2,
    endorsementTopics: 2,
    receivedStands: 2,
    mutualStands: 1,
    supportReceivedYocto: 4n * ONE_SOCIAL,
    effectiveBoostYocto: 9n * ONE_SOCIAL,
  };
}

describe('season-zero-policy', () => {
  it('sets Season Zero join eligibility at 100 SOCIAL', () => {
    expect(SEASON_ZERO_JOIN_RALLY_MIN_YOCTO).toBe(100n * ONE_SOCIAL);
  });

  it('requires a minimum join rally spend for eligibility', () => {
    const score = scoreSeasonZero({
      ...baseSignals(),
      joinAmountYocto: SEASON_ZERO_JOIN_RALLY_MIN_YOCTO - 1n,
    });

    expect(score.eligible).toBe(false);
    expect(score.breakdown.total).toBe(0);
  });

  it('scores profile completion without rewarding unlimited links', () => {
    expect(
      scoreSeasonZeroProfile({
        hasName: true,
        hasBio: true,
        hasAvatar: true,
        linkCount: 20,
      })
    ).toBe(350);
  });

  it('applies capped social, support, and boost signals', () => {
    const normal = scoreSeasonZero(baseSignals());
    const farmed = scoreSeasonZero({
      ...baseSignals(),
      uniqueEndorsers: 10_000,
      endorsementTopics: 10_000,
      receivedStands: 10_000,
      mutualStands: 10_000,
      supportReceivedYocto: 10_000n * ONE_SOCIAL,
      effectiveBoostYocto: 10_000n * ONE_SOCIAL,
    });

    expect(normal.breakdown.join).toBe(1_000);
    expect(farmed.breakdown.endorsements).toBe(500);
    expect(farmed.breakdown.solidarity).toBe(300);
    expect(farmed.breakdown.support).toBe(300);
    expect(farmed.breakdown.boost).toBe(300);
    expect(farmed.breakdown.total).toBeLessThan(3_000);
  });

  it('uses square-root weighting for spend-like signals', () => {
    const fourSocial = scoreSeasonZero({
      ...baseSignals(),
      supportReceivedYocto: 4n * ONE_SOCIAL,
      effectiveBoostYocto: 4n * ONE_SOCIAL,
    });
    const nineSocial = scoreSeasonZero({
      ...baseSignals(),
      supportReceivedYocto: 9n * ONE_SOCIAL,
      effectiveBoostYocto: 9n * ONE_SOCIAL,
    });

    expect(nineSocial.breakdown.support - fourSocial.breakdown.support).toBe(
      80
    );
    expect(nineSocial.breakdown.boost - fourSocial.breakdown.boost).toBe(60);
  });
});
