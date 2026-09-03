import { describe, expect, it } from 'vitest';
import { buildProfileSetData } from './profile.js';
import {
  normalizeProfileIndustryInput,
  profileIndustryFromMaterialised,
  profileOrgLineLabel,
  sanitizeProfileIndustryDraft,
} from './profile-industry.js';

describe('profile-industry', () => {
  it('normalizes a user-curated industry line', () => {
    expect(normalizeProfileIndustryInput('  Music  ')).toBe('Music');
    expect(normalizeProfileIndustryInput('')).toBe('');
    expect(sanitizeProfileIndustryDraft('Film  +  TV')).toBe('Film + TV');
  });

  it('reads industry from materialised profile or legacy extra', () => {
    expect(
      profileIndustryFromMaterialised({ industry: 'Design', extra: {} })
    ).toBe('Design');
    expect(
      profileIndustryFromMaterialised({
        extra: { industry: 'Publishing' },
      })
    ).toBe('Publishing');
  });

  it('falls back to Organization when empty', () => {
    expect(profileOrgLineLabel('')).toBe('Organization');
    expect(profileOrgLineLabel('  Music  ')).toBe('Music');
  });

  it('clamps and clears industry on profile set-data write', () => {
    const long = `${'A'.repeat(80)}  `;
    expect(buildProfileSetData({ industry: long })).toEqual({
      'profile/v': '1',
      'profile/industry': 'A'.repeat(64),
    });
    expect(buildProfileSetData({ industry: '  ' })).toEqual({
      'profile/v': '1',
      'profile/industry': null,
    });
    expect(buildProfileSetData({ industry: null })).toEqual({
      'profile/v': '1',
      'profile/industry': null,
    });
  });
});
