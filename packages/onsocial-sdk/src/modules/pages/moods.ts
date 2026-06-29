import type { PageConfig, PageTheme } from '../../types.js';
import { PROTOCOL_COLORS } from '../../protocol-colors.js';
import {
  FINISH_MOOD_PRICE_SOCIAL,
  HOLOGRAPHIC_MOOD_PRICE_SOCIAL,
  isPremiumPageMoodId,
  SIGNATURE_MOOD_PRICE_SOCIAL,
  SUMMER_MOOD_PRICE_SOCIAL,
  VOICE_MOOD_PRICE_SOCIAL,
  type PageMoodCatalogEntry,
  type PremiumPageMoodId,
} from './premium-moods.js';

/** Built-in page mood ids stored in `page/main.mood.id`. */
export type BuiltInPageMoodId =
  | 'protocol'
  | 'lead'
  | 'business'
  | 'noir'
  | 'creative'
  | 'celebration'
  | 'build'
  | 'journal';

export type { PremiumPageMoodId } from './premium-moods.js';

/** Built-in + premium mood ids stored in `page/main.mood.id`. */
export type PageMoodId = BuiltInPageMoodId | PremiumPageMoodId;

/** Picker section order — ids must cover {@link BUILT_IN_PAGE_MOOD_IDS}. */
export const PAGE_MOOD_PICKER_SECTIONS: ReadonlyArray<{
  title: string | null;
  ids: readonly BuiltInPageMoodId[];
}> = [
  { title: null, ids: ['protocol'] },
  { title: 'Presence', ids: ['lead', 'business', 'noir'] },
  { title: 'Expression', ids: ['creative', 'celebration'] },
  { title: 'Voice', ids: ['build', 'journal'] },
];

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
  /** Light OS accent when it must differ from dark (e.g. ink on paper). */
  accentLight?: string;
  banner: string;
  bannerLight: string;
  surface: string;
}

/** CSS font stacks — pair with Next.js `--font-*` variables on OnPage. */
export const MOOD_FONT_STACKS = {
  sans: 'var(--font-space-grotesk), system-ui, sans-serif',
  mono: "var(--font-jetbrains-mono), ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
  editorial:
    "var(--font-newsreader), 'Source Serif 4', Georgia, 'Times New Roman', serif",
} as const;

/** Portfolio hero typography — keyed by mood id, not on-chain theme. */
export interface PageMoodTypography {
  fontDisplay: string;
  fontBody: string;
  displayWeight: number;
  displayLetterSpacing: string;
  bodyLineHeight: number;
  bioMaxWidth: string;
  /** When set, tightens bio + handle tracking (e.g. mono build). */
  bodyLetterSpacing?: string;
}

/**
 * Per-mood portfolio typography. Voice moods swap families; presence/expression
 * moods keep sans and tune weight/tracking only (text-card voice parity).
 */
export const MOOD_PAGE_TYPOGRAPHY: Record<PageMoodId, PageMoodTypography> = {
  protocol: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.04em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  lead: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.04em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  business: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.035em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  noir: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.03em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  creative: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 700,
    displayLetterSpacing: '-0.045em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  celebration: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.04em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  build: {
    fontDisplay: MOOD_FONT_STACKS.mono,
    fontBody: MOOD_FONT_STACKS.mono,
    displayWeight: 600,
    displayLetterSpacing: '-0.02em',
    bodyLineHeight: 1.5,
    bioMaxWidth: '20rem',
    bodyLetterSpacing: '-0.02em',
  },
  journal: {
    fontDisplay: MOOD_FONT_STACKS.editorial,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 500,
    displayLetterSpacing: '-0.02em',
    bodyLineHeight: 1.65,
    bioMaxWidth: '22rem',
  },
  summer: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.035em',
    bodyLineHeight: 1.58,
    bioMaxWidth: '21rem',
  },
  gold: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.038em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  glass: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.035em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  carbon: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.03em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  holographic: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 700,
    displayLetterSpacing: '-0.045em',
    bodyLineHeight: 1.55,
    bioMaxWidth: '20rem',
  },
  broadsheet: {
    fontDisplay: MOOD_FONT_STACKS.editorial,
    fontBody: MOOD_FONT_STACKS.editorial,
    displayWeight: 500,
    displayLetterSpacing: '-0.015em',
    bodyLineHeight: 1.68,
    bioMaxWidth: '24rem',
  },
  terminal: {
    fontDisplay: MOOD_FONT_STACKS.mono,
    fontBody: MOOD_FONT_STACKS.mono,
    displayWeight: 600,
    displayLetterSpacing: '-0.02em',
    bodyLineHeight: 1.48,
    bioMaxWidth: '20rem',
    bodyLetterSpacing: '-0.02em',
  },
  signature: {
    fontDisplay: MOOD_FONT_STACKS.sans,
    fontBody: MOOD_FONT_STACKS.sans,
    displayWeight: 600,
    displayLetterSpacing: '-0.03em',
    bodyLineHeight: 1.58,
    bioMaxWidth: '22rem',
  },
};

export function pageMoodTypographyFor(moodId: PageMoodId): PageMoodTypography {
  return MOOD_PAGE_TYPOGRAPHY[moodId];
}

export function moodTypographyToCssVars(
  typography: PageMoodTypography
): Record<string, string> {
  return {
    '--mood-font-display': typography.fontDisplay,
    '--mood-font-body': typography.fontBody,
    '--mood-display-weight': String(typography.displayWeight),
    '--mood-display-tracking': typography.displayLetterSpacing,
    '--mood-body-leading': String(typography.bodyLineHeight),
    '--mood-bio-max-width': typography.bioMaxWidth,
    ...(typography.bodyLetterSpacing
      ? { '--mood-body-tracking': typography.bodyLetterSpacing }
      : {}),
  };
}

/** Swatch + typography vars for mood picker rows and portfolio shell. */
export function pageMoodPreviewCssVars(
  moodId: PageMoodId,
  theme: PageMoodThemeTokens
): Record<string, string> {
  return {
    ...moodTypographyToCssVars(pageMoodTypographyFor(moodId)),
    '--mood-preset-accent': theme.accent,
    '--mood-preset-accent-light': theme.accentLight ?? theme.accent,
    '--mood-surface': theme.surface,
    '--mood-preset-bg': theme.background,
    '--mood-preset-bg-light': theme.backgroundLight,
  };
}

export interface PageMoodPreset {
  id: PageMoodId;
  label: string;
  tagline: string;
  theme: PageMoodThemeTokens;
}

export const BUILT_IN_PAGE_MOOD_IDS = [
  'protocol',
  'lead',
  'business',
  'noir',
  'creative',
  'celebration',
  'build',
  'journal',
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
  noir: {
    id: 'noir',
    label: 'Noir',
    tagline: 'Stealth executive — matte black, calm, precise.',
    theme: {
      background: '#050505',
      backgroundLight: '#f5f5f4',
      text: 'rgb(255 255 255 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(122 122 130 / 0.52)',
      mutedLight: 'rgb(113 113 122 / 0.55)',
      accent: 'rgb(212 212 216 / 0.94)',
      banner:
        'radial-gradient(ellipse 88% 62% at 50% -12%, rgb(255 255 255 / 0.05), transparent 58%), radial-gradient(ellipse 72% 48% at 82% 18%, rgb(161 161 170 / 0.04), transparent 52%)',
      bannerLight:
        'radial-gradient(ellipse 88% 62% at 50% -12%, rgb(17 19 24 / 0.04), transparent 58%), radial-gradient(ellipse 72% 48% at 82% 18%, rgb(113 113 122 / 0.05), transparent 52%)',
      surface: 'rgb(255 255 255 / 0.05)',
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
  build: {
    id: 'build',
    label: 'Build',
    tagline: 'Ship logs, repos, and on-chain craft.',
    theme: {
      background: '#030806',
      backgroundLight: '#f4faf2',
      text: 'rgb(212 251 200 / 0.96)',
      textLight: 'rgb(42 98 48 / 0.96)',
      muted: 'rgb(90 138 85 / 0.58)',
      mutedLight: 'rgb(65 105 72 / 0.55)',
      accent: PROTOCOL_COLORS.green,
      banner:
        'radial-gradient(ellipse 82% 68% at 16% -8%, rgb(74 222 128 / 0.18), transparent 56%), radial-gradient(ellipse 70% 52% at 84% 10%, rgb(212 251 200 / 0.06), transparent 50%), radial-gradient(ellipse 90% 58% at 50% 100%, rgb(74 222 128 / 0.06), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 82% 68% at 16% -8%, rgb(74 222 128 / 0.12), transparent 56%), radial-gradient(ellipse 70% 52% at 84% 10%, rgb(74 222 128 / 0.05), transparent 50%), radial-gradient(ellipse 90% 58% at 50% 100%, rgb(74 222 128 / 0.04), transparent 58%)',
      surface: moodSurfaceFromAccent(PROTOCOL_COLORS.green),
    },
  },
  journal: {
    id: 'journal',
    label: 'Journal',
    tagline: 'Longform presence — calm, readable, ink on paper.',
    theme: {
      background: '#0c0b0a',
      backgroundLight: '#faf9f7',
      text: 'rgb(250 249 247 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(161 161 170 / 0.52)',
      mutedLight: 'rgb(113 113 122 / 0.55)',
      accent: 'rgb(82 82 91 / 0.92)',
      banner:
        'radial-gradient(ellipse 84% 66% at 20% -6%, rgb(250 249 247 / 0.06), transparent 55%), radial-gradient(ellipse 76% 54% at 80% 8%, rgb(161 161 170 / 0.05), transparent 50%), radial-gradient(ellipse 92% 60% at 50% 100%, rgb(250 249 247 / 0.04), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 84% 66% at 20% -6%, rgb(17 19 24 / 0.03), transparent 55%), radial-gradient(ellipse 76% 54% at 80% 8%, rgb(113 113 122 / 0.04), transparent 50%), radial-gradient(ellipse 92% 60% at 50% 100%, rgb(17 19 24 / 0.02), transparent 58%)',
      surface: 'rgb(82 82 91 / 0.06)',
    },
  },
};

export const PREMIUM_PAGE_MOOD_PRESETS: Record<
  PremiumPageMoodId,
  PageMoodPreset
> = {
  summer: {
    id: 'summer',
    label: 'Summer',
    tagline: 'Golden hour — warm, open, seasonal presence.',
    theme: {
      background: '#0a0705',
      backgroundLight: '#fffaf3',
      text: 'rgb(255 252 245 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(255 228 196 / 0.48)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(255 168 88 / 0.95)',
      banner:
        'radial-gradient(ellipse 82% 68% at 18% -8%, rgb(255 168 88 / 0.24), transparent 56%), radial-gradient(ellipse 72% 54% at 82% 10%, rgb(255 220 120 / 0.14), transparent 52%), radial-gradient(ellipse 90% 58% at 50% 100%, rgb(255 140 60 / 0.1), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 82% 68% at 18% -8%, rgb(255 168 88 / 0.16), transparent 56%), radial-gradient(ellipse 72% 54% at 82% 10%, rgb(255 200 100 / 0.1), transparent 52%), radial-gradient(ellipse 90% 58% at 50% 100%, rgb(255 168 88 / 0.06), transparent 58%)',
      surface: 'rgb(255 168 88 / 0.06)',
    },
  },
  gold: {
    id: 'gold',
    label: 'Gold',
    tagline: 'Foil finish — luminous executive presence.',
    theme: {
      background: '#0a0805',
      backgroundLight: '#fffdf6',
      text: 'rgb(255 252 240 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(255 228 170 / 0.46)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(255 215 130 / 0.96)',
      banner:
        'radial-gradient(ellipse 80% 66% at 20% -6%, rgb(255 215 130 / 0.28), transparent 54%), radial-gradient(ellipse 72% 52% at 80% 8%, rgb(255 240 190 / 0.12), transparent 50%), radial-gradient(ellipse 92% 58% at 50% 100%, rgb(255 200 100 / 0.1), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 80% 66% at 20% -6%, rgb(255 215 130 / 0.16), transparent 54%), radial-gradient(ellipse 72% 52% at 80% 8%, rgb(255 215 130 / 0.08), transparent 50%), radial-gradient(ellipse 92% 58% at 50% 100%, rgb(255 200 100 / 0.06), transparent 58%)',
      surface: 'rgb(255 215 130 / 0.07)',
    },
  },
  glass: {
    id: 'glass',
    label: 'Glass',
    tagline: 'Frosted clarity — cool, precise, trust-first.',
    theme: {
      background: '#040608',
      backgroundLight: '#f2f8ff',
      text: 'rgb(240 248 255 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(180 210 240 / 0.5)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(180 220 255 / 0.94)',
      banner:
        'radial-gradient(ellipse 86% 70% at 14% -10%, rgb(180 220 255 / 0.22), transparent 56%), radial-gradient(ellipse 74% 54% at 86% 6%, rgb(240 250 255 / 0.1), transparent 48%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(180 220 255 / 0.08), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 86% 70% at 14% -10%, rgb(180 220 255 / 0.15), transparent 56%), radial-gradient(ellipse 74% 54% at 86% 6%, rgb(180 220 255 / 0.08), transparent 48%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(180 220 255 / 0.05), transparent 58%)',
      surface: 'rgb(180 220 255 / 0.06)',
    },
  },
  carbon: {
    id: 'carbon',
    label: 'Carbon',
    tagline: 'Matte carbon — stealth depth beyond noir.',
    theme: {
      background: '#030304',
      backgroundLight: '#f2f3f5',
      text: 'rgb(245 246 248 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(130 140 155 / 0.54)',
      mutedLight: 'rgb(100 110 120 / 0.52)',
      accent: 'rgb(140 150 165 / 0.92)',
      banner:
        'radial-gradient(ellipse 88% 64% at 50% -12%, rgb(100 120 150 / 0.08), transparent 58%), radial-gradient(ellipse 72% 50% at 82% 16%, rgb(60 70 85 / 0.06), transparent 52%), radial-gradient(ellipse 94% 56% at 50% 100%, rgb(80 90 110 / 0.05), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 88% 64% at 50% -12%, rgb(17 19 24 / 0.05), transparent 58%), radial-gradient(ellipse 72% 50% at 82% 16%, rgb(100 110 125 / 0.05), transparent 52%)',
      surface: 'rgb(140 150 165 / 0.06)',
    },
  },
  holographic: {
    id: 'holographic',
    label: 'Holographic',
    tagline: 'Iridescent finish — expressive, maker energy.',
    theme: {
      background: '#06040c',
      backgroundLight: '#faf5ff',
      text: 'rgb(255 250 255 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(220 200 255 / 0.48)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(180 140 255 / 0.95)',
      banner:
        'radial-gradient(ellipse 82% 72% at 10% -8%, rgb(180 140 255 / 0.26), transparent 54%), radial-gradient(ellipse 68% 58% at 90% 8%, rgb(80 220 255 / 0.16), transparent 50%), radial-gradient(ellipse 78% 62% at 50% 40%, rgb(255 120 180 / 0.12), transparent 52%), radial-gradient(ellipse 92% 60% at 50% 100%, rgb(180 140 255 / 0.1), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 82% 72% at 10% -8%, rgb(180 140 255 / 0.16), transparent 54%), radial-gradient(ellipse 68% 58% at 90% 8%, rgb(80 220 255 / 0.1), transparent 50%), radial-gradient(ellipse 78% 62% at 50% 40%, rgb(255 120 180 / 0.08), transparent 52%), radial-gradient(ellipse 92% 60% at 50% 100%, rgb(180 140 255 / 0.06), transparent 58%)',
      surface: 'rgb(180 140 255 / 0.07)',
    },
  },
  broadsheet: {
    id: 'broadsheet',
    label: 'Broadsheet',
    tagline: 'Editorial voice — headline presence, longform body.',
    theme: {
      background: '#0c0b0a',
      backgroundLight: '#faf9f7',
      text: 'rgb(250 249 247 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(161 161 170 / 0.52)',
      mutedLight: 'rgb(113 113 122 / 0.55)',
      accent: 'rgb(82 82 91 / 0.92)',
      accentLight: 'rgb(28 28 32 / 0.95)',
      banner:
        'radial-gradient(ellipse 84% 66% at 20% -6%, rgb(250 249 247 / 0.06), transparent 55%), radial-gradient(ellipse 76% 54% at 80% 8%, rgb(161 161 170 / 0.05), transparent 50%), radial-gradient(ellipse 92% 60% at 50% 100%, rgb(250 249 247 / 0.04), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 84% 66% at 20% -6%, rgb(17 19 24 / 0.03), transparent 55%), radial-gradient(ellipse 76% 54% at 80% 8%, rgb(113 113 122 / 0.04), transparent 50%)',
      surface: 'rgb(82 82 91 / 0.06)',
    },
  },
  terminal: {
    id: 'terminal',
    label: 'Terminal',
    tagline: 'Phosphor mono — ship logs and on-chain craft.',
    theme: {
      background: '#010402',
      backgroundLight: '#f0faf0',
      text: 'rgb(57 255 20 / 0.92)',
      textLight: 'rgb(32 115 42 / 0.96)',
      muted: 'rgb(40 120 30 / 0.58)',
      mutedLight: 'rgb(50 105 58 / 0.55)',
      accent: 'rgb(57 255 20 / 0.95)',
      banner:
        'radial-gradient(ellipse 82% 68% at 16% -8%, rgb(57 255 20 / 0.16), transparent 56%), radial-gradient(ellipse 70% 52% at 84% 10%, rgb(57 255 20 / 0.06), transparent 50%), radial-gradient(ellipse 90% 58% at 50% 100%, rgb(57 255 20 / 0.05), transparent 58%)',
      bannerLight:
        'radial-gradient(ellipse 82% 68% at 16% -8%, rgb(57 255 20 / 0.1), transparent 56%), radial-gradient(ellipse 70% 52% at 84% 10%, rgb(57 255 20 / 0.04), transparent 50%)',
      surface: 'rgb(57 255 20 / 0.05)',
    },
  },
  signature: {
    id: 'signature',
    label: 'Signature',
    tagline: 'Your mark — distinctive accent, refined sans voice.',
    theme: {
      background: '#050508',
      backgroundLight: '#f4fbff',
      text: 'rgb(240 250 255 / 0.96)',
      textLight: 'rgb(17 19 24 / 0.96)',
      muted: 'rgb(160 210 230 / 0.48)',
      mutedLight: 'rgb(17 19 24 / 0.45)',
      accent: 'rgb(56 189 248 / 0.95)',
      banner:
        'radial-gradient(ellipse 85% 68% at 18% -8%, rgb(56 189 248 / 0.2), transparent 56%), radial-gradient(ellipse 75% 55% at 82% 12%, rgb(96 165 250 / 0.12), transparent 52%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(56 189 248 / 0.08), transparent 62%)',
      bannerLight:
        'radial-gradient(ellipse 85% 68% at 18% -8%, rgb(56 189 248 / 0.14), transparent 56%), radial-gradient(ellipse 75% 55% at 82% 12%, rgb(56 189 248 / 0.08), transparent 52%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(56 189 248 / 0.05), transparent 62%)',
      surface: 'rgb(56 189 248 / 0.06)',
    },
  },
};

export const PAGE_MOOD_CATALOG: Record<string, PageMoodCatalogEntry> =
  Object.fromEntries([
    ...BUILT_IN_PAGE_MOOD_IDS.map(
      (id) => [id, { id, tier: 'free' as const }] as const
    ),
    [
      'summer',
      {
        id: 'summer',
        tier: 'premium' as const,
        packKind: 'seasonal' as const,
        relatedFreeMood: 'celebration',
        priceSocial: SUMMER_MOOD_PRICE_SOCIAL,
        availableUntil: '2026-09-30T23:59:59.000Z',
      },
    ] as const,
    [
      'gold',
      {
        id: 'gold',
        tier: 'premium' as const,
        packKind: 'finish' as const,
        relatedFreeMood: 'lead',
        priceSocial: FINISH_MOOD_PRICE_SOCIAL,
      },
    ] as const,
    [
      'glass',
      {
        id: 'glass',
        tier: 'premium' as const,
        packKind: 'finish' as const,
        relatedFreeMood: 'business',
        priceSocial: FINISH_MOOD_PRICE_SOCIAL,
      },
    ] as const,
    [
      'carbon',
      {
        id: 'carbon',
        tier: 'premium' as const,
        packKind: 'finish' as const,
        relatedFreeMood: 'noir',
        priceSocial: FINISH_MOOD_PRICE_SOCIAL,
      },
    ] as const,
    [
      'holographic',
      {
        id: 'holographic',
        tier: 'premium' as const,
        packKind: 'finish' as const,
        relatedFreeMood: 'creative',
        priceSocial: HOLOGRAPHIC_MOOD_PRICE_SOCIAL,
      },
    ] as const,
    [
      'broadsheet',
      {
        id: 'broadsheet',
        tier: 'premium' as const,
        packKind: 'voice' as const,
        relatedFreeMood: 'journal',
        priceSocial: VOICE_MOOD_PRICE_SOCIAL,
      },
    ] as const,
    [
      'terminal',
      {
        id: 'terminal',
        tier: 'premium' as const,
        packKind: 'voice' as const,
        relatedFreeMood: 'build',
        priceSocial: VOICE_MOOD_PRICE_SOCIAL,
      },
    ] as const,
    [
      'signature',
      {
        id: 'signature',
        tier: 'premium' as const,
        packKind: 'voice' as const,
        relatedFreeMood: 'protocol',
        priceSocial: SIGNATURE_MOOD_PRICE_SOCIAL,
      },
    ] as const,
  ]);

export function isBuiltInPageMoodId(value: string): value is BuiltInPageMoodId {
  return (BUILT_IN_PAGE_MOOD_IDS as readonly string[]).includes(value);
}

/** Map stored mood ids to the current catalog (`default` → `protocol`). */
export function resolvePageMoodId(id: string): PageMoodId | null {
  const normalized = id === 'default' ? 'protocol' : id;
  if (isBuiltInPageMoodId(normalized)) {
    return normalized;
  }
  if (isPremiumPageMoodId(normalized)) {
    return normalized;
  }
  return null;
}

/** Map stored mood ids to built-in ids only (`default` → `protocol`). */
export function normalizePageMoodId(id: string): BuiltInPageMoodId | null {
  const resolved = resolvePageMoodId(id);
  return resolved && isBuiltInPageMoodId(resolved) ? resolved : null;
}

export function pageMoodPresetForId(id: string): PageMoodPreset {
  const resolved = resolvePageMoodId(id);
  if (resolved) {
    if (isBuiltInPageMoodId(resolved)) {
      return PAGE_MOOD_PRESETS[resolved];
    }
    return PREMIUM_PAGE_MOOD_PRESETS[resolved];
  }

  return PAGE_MOOD_PRESETS.protocol;
}

export function buildPageMoodPatch(
  moodId: PageMoodId,
  opts?: { note?: string; now?: number }
): Pick<PageConfig, 'mood' | 'theme'> {
  const preset = pageMoodPresetForId(moodId);

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
  moodId: PageMoodId,
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
