import { describe, expect, it } from 'vitest';

import {
  SEASON_ZERO_JOIN_RALLY_MIN_YOCTO,
  SEASON_ZERO_SCORING_LIMITS,
  scoreSeasonZero,
  scoreSeasonZeroProfile,
} from '../../src/services/seasons/season-policy.js';

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
    daily: {
      endorsersByDay: [2],
      topicsByDay: [2],
      receivedStandsByDay: [2],
      mutualStandsByDay: [1],
    },
  };
}

function score(
  input: Parameters<typeof scoreSeasonZero>[0]
): ReturnType<typeof scoreSeasonZero> {
  return scoreSeasonZero(input, {
    joinMinYocto: SEASON_ZERO_JOIN_RALLY_MIN_YOCTO,
  });
}

describe('season-policy', () => {
  it('sets Season Zero join eligibility at 100 SOCIAL', () => {
    expect(SEASON_ZERO_JOIN_RALLY_MIN_YOCTO).toBe(100n * ONE_SOCIAL);
  });

  it('requires a minimum join rally spend for eligibility', () => {
    const score = scoreSeasonZero(
      {
        ...baseSignals(),
        joinAmountYocto: SEASON_ZERO_JOIN_RALLY_MIN_YOCTO - 1n,
      },
      { joinMinYocto: SEASON_ZERO_JOIN_RALLY_MIN_YOCTO }
    );

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

  it('applies daily and season caps on social signals', () => {
    const normal = score(baseSignals());
    const burstDay = score({
      ...baseSignals(),
      daily: {
        endorsersByDay: [100],
        topicsByDay: [100],
        receivedStandsByDay: [100],
        mutualStandsByDay: [100],
      },
    });
    const steadySeason = score({
      ...baseSignals(),
      daily: {
        endorsersByDay: Array.from({ length: 20 }, () => 3),
        topicsByDay: Array.from({ length: 20 }, () => 2),
        receivedStandsByDay: Array.from({ length: 20 }, () => 4),
        mutualStandsByDay: Array.from({ length: 20 }, () => 2),
      },
    });

    expect(normal.breakdown.join).toBe(1_000);
    expect(burstDay.breakdown.endorsements).toBe(200);
    expect(burstDay.breakdown.solidarity).toBe(130);
    expect(burstDay.breakdown.endorsements).toBeLessThan(
      SEASON_ZERO_SCORING_LIMITS.endorsements.max
    );
    expect(steadySeason.breakdown.endorsements).toBe(
      SEASON_ZERO_SCORING_LIMITS.endorsements.max
    );
    expect(steadySeason.breakdown.solidarity).toBe(
      SEASON_ZERO_SCORING_LIMITS.solidarity.max
    );
    expect(steadySeason.breakdown.total).toBeLessThanOrEqual(
      SEASON_ZERO_SCORING_LIMITS.totalMax
    );
  });

  it('uses square-root weighting for spend-like signals', () => {
    const fourSocial = score({
      ...baseSignals(),
      supportReceivedYocto: 4n * ONE_SOCIAL,
      effectiveBoostYocto: 4n * ONE_SOCIAL,
    });
    const nineSocial = score({
      ...baseSignals(),
      supportReceivedYocto: 9n * ONE_SOCIAL,
      effectiveBoostYocto: 9n * ONE_SOCIAL,
    });

    expect(nineSocial.breakdown.support - fourSocial.breakdown.support).toBe(
      80
    );
    expect(nineSocial.breakdown.boost - fourSocial.breakdown.boost).toBe(60);
  });

  it('rewards consistent daily participation over a single burst day', () => {
    const oneBurst = score({
      ...baseSignals(),
      daily: {
        endorsersByDay: [3],
        topicsByDay: [2],
        receivedStandsByDay: [4],
        mutualStandsByDay: [2],
      },
    });
    const tenDays = score({
      ...baseSignals(),
      daily: {
        endorsersByDay: Array.from({ length: 10 }, () => 3),
        topicsByDay: Array.from({ length: 10 }, () => 2),
        receivedStandsByDay: Array.from({ length: 10 }, () => 4),
        mutualStandsByDay: Array.from({ length: 10 }, () => 2),
      },
    });

    expect(tenDays.breakdown.endorsements).toBeGreaterThan(
      oneBurst.breakdown.endorsements
    );
    expect(tenDays.breakdown.solidarity).toBeGreaterThan(
      oneBurst.breakdown.solidarity
    );
  });
});
