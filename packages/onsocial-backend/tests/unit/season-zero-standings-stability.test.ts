import { describe, expect, it } from 'vitest';

import type { SeasonZeroStanding } from '../../src/services/seasons/season-zero-standings.js';
import {
  areSeasonZeroStandingsStable,
  seasonZeroStandingsSnapshot,
} from '../../src/services/seasons/season-zero-standings-stability.js';

function row(
  accountId: string,
  rank: number,
  score: number
): SeasonZeroStanding {
  return {
    rank,
    accountId,
    joinedAtNs: '1',
    joinAmountYocto: '100000000000000000000',
    joinCount: 1,
    eligible: true,
    score,
    breakdown: {
      join: 1000,
      profile: score - 1000,
      endorsements: 0,
      solidarity: 0,
      support: 0,
      boost: 0,
      total: score,
    },
    profile: {
      hasName: true,
      hasBio: false,
      hasAvatar: false,
      linkCount: 0,
    },
    signals: {
      uniqueEndorsers: 0,
      endorsementTopics: 0,
      receivedStands: 0,
      mutualStands: 0,
      supportReceivedYocto: '0',
      effectiveBoostYocto: '0',
    },
  };
}

describe('season-zero-standings-stability', () => {
  it('detects identical snapshots as stable', () => {
    const standings = [
      row('alice.testnet', 1, 1500),
      row('bob.testnet', 2, 1200),
    ];
    expect(areSeasonZeroStandingsStable(standings, standings)).toBe(true);
    expect(seasonZeroStandingsSnapshot(standings)).toEqual([
      { accountId: 'alice.testnet', rank: 1, score: 1500 },
      { accountId: 'bob.testnet', rank: 2, score: 1200 },
    ]);
  });

  it('detects score or rank drift as unstable', () => {
    const left = [row('alice.testnet', 1, 1500), row('bob.testnet', 2, 1200)];
    const right = [row('alice.testnet', 1, 1500), row('bob.testnet', 2, 1210)];
    expect(areSeasonZeroStandingsStable(left, right)).toBe(false);
  });

  it('detects participant count changes as unstable', () => {
    const left = [row('alice.testnet', 1, 1500)];
    const right = [row('alice.testnet', 1, 1500), row('bob.testnet', 2, 1200)];
    expect(areSeasonZeroStandingsStable(left, right)).toBe(false);
  });
});
