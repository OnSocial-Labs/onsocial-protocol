import { describe, expect, it } from 'vitest';

import {
  buildSeasonClaimOpenRows,
  seasonClaimOpenDedupeKey,
} from '../../src/services/seasons/season-claim-notification-plan.js';

describe('buildSeasonClaimOpenRows', () => {
  it('keeps positive claims with rank', () => {
    expect(
      buildSeasonClaimOpenRows([
        { account_id: 'alice.testnet', amount: '250000000000000000000', rank: 2 },
      ])
    ).toEqual([
      {
        accountId: 'alice.testnet',
        amount: '250000000000000000000',
        rank: 2,
      },
    ]);
  });

  it('skips zero and malformed amounts', () => {
    expect(
      buildSeasonClaimOpenRows([
        { account_id: 'alice.testnet', amount: '0', rank: 1 },
        { account_id: 'bob.testnet', amount: '', rank: 2 },
        { account_id: 'carol.testnet', amount: 'abc', rank: 3 },
        { account_id: 'dave.testnet', amount: '100', rank: 4 },
      ])
    ).toEqual([{ accountId: 'dave.testnet', amount: '100', rank: 4 }]);
  });

  it('dedupes accounts and normalizes case', () => {
    expect(
      buildSeasonClaimOpenRows([
        { account_id: 'Alice.testnet', amount: '10', rank: 1 },
        { account_id: 'alice.testnet', amount: '20', rank: 1 },
        { account_id: '  ', amount: '30', rank: 5 },
      ])
    ).toEqual([{ accountId: 'alice.testnet', amount: '10', rank: 1 }]);
  });

  it('drops non-positive ranks to zero', () => {
    expect(
      buildSeasonClaimOpenRows([
        { account_id: 'alice.testnet', amount: '10', rank: Number.NaN },
      ])
    ).toEqual([{ accountId: 'alice.testnet', amount: '10', rank: 0 }]);
  });
});

describe('seasonClaimOpenDedupeKey', () => {
  it('scopes the key to season and account', () => {
    expect(seasonClaimOpenDedupeKey('season-one', 'alice.testnet')).toBe(
      'season_claim_open:season-one:alice.testnet'
    );
  });
});
