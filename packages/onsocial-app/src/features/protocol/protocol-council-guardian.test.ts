import { describe, expect, it } from 'vitest';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import {
  primaryProtocolCouncilGuardianRoleId,
  primaryProtocolCouncilGuardianRoleIdFromLabels,
  protocolCouncilGuardianRoleByAccount,
  protocolCouncilGuardianRoleIdForAccount,
} from '@/features/protocol/protocol-council-guardian';

const policy: ProtocolDaoPolicy = {
  roles: [
    {
      name: 'council',
      kind: { Group: ['bob.near', 'alice.near'] },
    },
    {
      name: 'guardians',
      kind: { Group: ['alice.near'] },
    },
    {
      name: 'all',
      kind: { Group: ['carol.near'] },
    },
  ],
};

describe('protocol council / guardian roles', () => {
  it('prefers guardians over council', () => {
    expect(
      primaryProtocolCouncilGuardianRoleId(['council', 'guardians'])
    ).toBe('guardians');
    expect(
      primaryProtocolCouncilGuardianRoleIdFromLabels(['Council', 'Guardian'])
    ).toBe('guardians');
  });

  it('resolves membership from policy groups', () => {
    expect(
      protocolCouncilGuardianRoleIdForAccount(policy, 'alice.near')
    ).toBe('guardians');
    expect(protocolCouncilGuardianRoleIdForAccount(policy, 'bob.near')).toBe(
      'council'
    );
    expect(
      protocolCouncilGuardianRoleIdForAccount(policy, 'carol.near')
    ).toBeNull();
  });

  it('builds an account map with guardians winning', () => {
    const map = protocolCouncilGuardianRoleByAccount(policy);
    expect(map.get('alice.near')).toBe('guardians');
    expect(map.get('bob.near')).toBe('council');
    expect(map.has('carol.near')).toBe(false);
  });
});
