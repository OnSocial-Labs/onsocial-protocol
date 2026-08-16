import { describe, expect, it } from 'vitest';
import { extractGroupMembershipsFromPolicy } from '../../src/services/governance-dao-membership-store.js';

describe('extractGroupMembershipsFromPolicy', () => {
  it('indexes Group role members and merges multiple roles', () => {
    const memberships = extractGroupMembershipsFromPolicy({
      roles: [
        { name: 'guardians', kind: { Group: ['Alice.Near', 'bob.near'] } },
        { name: 'council', kind: { Group: ['bob.near', 'carol.near'] } },
        { name: 'tokenholders', kind: { Member: '1' } },
        { name: '', kind: { Group: ['skip.near'] } },
      ],
    });

    expect(memberships.get('alice.near')).toEqual(['guardians']);
    expect(memberships.get('bob.near')).toEqual(['council', 'guardians']);
    expect(memberships.get('carol.near')).toEqual(['council']);
    expect(memberships.has('skip.near')).toBe(false);
  });

  it('returns an empty map for null / empty policy', () => {
    expect(extractGroupMembershipsFromPolicy(null).size).toBe(0);
    expect(extractGroupMembershipsFromPolicy({ roles: [] }).size).toBe(0);
  });
});
