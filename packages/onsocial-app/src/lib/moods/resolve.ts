import type { PublicPageConfig } from '../page-data';
import {
  mergePageMoodTheme,
  mergePageMoodThemeForPicker,
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

/** Mood picker row — catalog preset + stored per-mood ink tints only. */
export function moodSheetRowPreviewVars(
  moodId: PageMoodId,
  presetTheme: MoodThemeTokens,
  pageTheme?: PublicPageConfig['theme']
): Record<string, string> {
  const merged = mergePageMoodThemeForPicker(presetTheme, pageTheme, moodId);
  return moodSheetItemPreviewVars(moodId, merged);
}

/**
 * Concrete per-row accent for the mood picker.
 * `@property --mood-accent` inherits from the sheet — set row accent inline instead.
 */
export function moodSheetRowInlineStyle(
  vars: Record<string, string>,
  fallbackAccent?: string,
  fallbackAccentLight?: string
): Record<string, string> {
  const accent = vars['--mood-preset-accent'] ?? fallbackAccent;
  if (!accent) {
    return vars;
  }

  const accentLight =
    vars['--mood-preset-accent-light'] ?? fallbackAccentLight ?? accent;

  return {
    ...vars,
    '--mood-row-accent': accent,
    '--mood-row-accent-light': accentLight,
  };
}

/** Mood thread for page content drawer — ambient wash + accent for grip. */
export function pageContentDrawerPanelStyle(
  cssVars: Record<string, string>
): Record<string, string> {
  const thread = moodDrawerThreadVars(cssVars);
  const accent = cssVars['--mood-preset-accent'] ?? cssVars['--mood-accent'];
  const accentLight =
    cssVars['--mood-preset-accent-light'] ??
    cssVars['--mood-accent-light'] ??
    accent;

  const style: Record<string, string> = { ...thread };

  if (accent) {
    style['--mood-accent'] = accent;
    style['--mood-preset-accent'] = accent;
    style['--mood-accent-chrome'] = accent;
  }

  if (accentLight) {
    style['--mood-preset-accent-light'] = accentLight;
  }

  const summonGrip = cssVars['--glass-summon-grip'];
  if (summonGrip) {
    style['--glass-summon-grip'] = summonGrip;
  }

  return style;
}

/**
 * Face gesture sheets (Support / Endorse) — carry page mood signal hues so
 * verb + presets match the face arrows, even though the sheet portals outside
 * the frame.
 */
export function supportSheetPanelStyle(
  cssVars: Record<string, string>
): Record<string, string> {
  const style: Record<string, string> = {};

  const signalKeys = [
    '--mood-signal-standing',
    '--mood-signal-solidarity',
    '--mood-signal-endorse',
    '--mood-signal-reputation',
  ] as const;

  for (const key of signalKeys) {
    const value = cssVars[key];
    if (value) style[key] = value;
  }

  const standing = cssVars['--mood-signal-standing'];
  const solidarity = cssVars['--mood-signal-solidarity'];
  const endorse = cssVars['--mood-signal-endorse'];
  const reputation = cssVars['--mood-signal-reputation'];

  if (standing) style['--signal-standing'] = standing;
  if (solidarity) style['--signal-solidarity'] = solidarity;
  if (endorse) style['--signal-endorse'] = endorse;
  if (reputation) {
    style['--signal-reputation'] = reputation;
    const rgb = cssColorToSpaceSeparatedRgb(reputation);
    if (rgb) style['--signal-reputation-rgb'] = rgb;
  }

  return style;
}

/** `rgb(0 236 151)` / `rgb(0, 236, 151)` → `0 236 151` for `rgb(var(--x) / a)`. */
function cssColorToSpaceSeparatedRgb(value: string): string | null {
  const match = value
    .trim()
    .match(
      /^rgba?\(\s*([\d.]+)\s*[,/\s]\s*([\d.]+)\s*[,/\s]\s*([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i
    );
  if (!match) return null;
  return `${Math.round(Number(match[1]))} ${Math.round(Number(match[2]))} ${Math.round(Number(match[3]))}`;
}

/** Ambient sheet thread without accent vars that leak into picker rows. */
export function moodSheetPanelStyle(
  cssVars: Record<string, string>
): Record<string, string> {
  const thread = moodDrawerThreadVars(cssVars);
  delete thread['--mood-preset-accent'];
  delete thread['--mood-preset-accent-light'];
  return thread;
}

/**
 * Inline shell vars — concrete accent/banner on the frame so `@property --mood-accent`
 * cannot inherit the committed mood from ancestors during live preview.
 */
export function portfolioMoodShellStyle(
  cssVars: Record<string, string>
): Record<string, string> {
  const accent = cssVars['--mood-preset-accent'] ?? cssVars['--mood-accent'];
  const accentLight =
    cssVars['--mood-preset-accent-light'] ??
    cssVars['--mood-accent-light'] ??
    accent;
  const surface = cssVars['--mood-surface'];
  const banner = cssVars['--mood-banner'];

  const style: Record<string, string> = { ...cssVars };

  if (accent) {
    style['--mood-accent'] = accent;
    style['--mood-preset-accent'] = accent;
  }

  if (accentLight) {
    style['--mood-preset-accent-light'] = accentLight;
  }

  if (surface) {
    style['--mood-surface'] = surface;
  }

  if (banner) {
    style['--mood-banner-active'] = banner;
  }

  return style;
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
  const moodId = signalMoodId(id, rawId);
  const theme = mergePageMoodTheme(preset.theme, config.theme, moodId);
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

/** Resolve live page preview — catalog mood colors + stored per-mood ink tints. */
export function resolvePortfolioMoodForPreview(
  config: PublicPageConfig,
  moodId: PageMoodId
): ResolvedMood {
  const preset = moodPresetForId(moodId);
  const resolvedId = resolvePageMoodId(moodId) ?? moodId;
  const theme = mergePageMoodThemeForPicker(
    preset.theme,
    config.theme,
    resolvedId
  );
  const cssVars = themeTokensToCssVars(theme, resolvedId);

  return {
    id: resolvedId,
    label: preset.label,
    tagline: preset.tagline,
    since: null,
    note: null,
    cssVars,
  };
}

/** Resolve picker / preview mood without mutating stored page mood. */
export function resolvePortfolioMoodForId(
  config: PublicPageConfig,
  moodId: PageMoodId
): ResolvedMood {
  const preset = moodPresetForId(moodId);
  const resolvedId = resolvePageMoodId(moodId) ?? moodId;
  const theme = mergePageMoodTheme(preset.theme, config.theme, resolvedId);
  const cssVars = themeTokensToCssVars(theme, resolvedId);

  return {
    id: resolvedId,
    label: preset.label,
    tagline: preset.tagline,
    since: null,
    note: null,
    cssVars,
  };
}
