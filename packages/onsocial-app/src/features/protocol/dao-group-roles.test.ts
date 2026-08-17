import { describe, expect, it } from 'vitest';
import {
  countDaoGroupMembers,
  listDaoGroupRoleSections,
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
        kind: { Member: '1' },
      },
      {
        name: '  ',
        kind: { Group: ['carol.near'] },
      },
      {
        name: 'guardians',
        kind: { Group: ['dave.near'] },
      },
    ],
  };

  it('lists named Group roles with unique accounts', () => {
    expect(listDaoGroupRoleSections(policy)).toEqual([
      { roleName: 'council', accountIds: ['alice.near', 'bob.near'] },
      { roleName: 'guardians', accountIds: ['dave.near'] },
    ]);
  });

  it('counts unique members across roles', () => {
    expect(countDaoGroupMembers(policy)).toBe(3);
  });

  it('handles null policy', () => {
    expect(listDaoGroupRoleSections(null)).toEqual([]);
    expect(countDaoGroupMembers(undefined)).toBe(0);
  });
});
