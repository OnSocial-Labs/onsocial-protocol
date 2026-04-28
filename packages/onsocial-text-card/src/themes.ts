// ---------------------------------------------------------------------------
// Theme catalog. Curated, opinionated, finite. Every (background × font)
// combination is intentionally designed to look great — the user picks
// from chips, never from a colour wheel.
//
// To add a theme: extend the maps below. The manifest is auto-derived so
// any UI built against this package picks up new entries automatically.
// ---------------------------------------------------------------------------

/** Visual background presets (gradient + text + border + accent). */
export interface Background {
  /** Stable key persisted on-chain in `extra.theme.bg`. */
  key: BackgroundKey;
  /** Human label for chip UIs. */
  label: string;
  bgFrom: string;
  bgTo: string;
  textPrimary: string;
  textMuted: string;
  border: string;
  /** Quote glyph + author chip ring colour. Auto-paired with the bg. */
  accent: string;
}

export type BackgroundKey =
  | 'midnight'
  | 'paper'
  | 'mist'
  | 'aurora'
  | 'mono'
  | 'sand';

export const BACKGROUNDS: Record<BackgroundKey, Background> = {
  midnight: {
    key: 'midnight',
    label: 'Midnight',
    bgFrom: '#0B0D12',
    bgTo: '#1A1F2A',
    textPrimary: '#FFFFFF',
    textMuted: '#9AA3B2',
    border: '#22272F',
    accent: '#7C5CFF',
  },
  paper: {
    key: 'paper',
    label: 'Paper',
    bgFrom: '#F8F4EC',
    bgTo: '#EDE6D6',
    textPrimary: '#1A1410',
    textMuted: '#6B5E50',
    border: '#D6CCB8',
    accent: '#EC4899',
  },
  mist: {
    key: 'mist',
    label: 'Mist',
    bgFrom: '#1A2438',
    bgTo: '#2D3A52',
    textPrimary: '#FFFFFF',
    textMuted: '#A8B5CC',
    border: '#364261',
    accent: '#06B6D4',
  },
  aurora: {
    key: 'aurora',
    label: 'Aurora',
    bgFrom: '#3A1C71',
    bgTo: '#2C5364',
    textPrimary: '#FFFFFF',
    textMuted: '#C7B8E5',
    border: '#4A2D7A',
    accent: '#F59E0B',
  },
  mono: {
    key: 'mono',
    label: 'Mono',
    bgFrom: '#000000',
    bgTo: '#0A0A0A',
    textPrimary: '#FFFFFF',
    textMuted: '#888888',
    border: '#1F1F1F',
    accent: '#FFFFFF',
  },
  sand: {
    key: 'sand',
    label: 'Sand',
    bgFrom: '#E9DFC9',
    bgTo: '#C8B68A',
    textPrimary: '#2A2114',
    textMuted: '#5A4A2C',
    border: '#B8A572',
    accent: '#10B981',
  },
};

/** Typography modes — drive title font, weight, casing, and the quote glyph. */
export interface Font {
  /** Stable key persisted on-chain in `extra.theme.font`. */
  key: FontKey;
  /** Human label for chip UIs (rendered as 'Aa' in the chip). */
  label: string;
  titleFamily: string;
  descFamily: string;
  titleWeight: number;
  /** When true, title is rendered in UPPERCASE with letter-spacing. */
  titleUppercase: boolean;
  /** When true, the decorative " glyph is drawn in the top-left. */
  showQuoteGlyph: boolean;
  /** Hard cap on title length (chars). Statement mode is shorter on purpose. */
  titleMaxChars: number;
}

export type FontKey = 'quote' | 'statement' | 'mono';

export const FONTS: Record<FontKey, Font> = {
  quote: {
    key: 'quote',
    label: 'Aa',
    titleFamily: "Georgia, 'Times New Roman', serif",
    descFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    titleWeight: 700,
    titleUppercase: false,
    showQuoteGlyph: true,
    titleMaxChars: 120,
  },
  statement: {
    key: 'statement',
    label: 'Aa',
    titleFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    descFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    titleWeight: 800,
    titleUppercase: true,
    showQuoteGlyph: false,
    titleMaxChars: 60,
  },
  mono: {
    key: 'mono',
    label: 'Aa',
    titleFamily: "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
    descFamily:
      "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
    titleWeight: 700,
    titleUppercase: false,
    showQuoteGlyph: false,
    titleMaxChars: 100,
  },
};

/** Default theme used when callers don't specify (today's look). */
export const DEFAULT_THEME = { bg: 'midnight' as BackgroundKey, font: 'quote' as FontKey };

/** Resolve & normalise a theme spec. Unknown keys fall back to defaults. */
export function resolveTheme(spec?: {
  bg?: string;
  font?: string;
}): { bg: BackgroundKey; font: FontKey } {
  const bg = isBackgroundKey(spec?.bg) ? spec!.bg! : DEFAULT_THEME.bg;
  const font = isFontKey(spec?.font) ? spec!.font! : DEFAULT_THEME.font;
  return { bg, font };
}

export function isBackgroundKey(v: unknown): v is BackgroundKey {
  return typeof v === 'string' && v in BACKGROUNDS;
}

export function isFontKey(v: unknown): v is FontKey {
  return typeof v === 'string' && v in FONTS;
}

/**
 * UI manifest — what chips to render. Auto-derived from the maps so adding
 * a theme in one place updates every UI built against this package.
 */
export const THEME_MANIFEST = {
  backgrounds: Object.values(BACKGROUNDS).map((b) => ({
    key: b.key,
    label: b.label,
    bgFrom: b.bgFrom,
    bgTo: b.bgTo,
    accent: b.accent,
  })),
  fonts: Object.values(FONTS).map((f) => ({
    key: f.key,
    label: f.label,
    family: f.titleFamily,
    uppercase: f.titleUppercase,
  })),
} as const;
