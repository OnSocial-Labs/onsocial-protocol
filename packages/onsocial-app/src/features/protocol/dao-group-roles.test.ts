import { describe, expect, it } from 'vitest';
import {
  countDaoGroupMembers,
  listDaoGroupRoleSections,
  listDaoMemberThresholdSections,
  listDaoMembershipSections,
} from '@/features/protocol/dao-group-roles';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

describe('dao-group-roles', () => {
  const policy: ProtocolDaoPolicy = {
    roles: [
      {
        name: 'council',
        kind: { Group: ['Alice.near', 'bob.near', 'alice.near'] },
      },
      {
        name: 'all',
        kind: { Group: [] },
      },
      {
        name: 'token holders',
        kind: { Member: '100000000000000000000' },
      },
      {
        name: '  ',
        kind: { Group: ['carol.near'] },
      },
      {
        name: 'guardians',
        kind: { Group: ['dave.near'] },
      },
      {
        name: 'dust',
        kind: { Member: '0' },
      },
      {
        name: 'broken',
        kind: { Member: 'not-a-number' },
      },
    ],
  };

  it('lists named Group roles with unique accounts', () => {
    expect(listDaoGroupRoleSections(policy)).toEqual([
      { roleName: 'council', accountIds: ['alice.near', 'bob.near'] },
      { roleName: 'guardians', accountIds: ['dave.near'] },
    ]);
  });

  it('lists Member threshold roles with positive stake', () => {
    expect(listDaoMemberThresholdSections(policy)).toEqual([
      {
        roleName: 'token holders',
        thresholdYocto: '100000000000000000000',
      },
    ]);
  });

  it('orders Group people before Member thresholds', () => {
    expect(listDaoMembershipSections(policy)).toEqual([
      {
        kind: 'group',
        roleName: 'council',
        accountIds: ['alice.near', 'bob.near'],
      },
      {
        kind: 'group',
        roleName: 'guardians',
        accountIds: ['dave.near'],
      },
      {
        kind: 'member',
        roleName: 'token holders',
        thresholdYocto: '100000000000000000000',
      },
    ]);
  });

  it('counts unique members across roles', () => {
    expect(countDaoGroupMembers(policy)).toBe(3);
  });

  it('handles null policy', () => {
    expect(listDaoGroupRoleSections(null)).toEqual([]);
    expect(listDaoMemberThresholdSections(null)).toEqual([]);
    expect(listDaoMembershipSections(undefined)).toEqual([]);
    expect(countDaoGroupMembers(undefined)).toBe(0);
  });
});
