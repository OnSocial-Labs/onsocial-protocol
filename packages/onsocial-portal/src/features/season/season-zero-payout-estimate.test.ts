import { describe, expect, it } from 'vitest';

import {
  allocateSeasonZeroClaims,
  estimateSeasonZeroPayouts,
} from '@/features/season/season-zero-payout-estimate';

describe('season-zero-payout-estimate', () => {
  it('matches backend settlement split for two live scores', () => {
    const allocations = allocateSeasonZeroClaims(1000n, [
      { accountId: 'alice.testnet', rank: 1, score: 1500 },
      { accountId: 'bob.testnet', rank: 2, score: 1100 },
    ]);

    expect(allocations.get('alice.testnet')?.toString()).toBe('667');
    expect(allocations.get('bob.testnet')?.toString()).toBe('333');
  });

  it('uses live standings for an exact personal collect estimate', () => {
    const estimate = estimateSeasonZeroPayouts({
      indexedPoolYocto: '1000',
      participantCount: 2,
      participants: [
        { accountId: 'alice.testnet', rank: 1, score: 1500, eligible: true },
        { accountId: 'bob.testnet', rank: 2, score: 1100, eligible: true },
      ],
      personalAccountId: 'bob.testnet',
    });

    expect(estimate?.exact).toBe(true);
    expect(estimate?.personalClaimYocto?.toString()).toBe('333');
  });

  it('falls back to rough estimates when the field is incomplete', () => {
    const estimate = estimateSeasonZeroPayouts({
      indexedPoolYocto: '1000',
      participantCount: 5,
      participants: [
        { accountId: 'alice.testnet', rank: 1, score: 1500, eligible: true },
        { accountId: 'bob.testnet', rank: 2, score: 1100, eligible: true },
      ],
      personalAccountId: 'bob.testnet',
    });

    expect(estimate?.exact).toBe(false);
    expect(estimate?.participantCount).toBe(5);
  });
});
