import { describe, expect, it } from 'vitest';

import { resolveSeasonZeroClaimMetricsStatus } from '@/features/season/season-zero-claim-copy';

describe('season-zero-claim-copy', () => {
  it('waits for claim status before showing interim wallet copy', () => {
    expect(
      resolveSeasonZeroClaimMetricsStatus({
        phase: 'claim_open',
        claim: null,
        accountId: 'alice.testnet',
        myStanding: null,
        claimStatusReady: false,
      })
    ).toBeNull();

    expect(
      resolveSeasonZeroClaimMetricsStatus({
        phase: 'claim_open',
        claim: null,
        accountId: null,
        myStanding: null,
        claimStatusReady: false,
      })
    ).toBeNull();
  });

  it('waits when on-chain claimed status is still unknown', () => {
    expect(
      resolveSeasonZeroClaimMetricsStatus({
        phase: 'claim_open',
        claim: {
          seasonId: 'season-two',
          accountId: 'alice.testnet',
          root: 'root',
          amountYocto: '189180000000000000000',
          proof: [],
          rank: 2,
          score: 1200,
          claimed: null,
        },
        accountId: 'alice.testnet',
        myStanding: null,
        claimStatusReady: true,
      })
    ).toBeNull();
  });

  it('uses collected copy with explorer link when claimed', () => {
    expect(
      resolveSeasonZeroClaimMetricsStatus({
        phase: 'claim_open',
        claim: {
          seasonId: 'season-two',
          accountId: 'alice.testnet',
          root: 'root',
          amountYocto: '189180000000000000000',
          proof: [],
          rank: 2,
          score: 1200,
          claimed: true,
          claimedTxHash: 'ABC123',
        },
        accountId: 'alice.testnet',
        myStanding: null,
        claimStatusReady: true,
      })
    ).toEqual({
      statusLabel: 'Collected',
      detailLine: '189.18 SOCIAL received',
      statusHref: 'https://testnet.nearblocks.io/txns/ABC123',
    });
  });
});
