import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { SeasonZeroStanding } from '../../src/services/seasons/season-standings.js';
import {
  buildSeasonZeroSettlementSnapshot,
  seasonRewardLeafHash,
} from '../../src/services/seasons/season-settlement.js';

function standing(
  accountId: string,
  rank: number,
  score: number,
  eligible = true
): SeasonZeroStanding {
  return {
    rank,
    accountId,
    joinedAtNs: String(rank),
    joinAmountYocto: '100000000000000000000',
    joinCount: 1,
    eligible,
    score,
    breakdown: {
      join: eligible ? 1000 : 0,
      profile: score - 1000,
      endorsements: 0,
      solidarity: 0,
      support: 0,
      boost: 0,
      total: score,
    },
    profile: {
      hasName: true,
      hasBio: true,
      hasAvatar: true,
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

function hashPair(left: Buffer, right: Buffer): Buffer {
  return createHash('sha256')
    .update(
      Buffer.concat(
        Buffer.compare(left, right) <= 0 ? [left, right] : [right, left]
      )
    )
    .digest();
}

function verifyProof(
  root: string,
  accountId: string,
  amountYocto: string,
  proof: string[],
  seasonId: string
): boolean {
  let hash = seasonRewardLeafHash(seasonId, accountId, amountYocto);
  for (const item of proof) {
    hash = hashPair(hash, Buffer.from(item, 'base64'));
  }
  return hash.toString('base64') === root;
}

describe('season-settlement', () => {
  it('allocates a mostly equal rebate with a capped score bonus', () => {
    const snapshot = buildSeasonZeroSettlementSnapshot(
      'season-one',
      [
        standing('alice.testnet', 1, 1500),
        standing('bob.testnet', 2, 1100),
        standing('carol.testnet', 3, 2000, false),
      ],
      '1000'
    );

    expect(snapshot.seasonId).toBe('season-one');

    expect(snapshot.totalAmountYocto).toBe('1000');
    expect(snapshot.participantCount).toBe(2);
    expect(snapshot.rewardCount).toBe(2);
    expect(snapshot.claims.map((claim) => claim.amountYocto)).toEqual([
      '667',
      '333',
    ]);
    expect(snapshot.policy).toEqual({
      baseRebateBps: 5000,
      scoreBonusBps: 5000,
      scoreWeight: 'score_minus_join_points',
    });
  });

  it('builds contract-compatible Merkle proofs', () => {
    const snapshot = buildSeasonZeroSettlementSnapshot(
      'season-one',
      [standing('alice.testnet', 1, 1500), standing('bob.testnet', 2, 1100)],
      '1000'
    );

    for (const claim of snapshot.claims) {
      expect(
        verifyProof(
          snapshot.root,
          claim.accountId,
          claim.amountYocto,
          claim.proof,
          'season-one'
        )
      ).toBe(true);
    }
  });

  it('uses the active season id in Merkle leaves', () => {
    const seasonOne = buildSeasonZeroSettlementSnapshot(
      'season-one',
      [standing('alice.testnet', 1, 1500)],
      '1000'
    );
    const seasonZero = buildSeasonZeroSettlementSnapshot(
      'season-zero',
      [standing('alice.testnet', 1, 1500)],
      '1000'
    );

    expect(seasonOne.root).not.toBe(seasonZero.root);
  });
});
