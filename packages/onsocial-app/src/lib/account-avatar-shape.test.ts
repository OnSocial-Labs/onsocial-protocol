import { describe, expect, it } from 'vitest';
import { accountAvatarShape } from '@/lib/account-avatar-shape';

describe('accountAvatarShape', () => {
  it('keeps three distinct geometries', () => {
    expect(accountAvatarShape('alice.near', 'person')).toBe('circle');
    expect(accountAvatarShape('studio.near', 'org')).toBe('squircle');
    expect(accountAvatarShape('gov.sputnik-dao.near', 'dao')).toBe('square');
  });

  it('lets explicit org win over a DAO heuristic', () => {
    expect(accountAvatarShape('governance.onsocial.testnet', 'org', true)).toBe(
      'squircle'
    );
  });

  it('uses the DAO heuristic when kind is omitted', () => {
    expect(accountAvatarShape('demo.sputnik-dao.near')).toBe('square');
    expect(accountAvatarShape('alice.near')).toBe('circle');
  });
});
