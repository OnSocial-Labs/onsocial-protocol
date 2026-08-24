import { describe, expect, it } from 'vitest';
import { getProtocolRoleMemberOptions } from '@/features/protocol/protocol-create';
import { isProtocolRemoveMemberReady } from '@/features/protocol/protocol-compose-remove-member-field';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

const policy: ProtocolDaoPolicy = {
  roles: [
    {
      name: 'guardians',
      kind: {
        Group: ['bob.testnet', 'alice.testnet', 'proposer.testnet'],
      },
      permissions: [],
      vote_policy: {},
    },
  ],
};

describe('getProtocolRoleMemberOptions', () => {
  it('lists sorted group members and excludes the proposer', () => {
    expect(
      getProtocolRoleMemberOptions(policy, 'guardians', {
        excludeAccountId: 'proposer.testnet',
      })
    ).toEqual(['alice.testnet', 'bob.testnet']);
  });

  it('returns empty when the role has no group members', () => {
    expect(getProtocolRoleMemberOptions(policy, 'missing')).toEqual([]);
  });
});

describe('isProtocolRemoveMemberReady', () => {
  it('requires a selected member from the role list', () => {
    expect(isProtocolRemoveMemberReady('', ['alice.testnet'])).toBe(false);
    expect(
      isProtocolRemoveMemberReady('alice.testnet', ['alice.testnet'])
    ).toBe(true);
    expect(
      isProtocolRemoveMemberReady('ghost.testnet', ['alice.testnet'])
    ).toBe(false);
  });
});
