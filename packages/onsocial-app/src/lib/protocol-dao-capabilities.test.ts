import { describe, expect, it } from 'vitest';
import { resolveProtocolDaoBoostInfraCapabilities } from '@/lib/protocol-dao-boost-infra-capabilities';
import { resolveProtocolDaoSocialSpendTreasuryCapabilities } from '@/lib/protocol-dao-social-spend-treasury-capabilities';

describe('protocol DAO social spend capabilities', () => {
  it('allows the owner or treasury account to fund seasons', () => {
    expect(
      resolveProtocolDaoSocialSpendTreasuryCapabilities(
        'Treasury.OnSocial.Testnet',
        'owner.onsocial.testnet',
        'treasury.onsocial.testnet'
      ).canFundSeasonPool
    ).toBe(true);

    expect(
      resolveProtocolDaoSocialSpendTreasuryCapabilities(
        'other.testnet',
        'owner.onsocial.testnet',
        'treasury.onsocial.testnet'
      ).canFundSeasonPool
    ).toBe(false);
  });

  it('lets only the social-spend owner start a rally season', () => {
    expect(
      resolveProtocolDaoSocialSpendTreasuryCapabilities(
        'owner.onsocial.testnet',
        'owner.onsocial.testnet',
        'treasury.onsocial.testnet'
      ).canSetSeasonConfig
    ).toBe(true);

    expect(
      resolveProtocolDaoSocialSpendTreasuryCapabilities(
        'treasury.onsocial.testnet',
        'owner.onsocial.testnet',
        'treasury.onsocial.testnet'
      ).canSetSeasonConfig
    ).toBe(false);
  });
});

describe('protocol DAO boost infra capabilities', () => {
  it('requires withdraw authority and a positive pool to withdraw', () => {
    expect(
      resolveProtocolDaoBoostInfraCapabilities({
        daoAccountId: 'treasury.onsocial.testnet',
        ownerId: 'boost.onsocial.testnet',
        infraWithdrawAuthority: 'treasury.onsocial.testnet',
        treasuryDaoAccountId: 'treasury.onsocial.testnet',
        infraPoolYocto: '1',
      }).canWithdrawBoostInfra
    ).toBe(true);

    expect(
      resolveProtocolDaoBoostInfraCapabilities({
        daoAccountId: 'treasury.onsocial.testnet',
        ownerId: 'boost.onsocial.testnet',
        infraWithdrawAuthority: 'treasury.onsocial.testnet',
        treasuryDaoAccountId: 'treasury.onsocial.testnet',
        infraPoolYocto: '0',
      }).canWithdrawBoostInfra
    ).toBe(false);
  });

  it('lets the owner set treasury authority until treasury is already authority', () => {
    expect(
      resolveProtocolDaoBoostInfraCapabilities({
        daoAccountId: 'boost.onsocial.testnet',
        ownerId: 'boost.onsocial.testnet',
        infraWithdrawAuthority: 'old.onsocial.testnet',
        treasuryDaoAccountId: 'treasury.onsocial.testnet',
        infraPoolYocto: '0',
      }).canSetBoostInfraAuthority
    ).toBe(true);

    expect(
      resolveProtocolDaoBoostInfraCapabilities({
        daoAccountId: 'boost.onsocial.testnet',
        ownerId: 'boost.onsocial.testnet',
        infraWithdrawAuthority: 'treasury.onsocial.testnet',
        treasuryDaoAccountId: 'treasury.onsocial.testnet',
        infraPoolYocto: '0',
      }).canSetBoostInfraAuthority
    ).toBe(false);
  });
});
