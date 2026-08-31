import { describe, expect, it } from 'vitest';
import { enrichEndorsementSupporters } from './app-endorsement-supporters';

describe('enrichEndorsementSupporters', () => {
  it('joins profile name and avatar onto spend aggregates', () => {
    expect(
      enrichEndorsementSupporters(
        [
          {
            accountId: 'carol.testnet',
            totalAmountYocto: '2000000000000000000',
            spendCount: 2,
            latestSupportAt: 1_700_000_000_000,
          },
          {
            accountId: 'dave.testnet',
            totalAmountYocto: '1000000000000000000',
            spendCount: 1,
            latestSupportAt: null,
          },
        ],
        [
          {
            accountId: 'carol.testnet',
            name: 'Carol',
            avatar: 'https://cdn.example/carol.png',
          },
        ]
      )
    ).toEqual([
      {
        accountId: 'carol.testnet',
        name: 'Carol',
        avatarUrl: 'https://cdn.example/carol.png',
        totalAmountYocto: '2000000000000000000',
        spendCount: 2,
        latestSupportAt: 1_700_000_000_000,
      },
      {
        accountId: 'dave.testnet',
        name: null,
        avatarUrl: null,
        totalAmountYocto: '1000000000000000000',
        spendCount: 1,
        latestSupportAt: null,
      },
    ]);
  });

  it('returns an empty list when nobody has supported', () => {
    expect(enrichEndorsementSupporters([], [])).toEqual([]);
  });
});
