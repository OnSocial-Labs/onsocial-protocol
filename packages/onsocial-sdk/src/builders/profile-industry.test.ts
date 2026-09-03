import { describe, expect, it } from 'vitest';
import { buildProfileSetData } from './profile.js';
import {
  PROFILE_INDUSTRY_OPTIONS,
  PROFILE_INDUSTRY_WRITE_IN,
  isProfileIndustryWriteIn,
  matchProfileIndustryOption,
  normalizeProfileIndustryInput,
  profileIndustryChoiceOptions,
  profileIndustryDrawerValue,
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

  it('keeps a tight curated list without twins or DAO', () => {
    const values = PROFILE_INDUSTRY_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).not.toContain('DAOs');
    expect(values).not.toContain('DAO');
    expect(values).not.toContain('Other');
    expect(values).not.toContain('Tourism');
    expect(values).not.toContain('Restaurants');
    expect(values).not.toContain('Software');
    expect(
      PROFILE_INDUSTRY_OPTIONS.every((option) => option.value.length <= 64)
    ).toBe(true);
  });

  it('maps drawer values without persisting write-in', () => {
    expect(profileIndustryDrawerValue('')).toBe('');
    expect(profileIndustryDrawerValue('  gaming  ')).toBe('Gaming');
    expect(profileIndustryDrawerValue('Film + TV')).toBe(
      PROFILE_INDUSTRY_WRITE_IN
    );
    expect(isProfileIndustryWriteIn(PROFILE_INDUSTRY_WRITE_IN)).toBe(true);
    expect(
      matchProfileIndustryOption(PROFILE_INDUSTRY_WRITE_IN)
    ).toBeUndefined();
    expect(
      profileIndustryChoiceOptions().some(
        (option) => option.value === PROFILE_INDUSTRY_WRITE_IN
      )
    ).toBe(true);
    expect(
      buildProfileSetData({ industry: PROFILE_INDUSTRY_WRITE_IN })
    ).toEqual({
      'profile/v': '1',
      'profile/industry': null,
    });
  });
});
