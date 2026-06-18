import { describe, expect, it } from 'vitest';

import {
  deriveSeasonClaimRecord,
  recordSeasonClaimed,
  recordSeasonJoined,
  resolveArchiveSeasonClaimHint,
  resolveSeasonJoined,
} from '@/lib/season-participation-ledger';

describe('season-participation-ledger', () => {
  it('derives collected claim records from confirmed ledger', () => {
    const claims = new Map<string, true>();
    recordSeasonClaimed(claims, 'season_two');

    const derived = deriveSeasonClaimRecord(
      {
        seasonId: 'season_two',
        accountId: 'alice.testnet',
        root: 'abc',
        amountYocto: '1000',
        proof: [],
        rank: 1,
        score: 1,
        claimed: false,
      },
      claims
    );

    expect(derived?.claimed).toBe(true);
  });

  it('resolves archive hints as collected when ledger has a claim', () => {
    const claims = new Map<string, true>();
    recordSeasonClaimed(claims, 'season_two');

    expect(resolveArchiveSeasonClaimHint('season_two', 'collect', claims)).toBe(
      'collected'
    );
  });

  it('resolves joined state from confirmed ledger', () => {
    const joins = new Map<string, true>();
    recordSeasonJoined(joins, 'season_two');

    expect(resolveSeasonJoined(joins, 'season_two', false)).toBe(true);
  });
});
