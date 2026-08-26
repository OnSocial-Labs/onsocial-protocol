import { describe, expect, it } from 'vitest';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import {
  isProtocolFacePairDao,
  resolveProtocolFaceDaoKind,
} from '@/lib/portfolio-dao-entity';

describe('resolveProtocolFaceDaoKind', () => {
  it('detects governance and treasury faces', () => {
    expect(resolveProtocolFaceDaoKind(GOVERNANCE_DAO_ACCOUNT)).toBe(
      'governance'
    );
    expect(resolveProtocolFaceDaoKind(TREASURY_DAO_ACCOUNT)).toBe('treasury');
    expect(isProtocolFacePairDao(TREASURY_DAO_ACCOUNT)).toBe(true);
  });

  it('ignores people and other daos', () => {
    expect(resolveProtocolFaceDaoKind('greenghost.onsocial.testnet')).toBe(
      null
    );
    expect(
      resolveProtocolFaceDaoKind('some-community.sputnik-dao.testnet')
    ).toBe(null);
  });
});
