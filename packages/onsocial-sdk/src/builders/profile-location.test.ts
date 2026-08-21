import { describe, expect, it } from 'vitest';
import { buildProfileSetData } from './profile.js';
import {
  normalizeProfileLocationInput,
  profileLocationFromMaterialised,
  sanitizeProfileLocationDraft,
} from './profile-location.js';

describe('profile-location', () => {
  it('normalizes coarse based-in labels', () => {
    expect(normalizeProfileLocationInput('  Lisbon, Portugal  ')).toBe(
      'Lisbon, Portugal'
    );
    expect(normalizeProfileLocationInput('')).toBe('');
    expect(sanitizeProfileLocationDraft('Bay  Area')).toBe('Bay Area');
  });

  it('reads location from materialised profile or legacy extra', () => {
    expect(
      profileLocationFromMaterialised({ location: 'Tokyo', extra: {} })
    ).toBe('Tokyo');
    expect(
      profileLocationFromMaterialised({
        extra: { location: 'Lisbon' },
      })
    ).toBe('Lisbon');
  });

  it('clamps and clears location on profile set-data write', () => {
    const long = `${'A'.repeat(80)}  `;
    expect(buildProfileSetData({ location: long })).toEqual({
      'profile/v': '1',
      'profile/location': 'A'.repeat(64),
    });
    expect(buildProfileSetData({ location: '  ' })).toEqual({
      'profile/v': '1',
      'profile/location': null,
    });
    expect(buildProfileSetData({ location: null })).toEqual({
      'profile/v': '1',
      'profile/location': null,
    });
  });
});
