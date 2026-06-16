import { describe, expect, it } from 'vitest';

import { resolveSocialSpendTreasuryCapabilities } from '@/lib/dao-social-spend-treasury-capabilities';

describe('resolveSocialSpendTreasuryCapabilities', () => {
  it('allows treasury DAO to fund rally pools from its wallet', () => {
    expect(
      resolveSocialSpendTreasuryCapabilities(
        'treasury.onsocial.testnet',
        'onsocial.testnet',
        'treasury.onsocial.testnet'
      )
    ).toEqual({
      canFundSeasonPool: true,
    });
  });

  it('allows owner DAO to fund rally pools from its wallet', () => {
    expect(
      resolveSocialSpendTreasuryCapabilities(
        'onsocial.testnet',
        'onsocial.testnet',
        'treasury.onsocial.testnet'
      )
    ).toEqual({
      canFundSeasonPool: true,
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
      canFundSeasonPool: false,
    });
  });
});
