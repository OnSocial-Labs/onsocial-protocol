import type { PageConfig, PageTheme } from '../../types.js';
import { PROTOCOL_COLORS } from '../../protocol-colors.js';

/** Built-in page mood ids stored in `page/main.mood.id`. */
export type BuiltInPageMoodId =
  | 'protocol'
  | 'lead'
  | 'creative'
  | 'business'
  | 'celebration';

/** Legacy mood id — resolves to {@link BuiltInPageMoodId protocol}. */
export type LegacyPageMoodId = 'default';

export interface PageMoodThemeTokens {
  background: string;
  /** Light OS theme — subtle full-page mood tint on white. */
  backgroundLight: string;
  text: string;
  muted: string;
  textLight: string;
  mutedLight: string;
  accent: string;
  banner: string;
  bannerLight: string;
  surface: string;
}

export interface PageMoodPreset {
  id: BuiltInPageMoodId;
  label: string;
  tagline: string;
  theme: PageMoodThemeTokens;
}

export const BUILT_IN_PAGE_MOOD_IDS = [
  'protocol',
  'lead',
  'business',
  'creative',
  'celebration',
] as const satisfies readonly BuiltInPageMoodId[];

const ONPAGE_TEXT_LIGHT = 'rgb(17 19 24 / 0.96)';
const ONPAGE_MUTED_LIGHT = 'rgb(17 19 24 / 0.45)';

/** Derive a mood surface tint from an accent color (`rgb(r g b / α)`). */
export function moodSurfaceFromAccent(accent: string, alpha = 0.06): string {
  const hex = accent.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (hex) {
    const raw = hex[1];
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    return `rgb(${r} ${g} ${b} / ${alpha})`;
  }

  const rgb = accent.match(
    /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*[\d.]+)?\s*\)$/i
  );
  if (rgb) {
    return `rgb(${rgb[1]} ${rgb[2]} ${rgb[3]} / ${alpha})`;
  }

  return accent;
}

/**
 * Merge on-chain `page/main.theme` overrides onto a built-in preset.
 * Light OS pairs (`*Light`, bannerLight) stay on the preset unless the
 * matching dark field is unchanged — accent overrides refresh `surface`.
 */
export function mergePageMoodTheme(
  preset: PageMoodThemeTokens,
  overrides?: PageTheme
): PageMoodThemeTokens {
  if (!overrides) {
    return preset;
  }

  const accent = overrides.accent ?? overrides.primary ?? preset.accent;
  const background = overrides.background ?? preset.background;
  const text = overrides.text ?? preset.text;
  const accentChanged = accent !== preset.accent;

  return {
    ...preset,
    accent,
    background,
    text,
    ...(accentChanged ? { surface: moodSurfaceFromAccent(accent) } : {}),
    ...(text !== preset.text
      ? {
          textLight: ONPAGE_TEXT_LIGHT,
          mutedLight: ONPAGE_MUTED_LIGHT,
        }
      : {}),
  };
}

export const PAGE_MOOD_PRESETS: Record<BuiltInPageMoodId, PageMoodPreset> = {
  protocol: {
    id: 'protocol',
    label: 'Protocol',
    tagline: 'OnSocial identity — standing, endorse, reputation, solidarity.',
    theme: {
      background: '#050505',
      backgroundLight: '#f7faff',
      text: 'rgb(255 255 255 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(255 255 255 / 0.42)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: PROTOCOL_COLORS.blue,
      banner:
        'radial-gradient(ellipse 85% 70% at 18% -8%, rgb(96 165 250 / 0.22), transparent 58%), radial-gradient(ellipse 75% 55% at 82% 12%, rgb(192 132 252 / 0.14), transparent 52%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(96 165 250 / 0.08), transparent 62%)',
      bannerLight:
        'radial-gradient(ellipse 85% 70% at 18% -8%, rgb(96 165 250 / 0.16), transparent 58%), radial-gradient(ellipse 75% 55% at 82% 12%, rgb(192 132 252 / 0.1), transparent 52%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(96 165 250 / 0.06), transparent 62%)',
      surface: moodSurfaceFromAccent(PROTOCOL_COLORS.blue),
    },
  },
  lead: {
    id: 'lead',
    label: 'Lead',
    tagline: 'Executive presence — sharp, confident, high contrast.',
    theme: {
      background: '#070605',
      backgroundLight: '#fbf8f2',
      text: 'rgb(255 252 245 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(255 248 235 / 0.44)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(212 175 106 / 0.95)',
      banner:
        'radial-gradient(ellipse 80% 65% at 22% -5%, rgb(212 175 106 / 0.22), transparent 55%), radial-gradient(ellipse 70% 50% at 78% 8%, rgb(255 248 235 / 0.08), transparent 50%), radial-gradient(ellipse 95% 55% at 50% 100%, rgb(212 175 106 / 0.07), transparent 60%)',
      bannerLight:
        'radial-gradient(ellipse 80% 65% at 22% -5%, rgb(212 175 106 / 0.14), transparent 55%), radial-gradient(ellipse 70% 50% at 78% 8%, rgb(212 175 106 / 0.06), transparent 50%), radial-gradient(ellipse 95% 55% at 50% 100%, rgb(212 175 106 / 0.05), transparent 60%)',
      surface: 'rgb(212 175 106 / 0.06)',
    },
  },
  business: {
    id: 'business',
    label: 'Business',
    tagline: 'Professional, restrained, trust-first presentation.',
    theme: {
      background: '#040608',
      backgroundLight: '#f4f8ff',
      text: 'rgb(240 246 255 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(180 198 220 / 0.48)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(120 176 255 / 0.92)',
      banner:
        'radial-gradient(ellipse 85% 68% at 15% -10%, rgb(120 176 255 / 0.2), transparent 56%), radial-gradient(ellipse 72% 52% at 85% 5%, rgb(180 210 255 / 0.1), transparent 48%), radial-gradient(ellipse 88% 58% at 50% 100%, rgb(120 176 255 / 0.07), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 85% 68% at 15% -10%, rgb(120 176 255 / 0.14), transparent 56%), radial-gradient(ellipse 72% 52% at 85% 5%, rgb(120 176 255 / 0.08), transparent 48%), radial-gradient(ellipse 88% 58% at 50% 100%, rgb(120 176 255 / 0.05), transparent 58%)',
      surface: 'rgb(120 176 255 / 0.06)',
    },
  },
  creative: {
    id: 'creative',
    label: 'Creative',
    tagline: 'Expressive energy for makers, artists, and builders.',
    theme: {
      background: '#06040a',
      backgroundLight: '#faf5ff',
      text: 'rgb(255 250 255 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(230 210 255 / 0.46)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(186 132 255 / 0.92)',
      banner:
        'radial-gradient(ellipse 82% 72% at 12% -8%, rgb(186 132 255 / 0.24), transparent 55%), radial-gradient(ellipse 68% 58% at 88% 10%, rgb(255 120 180 / 0.14), transparent 50%), radial-gradient(ellipse 92% 62% at 50% 100%, rgb(186 132 255 / 0.09), transparent 60%)',
      bannerLight:
        'radial-gradient(ellipse 82% 72% at 12% -8%, rgb(186 132 255 / 0.15), transparent 55%), radial-gradient(ellipse 68% 58% at 88% 10%, rgb(255 120 180 / 0.09), transparent 50%), radial-gradient(ellipse 92% 62% at 50% 100%, rgb(186 132 255 / 0.06), transparent 60%)',
      surface: 'rgb(186 132 255 / 0.07)',
    },
  },
  celebration: {
    id: 'celebration',
    label: 'Celebration',
    tagline: 'Mark a moment — launch, milestone, or thank-you.',
    theme: {
      background: '#0a0508',
      backgroundLight: '#fff5f8',
      text: 'rgb(255 250 252 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(255 210 220 / 0.48)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(255 120 160 / 0.95)',
      banner:
        'radial-gradient(ellipse 80% 70% at 20% -6%, rgb(255 120 160 / 0.24), transparent 54%), radial-gradient(ellipse 75% 55% at 80% 8%, rgb(255 200 100 / 0.16), transparent 50%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(255 140 170 / 0.1), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 80% 70% at 20% -6%, rgb(255 120 160 / 0.14), transparent 54%), radial-gradient(ellipse 75% 55% at 80% 8%, rgb(255 200 100 / 0.1), transparent 50%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(255 140 170 / 0.06), transparent 58%)',
      surface: 'rgb(255 120 160 / 0.08)',
    },
  },
};

export function isBuiltInPageMoodId(value: string): value is BuiltInPageMoodId {
  return (BUILT_IN_PAGE_MOOD_IDS as readonly string[]).includes(value);
}

/** Map stored mood ids to the current built-in set (`default` → `protocol`). */
export function normalizePageMoodId(id: string): BuiltInPageMoodId | null {
  const normalized = id === 'default' ? 'protocol' : id;
  return isBuiltInPageMoodId(normalized) ? normalized : null;
}

export function pageMoodPresetForId(id: string): PageMoodPreset {
  const normalized = normalizePageMoodId(id);
  if (normalized) {
    return PAGE_MOOD_PRESETS[normalized];
  }

  return PAGE_MOOD_PRESETS.protocol;
}

export function buildPageMoodPatch(
  moodId: BuiltInPageMoodId,
  opts?: { note?: string; now?: number }
): Pick<PageConfig, 'mood' | 'theme'> {
  const preset = PAGE_MOOD_PRESETS[moodId];

  return {
    mood: {
      id: moodId,
      since: opts?.now ?? Date.now(),
      ...(opts?.note ? { note: opts.note } : {}),
    },
    theme: moodThemeFromPreset(preset.theme),
  };
}

export function moodThemeFromPreset(theme: PageMoodThemeTokens): PageTheme {
  return {
    primary: theme.accent,
    background: theme.background,
    text: theme.text,
    accent: theme.accent,
  };
}

export function mergeMoodIntoPageConfig(
  current: PageConfig,
  moodId: BuiltInPageMoodId,
  opts?: { note?: string; now?: number }
): PageConfig {
  const patch = buildPageMoodPatch(moodId, opts);

  return {
    ...current,
    mood: patch.mood,
    theme: {
      ...current.theme,
      ...patch.theme,
    },
  };
}
