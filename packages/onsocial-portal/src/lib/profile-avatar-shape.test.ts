import { describe, expect, it } from 'vitest';
import {
  isHeuristicDaoAccountId,
  portalAccountAvatarShape,
  portalAvatarRadiusClass,
} from '@/lib/profile-avatar-shape';

describe('portalAccountAvatarShape', () => {
  it('keeps three distinct geometries', () => {
    expect(portalAccountAvatarShape('alice.near', 'person')).toBe('circle');
    expect(portalAccountAvatarShape('studio.near', 'org')).toBe('squircle');
    expect(portalAccountAvatarShape('gov.sputnik-dao.near', 'dao')).toBe(
      'square'
    );
  });

  it('lets explicit org win over a DAO heuristic', () => {
    expect(portalAccountAvatarShape('demo.sputnik-dao.near', 'org')).toBe(
      'squircle'
    );
  });

  it('uses the DAO heuristic when kind is omitted', () => {
    expect(isHeuristicDaoAccountId('demo.sputnik-dao.near')).toBe(true);
    expect(portalAccountAvatarShape('demo.sputnik-dao.near')).toBe('square');
    expect(portalAccountAvatarShape('alice.near')).toBe('circle');
  });

  it('maps shapes to three distinct radius classes', () => {
    expect(
      new Set([
        portalAvatarRadiusClass('circle'),
        portalAvatarRadiusClass('squircle'),
        portalAvatarRadiusClass('square'),
      ]).size
    ).toBe(3);
  });
});
