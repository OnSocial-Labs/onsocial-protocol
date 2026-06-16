import { describe, expect, it } from 'vitest';

import { resolveBoostInfraCapabilities } from '@/lib/dao-boost-infra-capabilities';

const TREASURY = 'treasury.onsocial.testnet';
const GOVERNANCE = 'governance.onsocial.testnet';
const OWNER = 'governance.onsocial.testnet';

describe('resolveBoostInfraCapabilities', () => {
  it('allows treasury DAO to withdraw when it is infra withdraw authority', () => {
    expect(
      resolveBoostInfraCapabilities({
        daoAccountId: TREASURY,
        ownerId: GOVERNANCE,
        infraWithdrawAuthority: TREASURY,
        treasuryDaoAccountId: TREASURY,
        infraPoolYocto: '1000000000000000000',
      })
    ).toEqual({
      canWithdrawBoostInfra: true,
      canSetBoostInfraAuthority: false,
    });
  });

  it('allows boost owner to set treasury authority when not yet delegated', () => {
    expect(
      resolveBoostInfraCapabilities({
        daoAccountId: OWNER,
        ownerId: OWNER,
        infraWithdrawAuthority: null,
        treasuryDaoAccountId: TREASURY,
        infraPoolYocto: '0',
      })
    ).toEqual({
      canWithdrawBoostInfra: false,
      canSetBoostInfraAuthority: true,
    });
  });

  it('hides set authority once treasury is already delegated', () => {
    expect(
      resolveBoostInfraCapabilities({
        daoAccountId: OWNER,
        ownerId: OWNER,
        infraWithdrawAuthority: TREASURY,
        treasuryDaoAccountId: TREASURY,
        infraPoolYocto: '1000000000000000000',
      }).canSetBoostInfraAuthority
    ).toBe(false);
  });
});
