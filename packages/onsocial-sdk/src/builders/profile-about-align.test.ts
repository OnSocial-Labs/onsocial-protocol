import { describe, expect, it } from 'vitest';
import {
  PROFILE_ABOUT_ALIGN_DEFAULT,
  normalizeProfileAboutAlign,
  profileAboutAlignFromMaterialised,
} from './profile-about-align.js';

describe('normalizeProfileAboutAlign', () => {
  it('defaults unknown / empty to left', () => {
    expect(normalizeProfileAboutAlign('')).toBe('left');
    expect(normalizeProfileAboutAlign(null)).toBe('left');
    expect(normalizeProfileAboutAlign('wide')).toBe('left');
    expect(normalizeProfileAboutAlign(PROFILE_ABOUT_ALIGN_DEFAULT)).toBe(
      'left'
    );
  });

  it('accepts center and justify', () => {
    expect(normalizeProfileAboutAlign('center')).toBe('center');
    expect(normalizeProfileAboutAlign(' Justify ')).toBe('justify');
  });
});

describe('profileAboutAlignFromMaterialised', () => {
  it('reads aboutAlign and soft-reads extra', () => {
    expect(
      profileAboutAlignFromMaterialised({ aboutAlign: 'center' })
    ).toBe('center');
    expect(
      profileAboutAlignFromMaterialised({
        extra: { aboutAlign: 'justify' },
      })
    ).toBe('justify');
    expect(profileAboutAlignFromMaterialised(null)).toBe('left');
  });
});
