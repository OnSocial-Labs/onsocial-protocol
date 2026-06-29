import type { PublicPageConfig } from '../page-data';
import {
  mergePageMoodTheme,
  moodSignalTokensToCssVars,
  pageMoodPreviewCssVars,
  pageMoodSignalsFor,
  resolvePageMoodId,
  type PageMoodId,
} from '@onsocial/sdk';
import { isBuiltInMoodId, moodPresetForId } from './presets';
import type {
  MoodId,
  MoodPreset,
  MoodThemeTokens,
  PageMoodRecord,
  ResolvedMood,
} from './types';

function signalMoodId(id: MoodId, rawId: string): PageMoodId {
  return resolvePageMoodId(rawId) ?? (isBuiltInMoodId(id) ? id : 'protocol');
}

function themeTokensToCssVars(
  theme: MoodThemeTokens,
  moodId: PageMoodId
): Record<string, string> {
  return {
    ...pageMoodPreviewCssVars(moodId, theme),
    ...moodSignalTokensToCssVars(pageMoodSignalsFor(moodId, theme.accent)),
    '--mood-banner': theme.banner,
    '--mood-preset-text': theme.text,
    '--mood-preset-text-light': theme.textLight,
    '--mood-preset-muted': theme.muted,
    '--mood-preset-muted-light': theme.mutedLight,
    '--mood-preset-banner-light': theme.bannerLight,
  };
}

/** Swatch + typography vars for mood picker rows (no banner). */
export function moodPresetPreviewVars(
  moodId: PageMoodId,
  theme: MoodThemeTokens
): Record<string, string> {
  return pageMoodPreviewCssVars(moodId, theme);
}

/** Accent-only vars for list-row mood hints (discover, standings previews). */
export function moodDiscoverHintVars(moodId: PageMoodId): Record<string, string> {
  const preset = moodPresetForId(moodId);
  return {
    '--mood-preset-accent': preset.theme.accent,
    '--mood-preset-accent-light':
      preset.theme.accentLight ?? preset.theme.accent,
  };
}

const MOOD_DRAWER_THREAD_KEYS = [
  '--mood-preset-accent',
  '--mood-preset-accent-light',
  '--mood-preset-bg',
  '--mood-preset-bg-light',
  '--mood-banner',
  '--mood-preset-banner-light',
] as const;

/** Mood thread for page drawer — ambient + accent, not full typography wash. */
export function moodDrawerThreadVars(
  cssVars: Record<string, string>
): Record<string, string> {
  const thread: Record<string, string> = {};
  for (const key of MOOD_DRAWER_THREAD_KEYS) {
    const value = cssVars[key];
    if (value) {
      thread[key] = value;
    }
  }
  return thread;
}

/** Picker row vars including banner gradients (finish material preview). */
export function moodSheetItemPreviewVars(
  moodId: PageMoodId,
  theme: MoodThemeTokens
): Record<string, string> {
  return {
    ...moodPresetPreviewVars(moodId, theme),
    '--mood-banner': theme.banner,
    '--mood-preset-text': theme.text,
    '--mood-preset-text-light': theme.textLight,
    '--mood-preset-muted': theme.muted,
    '--mood-preset-muted-light': theme.mutedLight,
    '--mood-preset-banner-light': theme.bannerLight,
  };
}

function presetForId(id: MoodId): MoodPreset {
  const resolved = resolvePageMoodId(id);
  if (resolved) {
    return moodPresetForId(resolved);
  }

  return moodPresetForId('protocol');
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
  const id: MoodId = resolvePageMoodId(rawId) ?? rawId;
  const preset = presetForId(id);
  const theme = mergePageMoodTheme(preset.theme, config.theme);
  const moodId = signalMoodId(id, rawId);
  const cssVars = themeTokensToCssVars(theme, moodId);

  return {
    id,
    label: preset.label,
    tagline: preset.tagline,
    since: record?.since ?? null,
    note: record?.note?.trim() || null,
    cssVars,
  };
}
