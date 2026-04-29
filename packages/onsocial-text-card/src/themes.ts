// ---------------------------------------------------------------------------
// Theme catalog. The grid model:
//
//   6 voices  (typography personality)  ×  4 palettes  (finish / lighting)
//   = 24 standard moods, plus 1 special  = 25 total.
//
// Voice + palette are orthogonal in the picker but composed into one
// stable mood key for storage. Keys: `${voice}-${palette}` (e.g.
// `display-noir`). The single special is `mono-matrix` — green-on-black
// terminal classic that lives outside the grid because the colour is
// part of its identity, not just a finish.
//
// Why one composed key instead of two fields? Future renderers and
// indexers see one stable string per card. No "what if voice exists but
// palette doesn't" reconciliation. The picker UI splits it back into
// two axes for the user; the wire format stays simple.
// ---------------------------------------------------------------------------

/** A fully-considered visual mood — voice × palette, co-tuned. */
export interface Mood {
  /** Stable key persisted on-chain. Format: `${voice}-${palette}` or special. */
  key: MoodKey;
  /** Human label for chip UIs. */
  label: string;
  /** One-line description (UI hint, not on the card). */
  description: string;

  // Background — single near-flat colour with a subtle gradient lift.
  bgFrom: string;
  bgTo: string;
  /** Gradient angle in degrees (0 = top→bottom, 135 = TL→BR). */
  bgAngle: number;

  // Typography
  titleFamily: string;
  titleWeight: number;
  titleUppercase: boolean;
  titleLetterSpacing: number;
  bylineFamily: string;

  // Colours
  textPrimary: string;
  textMuted: string;

  /**
   * Per-mood horizontal character budget for the wrapped title. Bold/uppercase
   * and monospace glyphs are wider than serif at the same point size, so each
   * voice declares what fits inside the padded canvas.
   */
  titleCharsPerLine: number;
  /** Per-mood handle character budget — keeps the byline on a single line. */
  bylineMaxChars: number;

  /**
   * Optional theme accent override for the signature rule. When omitted,
   * the user's deterministic per-account colour is used — preferred,
   * because it reinforces "this is mine" across every card the user mints.
   */
  accentOverride?: string;
}

// ── Voices ──────────────────────────────────────────────────────────────────
// Six type voices. Each is one typographic personality; palette decides
// the lighting. Adding a voice = one entry here + auto-generates 4 moods.

export const VOICES = [
  'serif',
  'display',
  'journal',
  'bold',
  'mono',
  'receipt',
] as const;
export type Voice = (typeof VOICES)[number];

const SERIF_FAMILY =
  "Georgia, 'Times New Roman', serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
const SANS_FAMILY =
  "'Inter', 'Inter Display', -apple-system, 'SF Pro Display', 'Segoe UI Variable', 'Segoe UI', Roboto, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
const EDITORIAL_FAMILY =
  "'Newsreader', 'Source Serif 4', 'Source Serif Pro', 'Charter', 'Iowan Old Style', Georgia, 'Times New Roman', serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
const MONO_FAMILY =
  "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
const SANS_BYLINE =
  "'Inter', -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";

interface VoiceSpec {
  label: string;
  /** Voice-specific tagline (not palette-aware). */
  tagline: string;
  titleFamily: string;
  titleWeight: number;
  titleUppercase: boolean;
  titleLetterSpacing: number;
  bylineFamily: string;
  titleCharsPerLine: number;
  bylineMaxChars: number;
}

const VOICE_SPECS: Record<Voice, VoiceSpec> = {
  serif: {
    label: 'Serif',
    tagline: 'Classic Georgia. Quiet, considered, evergreen.',
    titleFamily: SERIF_FAMILY,
    titleWeight: 600,
    titleUppercase: false,
    titleLetterSpacing: 0,
    bylineFamily: SANS_BYLINE,
    titleCharsPerLine: 22,
    bylineMaxChars: 36,
  },
  display: {
    label: 'Display',
    tagline: 'Modern geometric sans. Clean, current, confident.',
    titleFamily: SANS_FAMILY,
    titleWeight: 700,
    titleUppercase: false,
    titleLetterSpacing: -0.8,
    bylineFamily: SANS_BYLINE,
    titleCharsPerLine: 20,
    bylineMaxChars: 36,
  },
  journal: {
    label: 'Journal',
    tagline: 'Modern editorial serif. Premium magazine feel.',
    titleFamily: EDITORIAL_FAMILY,
    titleWeight: 500,
    titleUppercase: false,
    titleLetterSpacing: -0.3,
    bylineFamily: SANS_BYLINE,
    titleCharsPerLine: 22,
    bylineMaxChars: 36,
  },
  bold: {
    label: 'Bold',
    tagline: 'Sans 900 uppercase. For statements.',
    titleFamily: SANS_FAMILY,
    titleWeight: 900,
    titleUppercase: true,
    titleLetterSpacing: 1,
    bylineFamily: SANS_BYLINE,
    // Bold uppercase 900-weight is ~30% wider than serif. Tighter budget.
    titleCharsPerLine: 16,
    bylineMaxChars: 30,
  },
  mono: {
    label: 'Mono',
    tagline: 'JetBrains Mono. Dev-native, terminal-adjacent.',
    titleFamily: MONO_FAMILY,
    titleWeight: 600,
    titleUppercase: false,
    titleLetterSpacing: 0,
    bylineFamily: MONO_FAMILY,
    // Monospace glyphs are uniformly wide. Tighter budget.
    titleCharsPerLine: 18,
    bylineMaxChars: 28,
  },
  receipt: {
    label: 'Receipt',
    tagline: 'Short claim + photo as proof. For milestones, wins, evidence.',
    titleFamily: SANS_FAMILY,
    titleWeight: 700,
    titleUppercase: false,
    titleLetterSpacing: -0.6,
    bylineFamily: SANS_BYLINE,
    // Tight per-line budget; 60-char hard cap enforced in generator.
    titleCharsPerLine: 28,
    bylineMaxChars: 36,
  },
};

// ── Palettes ────────────────────────────────────────────────────────────────
// Four lighting finishes. Each declares the bg + the text colours that
// look good on that bg. Voice choice doesn't change these; bold-light
// and serif-light share the same cream + ink-black.

export const PALETTES = ['light', 'night', 'noir', 'dusk'] as const;
export type Palette = (typeof PALETTES)[number];

interface PaletteSpec {
  label: string;
  /** Palette-specific tagline (not voice-aware). */
  tagline: string;
  bgFrom: string;
  bgTo: string;
  bgAngle: number;
  textPrimary: string;
  textMuted: string;
}

const PALETTE_SPECS: Record<Palette, PaletteSpec> = {
  light: {
    label: 'Light',
    tagline: 'Cream off-white. Premium print stock, no warm cast.',
    bgFrom: '#FAFAF6',
    bgTo: '#F2F1EC',
    bgAngle: 180,
    textPrimary: '#0B0B0F',
    textMuted: '#6B7280',
  },
  night: {
    label: 'Night',
    tagline: 'Deep navy with a subtle lift. Warm white type.',
    bgFrom: '#0E1320',
    bgTo: '#141A2B',
    bgAngle: 160,
    textPrimary: '#F5EFE6',
    textMuted: '#8A93A6',
  },
  noir: {
    label: 'Noir',
    tagline: 'Matte black. Editorial, photographic, high contrast.',
    bgFrom: '#0B0B0F',
    bgTo: '#14141A',
    bgAngle: 180,
    textPrimary: '#FFFFFF',
    textMuted: '#7A7A82',
  },
  dusk: {
    label: 'Dusk',
    tagline: 'Indigo with violet lift. Moody, after-hours.',
    bgFrom: '#1A1A2E',
    bgTo: '#232342',
    bgAngle: 160,
    textPrimary: '#EDEAF7',
    textMuted: '#8B89A8',
  },
};

// ── Composed mood key types ─────────────────────────────────────────────────

export type StandardMoodKey = `${Voice}-${Palette}`;
export type SpecialMoodKey = 'mono-matrix';
export type MoodKey = StandardMoodKey | SpecialMoodKey;

// ── Friendly labels & descriptions ──────────────────────────────────────────
// Most moods just get "Voice — Palette" as their label. The iconic ones
// earn a single short word that travels in the picker and copy. Don't
// invent cute names that don't land — only override where there's an
// obvious good name.
const FRIENDLY_LABELS: Partial<Record<MoodKey, string>> = {
  'serif-light': 'Paper',
  'serif-night': 'Ink',
  'display-light': 'Display',
  'journal-light': 'Journal',
  'bold-noir': 'Bold',
  'mono-noir': 'Terminal',
  'receipt-light': 'Receipt',
  'mono-matrix': 'Matrix',
};

// Per-mood descriptions for the iconic ones. Other moods get
// `${voice.tagline} ${palette.tagline}` auto-composed.
const FRIENDLY_DESCRIPTIONS: Partial<Record<MoodKey, string>> = {
  'serif-light': 'Cream off-white, ink-black serif. Quiet, considered.',
  'serif-night': 'Deep navy, warm white serif. Thoughtful default.',
  'bold-noir': 'Matte black, white sans, very high weight. Statements.',
  'mono-noir': 'Mono on pure matte black. Terminal classic.',
  'receipt-light':
    'Short claim + photo as proof. For milestones, wins, evidence.',
  'mono-matrix':
    'Green-on-black mono. Dev / crypto-native. The one with the colour.',
};

// ── Catalog construction ────────────────────────────────────────────────────

function buildStandardMood(voice: Voice, palette: Palette): Mood {
  const v = VOICE_SPECS[voice];
  const p = PALETTE_SPECS[palette];
  const key = `${voice}-${palette}` as StandardMoodKey;
  const label = FRIENDLY_LABELS[key] ?? `${v.label} — ${p.label}`;
  const description = FRIENDLY_DESCRIPTIONS[key] ?? `${v.tagline} ${p.tagline}`;
  return {
    key,
    label,
    description,
    bgFrom: p.bgFrom,
    bgTo: p.bgTo,
    bgAngle: p.bgAngle,
    titleFamily: v.titleFamily,
    titleWeight: v.titleWeight,
    titleUppercase: v.titleUppercase,
    titleLetterSpacing: v.titleLetterSpacing,
    bylineFamily: v.bylineFamily,
    textPrimary: p.textPrimary,
    textMuted: p.textMuted,
    titleCharsPerLine: v.titleCharsPerLine,
    bylineMaxChars: v.bylineMaxChars,
  };
}

const MATRIX_MOOD: Mood = {
  key: 'mono-matrix',
  label: FRIENDLY_LABELS['mono-matrix']!,
  description: FRIENDLY_DESCRIPTIONS['mono-matrix']!,
  bgFrom: '#0A0E0A',
  bgTo: '#0E140E',
  bgAngle: 180,
  titleFamily: VOICE_SPECS.mono.titleFamily,
  titleWeight: VOICE_SPECS.mono.titleWeight,
  titleUppercase: VOICE_SPECS.mono.titleUppercase,
  titleLetterSpacing: VOICE_SPECS.mono.titleLetterSpacing,
  bylineFamily: VOICE_SPECS.mono.bylineFamily,
  textPrimary: '#D4FBC8',
  textMuted: '#5A8A55',
  accentOverride: '#7DFF6E',
  titleCharsPerLine: VOICE_SPECS.mono.titleCharsPerLine,
  bylineMaxChars: VOICE_SPECS.mono.bylineMaxChars,
};

export const MOODS: Record<MoodKey, Mood> = (() => {
  const out: Record<string, Mood> = {};
  for (const v of VOICES) {
    for (const p of PALETTES) {
      const k = `${v}-${p}` as StandardMoodKey;
      out[k] = buildStandardMood(v, p);
    }
  }
  out['mono-matrix'] = MATRIX_MOOD;
  return out as Record<MoodKey, Mood>;
})();

/** Default mood used when callers don't specify. */
export const DEFAULT_MOOD: MoodKey = 'serif-night';

/** Resolve & normalise a mood spec. Unknown keys fall back to the default. */
export function resolveMood(spec?: { bg?: string }): MoodKey {
  return isMoodKey(spec?.bg) ? (spec!.bg as MoodKey) : DEFAULT_MOOD;
}

export function isMoodKey(v: unknown): v is MoodKey {
  return typeof v === 'string' && v in MOODS;
}

/** Split a mood key back into its (voice, palette) — for picker UIs. */
export function splitMoodKey(
  key: MoodKey
): { voice: Voice; palette: Palette } | null {
  if (key === 'mono-matrix') return null;
  const dash = key.indexOf('-');
  const v = key.slice(0, dash) as Voice;
  const p = key.slice(dash + 1) as Palette;
  if (!VOICES.includes(v) || !PALETTES.includes(p)) return null;
  return { voice: v, palette: p };
}

/** Compose a mood key from voice + palette (picker UI helper). */
export function composeMoodKey(
  voice: Voice,
  palette: Palette
): StandardMoodKey {
  return `${voice}-${palette}`;
}

// ── Backwards-compatibility shims ───────────────────────────────────────────
// `font` is now mood-owned; the parameter is silently accepted but ignored.

export type BackgroundKey = MoodKey;
export type FontKey = 'quote' | 'statement' | 'mono';

export const BACKGROUNDS = MOODS;

export function isBackgroundKey(v: unknown): v is BackgroundKey {
  return isMoodKey(v);
}

/** Always returns true — kept for source-compat. Font is now mood-owned. */
export function isFontKey(v: unknown): v is FontKey {
  return typeof v === 'string';
}

export function resolveTheme(spec?: { bg?: string; font?: string }): {
  bg: MoodKey;
  font: FontKey;
} {
  return { bg: resolveMood(spec), font: 'quote' };
}

export const DEFAULT_THEME = { bg: DEFAULT_MOOD, font: 'quote' as FontKey };

/**
 * UI manifest — what chips to render. Auto-derived from the moods so adding
 * a voice or palette in one place updates every UI built against this package.
 */
export const THEME_MANIFEST = {
  voices: VOICES.map((k) => ({
    key: k,
    label: VOICE_SPECS[k].label,
    tagline: VOICE_SPECS[k].tagline,
  })),
  palettes: PALETTES.map((k) => ({
    key: k,
    label: PALETTE_SPECS[k].label,
    tagline: PALETTE_SPECS[k].tagline,
    bgFrom: PALETTE_SPECS[k].bgFrom,
    bgTo: PALETTE_SPECS[k].bgTo,
    textPrimary: PALETTE_SPECS[k].textPrimary,
  })),
  moods: Object.values(MOODS).map((m) => ({
    key: m.key,
    label: m.label,
    description: m.description,
    bgFrom: m.bgFrom,
    bgTo: m.bgTo,
    textPrimary: m.textPrimary,
  })),
  /** @deprecated Use `moods`. Kept for source-compat with v0.1. */
  backgrounds: Object.values(MOODS).map((m) => ({
    key: m.key,
    label: m.label,
    bgFrom: m.bgFrom,
    bgTo: m.bgTo,
    accent: m.accentOverride ?? m.textPrimary,
  })),
  /** @deprecated Fonts are now mood-owned. Kept for source-compat with v0.1. */
  fonts: [] as Array<{
    key: string;
    label: string;
    family: string;
    uppercase: boolean;
  }>,
} as const;
