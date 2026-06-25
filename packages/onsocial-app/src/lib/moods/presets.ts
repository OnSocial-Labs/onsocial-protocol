import {
  BUILT_IN_PAGE_MOOD_IDS,
  PAGE_MOOD_PICKER_SECTIONS,
  PAGE_MOOD_PRESETS,
  isBuiltInPageMoodId,
  type BuiltInPageMoodId,
  type PageMoodPreset,
  type PageMoodThemeTokens,
} from '@onsocial/sdk';

export type BuiltInMoodId = BuiltInPageMoodId;
export type MoodPreset = PageMoodPreset & { included: boolean };
export type MoodThemeTokens = PageMoodThemeTokens;

export const BUILT_IN_MOOD_IDS = BUILT_IN_PAGE_MOOD_IDS;

export { PAGE_MOOD_PICKER_SECTIONS };

export const MOOD_PRESETS: Record<BuiltInMoodId, MoodPreset> =
  Object.fromEntries(
    BUILT_IN_PAGE_MOOD_IDS.map((id) => [
      id,
      { ...PAGE_MOOD_PRESETS[id], included: true },
    ])
  ) as Record<BuiltInMoodId, MoodPreset>;

export const MOOD_PRESET_LIST = BUILT_IN_MOOD_IDS.map((id) => MOOD_PRESETS[id]);

export function isBuiltInMoodId(value: string): value is BuiltInMoodId {
  return isBuiltInPageMoodId(value);
}
