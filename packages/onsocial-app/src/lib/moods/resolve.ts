import type { PageConfig } from '@onsocial/sdk';
import type { PublicPageConfig, PublicPageTheme } from '../page-data';
import { isBuiltInMoodId, MOOD_PRESETS } from './presets';
import type {
  BuiltInMoodId,
  MoodId,
  MoodPreset,
  MoodThemeTokens,
  PageMoodRecord,
  ResolvedMood,
} from './types';

function themeTokensToCssVars(theme: MoodThemeTokens): Record<string, string> {
  return {
    '--mood-bg': theme.background,
    '--mood-text': theme.text,
    '--mood-muted': theme.muted,
    '--mood-accent': theme.accent,
    '--mood-banner': theme.banner,
    '--mood-surface': theme.surface,
  };
}

function mergeTheme(
  preset: MoodThemeTokens,
  overrides?: PublicPageTheme
): MoodThemeTokens {
  if (!overrides) {
    return preset;
  }

  return {
    background: overrides.background ?? preset.background,
    text: overrides.text ?? preset.text,
    muted: preset.muted,
    accent: overrides.accent ?? overrides.primary ?? preset.accent,
    banner: preset.banner,
    surface: preset.surface,
  };
}

function presetForId(id: MoodId): MoodPreset {
  if (isBuiltInMoodId(id)) {
    return MOOD_PRESETS[id];
  }

  return MOOD_PRESETS.default;
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
  const id: MoodId = record?.id ?? 'default';
  const preset = presetForId(id);
  const theme = mergeTheme(preset.theme, config.theme);

  return {
    id,
    label: preset.label,
    tagline: preset.tagline,
    since: record?.since ?? null,
    note: record?.note?.trim() || null,
    cssVars: themeTokensToCssVars(theme),
  };
}

/** Patch for `page/main` when setting a mood (merge with existing config). */
export function buildPageMoodConfig(
  moodId: BuiltInMoodId,
  opts?: { note?: string; now?: number }
): Pick<PublicPageConfig, 'mood' | 'theme'> {
  const preset = MOOD_PRESETS[moodId];

  return {
    mood: {
      id: moodId,
      since: opts?.now ?? Date.now(),
      ...(opts?.note ? { note: opts.note } : {}),
    },
    theme: {
      primary: preset.theme.accent,
      background: preset.theme.background,
      text: preset.theme.text,
      accent: preset.theme.accent,
    },
  };
}

export function mergeMoodIntoPageConfig(
  current: PageConfig,
  moodId: BuiltInMoodId,
  opts?: { note?: string; now?: number }
): PageConfig {
  const patch = buildPageMoodConfig(moodId, opts);

  return {
    ...current,
    mood: patch.mood,
    theme: {
      ...current.theme,
      ...patch.theme,
    },
  };
}
