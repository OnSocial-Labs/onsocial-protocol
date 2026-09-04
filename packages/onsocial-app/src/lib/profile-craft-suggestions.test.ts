import { describe, expect, it } from 'vitest';
import {
  DISCOVER_CUSTOM_CRAFT_MIN_COUNT,
  PROFILE_CRAFT_SUGGESTIONS,
  PROFILE_CRAFT_WRITE_IN,
  buildDiscoverCraftChoiceOptions,
  buildProfileCraftEditorOptions,
  profileCraftDrawerValue,
} from './profile-craft-suggestions';

describe('buildDiscoverCraftChoiceOptions', () => {
  it('always lists Any craft and the seed set', () => {
    const options = buildDiscoverCraftChoiceOptions();
    expect(options[0]).toEqual({ value: '', label: 'Any craft' });
    expect(
      options.filter((option) => option.section === 'Crafts')
    ).toHaveLength(PROFILE_CRAFT_SUGGESTIONS.length);
  });

  it('adds custom popular crafts at the min count', () => {
    const options = buildDiscoverCraftChoiceOptions([
      { tag: 'writer', profileCount: 12 },
      { tag: 'photographer', profileCount: DISCOVER_CUSTOM_CRAFT_MIN_COUNT },
      { tag: 'oneoff', profileCount: DISCOVER_CUSTOM_CRAFT_MIN_COUNT - 1 },
    ]);
    expect(options.some((option) => option.value === 'photographer')).toBe(
      true
    );
    expect(options.some((option) => option.value === 'oneoff')).toBe(false);
    const writer = options.find((option) => option.value === 'writer');
    expect(writer?.description).toBe('12 people');
    expect(writer?.section).toBe('Crafts');
  });
});

describe('buildProfileCraftEditorOptions', () => {
  it('lists seeds, selected customs, and write-in', () => {
    const options = buildProfileCraftEditorOptions(['writer', 'photographer']);
    expect(options.some((option) => option.value === 'writer')).toBe(true);
    expect(
      options.find((option) => option.value === 'writer')?.description
    ).toBe('Selected');
    expect(
      options.find((option) => option.value === 'photographer')
    ).toMatchObject({
      label: 'Photographer',
      section: 'Yours',
    });
    expect(options.at(-1)).toMatchObject({
      value: PROFILE_CRAFT_WRITE_IN,
      label: 'Write your own',
    });
  });
});

describe('profileCraftDrawerValue', () => {
  it('highlights the last selected craft', () => {
    expect(profileCraftDrawerValue([])).toBe('');
    expect(profileCraftDrawerValue(['writer', 'artist'])).toBe('artist');
  });
});
