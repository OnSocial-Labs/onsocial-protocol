import type { PublicPageConfig } from '../page-data';
import { mergePageMoodTheme, normalizePageMoodId } from '@onsocial/sdk';
import { isBuiltInMoodId, MOOD_PRESETS } from './presets';
import type {
  MoodId,
  MoodPreset,
  MoodThemeTokens,
  PageMoodRecord,
  ResolvedMood,
} from './types';

function themeTokensToCssVars(theme: MoodThemeTokens): Record<string, string> {
  return {
    ...moodPresetPreviewVars(theme),
    '--mood-banner': theme.banner,
    '--mood-preset-text': theme.text,
    '--mood-preset-text-light': theme.textLight,
    '--mood-preset-muted': theme.muted,
    '--mood-preset-muted-light': theme.mutedLight,
    '--mood-preset-banner-light': theme.bannerLight,
  };
}

/** Swatch vars for mood picker rows — CSS picks light/dark via `data-theme`. */
export function moodPresetPreviewVars(
  theme: MoodThemeTokens
): Record<string, string> {
  return {
    '--mood-accent': theme.accent,
    '--mood-surface': theme.surface,
    '--mood-preset-bg': theme.background,
    '--mood-preset-bg-light': theme.backgroundLight,
  };
}

function presetForId(id: MoodId): MoodPreset {
  const normalized = normalizePageMoodId(id) ?? (isBuiltInMoodId(id) ? id : null);
  if (normalized && isBuiltInMoodId(normalized)) {
    return MOOD_PRESETS[normalized];
  }

  return MOOD_PRESETS.protocol;
}

export function parsePageMoodRecord(
  config: PublicPageConfig
): PageMoodRecord | null {
  const raw = config.mood;
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as PageMoodRecord;
  if (typeof record.id !== 'string' || !record.id.trim()) {
    return null;
  }

  return {
    id: record.id.trim(),
    since: typeof record.since === 'number' ? record.since : undefined,
    note: typeof record.note === 'string' ? record.note : undefined,
  };
}

export function resolvePortfolioMood(config: PublicPageConfig): ResolvedMood {
  const record = parsePageMoodRecord(config);
  const rawId = record?.id ?? 'protocol';
  const id: MoodId = normalizePageMoodId(rawId) ?? rawId;
  const preset = presetForId(id);
  const theme = mergePageMoodTheme(preset.theme, config.theme);
  const cssVars = themeTokensToCssVars(theme);

  return {
    id,
    label: preset.label,
    tagline: preset.tagline,
    since: record?.since ?? null,
    note: record?.note?.trim() || null,
    cssVars,
  };
}
