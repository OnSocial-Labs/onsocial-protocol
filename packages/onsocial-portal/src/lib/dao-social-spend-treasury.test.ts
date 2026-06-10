import { describe, expect, it } from 'vitest';

import { resolveSocialSpendTreasuryCapabilities } from '@/lib/dao-social-spend-treasury-capabilities';

describe('resolveSocialSpendTreasuryCapabilities', () => {
  it('allows treasury DAO to sweep when it is treasury_id', () => {
    expect(
      resolveSocialSpendTreasuryCapabilities(
        'treasury.onsocial.testnet',
        'onsocial.testnet',
        'treasury.onsocial.testnet'
      )
    ).toEqual({
      canWithdrawTreasury: true,
      canFundSeasonPool: false,
      canFundSeasonPoolFromDaoWallet: true,
    });
  });

  it('allows owner DAO to sweep and fund', () => {
    expect(
      resolveSocialSpendTreasuryCapabilities(
        'onsocial.testnet',
        'onsocial.testnet',
        'treasury.onsocial.testnet'
      )
    ).toEqual({
      canWithdrawTreasury: true,
      canFundSeasonPool: true,
      canFundSeasonPoolFromDaoWallet: true,
    });
  });

  it('denies governance DAO when it is neither owner nor treasury_id', () => {
    expect(
      resolveSocialSpendTreasuryCapabilities(
        'governance.onsocial.testnet',
        'onsocial.testnet',
        'treasury.onsocial.testnet'
      )
    ).toEqual({
      canWithdrawTreasury: false,
      canFundSeasonPool: false,
      canFundSeasonPoolFromDaoWallet: false,
    });
  });
});
