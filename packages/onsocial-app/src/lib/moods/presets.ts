import {
  BUILT_IN_PAGE_MOOD_IDS,
  PAGE_MOOD_CATALOG,
  PAGE_MOOD_PICKER_SECTIONS,
  PAGE_MOOD_PICKER_STORE_SECTION,
  PAGE_MOOD_PICKER_STORE_SECTIONS,
  PAGE_MOOD_PRESETS,
  PREMIUM_PAGE_MOOD_IDS,
  PREMIUM_PAGE_MOOD_PRESETS,
  isBuiltInPageMoodId,
  isPremiumMoodAvailable,
  isPremiumPageMoodId,
  type BuiltInPageMoodId,
  type PageMoodPreset,
  type PageMoodThemeTokens,
  type PremiumPageMoodId,
} from '@onsocial/sdk';

export type BuiltInMoodId = BuiltInPageMoodId;
export type PremiumMoodId = PremiumPageMoodId;
export type MoodPreset = PageMoodPreset & { included: boolean };
export type MoodThemeTokens = PageMoodThemeTokens;

export const BUILT_IN_MOOD_IDS = BUILT_IN_PAGE_MOOD_IDS;
export const PREMIUM_MOOD_IDS = PREMIUM_PAGE_MOOD_IDS;

export { PAGE_MOOD_CATALOG, PAGE_MOOD_PICKER_SECTIONS, PAGE_MOOD_PICKER_STORE_SECTION, PAGE_MOOD_PICKER_STORE_SECTIONS };

export const MOOD_PRESETS: Record<BuiltInMoodId, MoodPreset> =
  Object.fromEntries(
    BUILT_IN_PAGE_MOOD_IDS.map((id) => [
      id,
      { ...PAGE_MOOD_PRESETS[id], included: true },
    ])
  ) as Record<BuiltInMoodId, MoodPreset>;

export const PREMIUM_MOOD_PRESETS: Record<PremiumMoodId, MoodPreset> =
  Object.fromEntries(
    PREMIUM_PAGE_MOOD_IDS.map((id) => [
      id,
      { ...PREMIUM_PAGE_MOOD_PRESETS[id], included: false },
    ])
  ) as Record<PremiumMoodId, MoodPreset>;

export const MOOD_PRESET_LIST = BUILT_IN_MOOD_IDS.map((id) => MOOD_PRESETS[id]);

export function isBuiltInMoodId(value: string): value is BuiltInMoodId {
  return isBuiltInPageMoodId(value);
}

export function isPremiumMoodId(value: string): value is PremiumMoodId {
  return isPremiumPageMoodId(value);
}

export function visiblePremiumMoodIds(now = Date.now()): PremiumMoodId[] {
  return PREMIUM_PAGE_MOOD_IDS.filter((id) =>
    isPremiumMoodAvailable(PAGE_MOOD_CATALOG[id], now)
  );
}

export function moodPresetForId(id: string): MoodPreset {
  if (isBuiltInMoodId(id)) {
    return MOOD_PRESETS[id];
  }
  if (isPremiumMoodId(id)) {
    return PREMIUM_MOOD_PRESETS[id];
  }
  return MOOD_PRESETS.protocol;
}
