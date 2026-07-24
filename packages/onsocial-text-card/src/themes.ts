// ---------------------------------------------------------------------------
// Theme catalog. The grid model:
//
//   6 voices  (typography personality)  ×  11 palettes  (finish / lighting)
//   = 66 standard moods, plus 1 special  = 67 total.
//
// Voice + palette are orthogonal in the picker but composed into one
// stable mood key for storage. Keys: `${voice}-${palette}` (e.g.
// `poster-noir`). The single special is `mono-matrix` — green-on-black
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
// Keys match curated formats 1:1 (except Proof, which reuses Mono type).

export const VOICES = [
  'thought',
  'poster',
  'letter',
  'journal',
  'mono',
  'receipt',
] as const;
export type Voice = (typeof VOICES)[number];

/**
 * Legacy voice prefixes still accepted from older minted `extra.theme.bg`.
 * `journal-*` stays Journal/Newsreader (its original meaning). Erica lives
 * under the new `letter-*` keys.
 */
const LEGACY_VOICE_ALIASES: Record<string, Voice> = {
  bold: 'thought',
  display: 'poster',
  serif: 'journal',
};

const SERIF_FAMILY =
  "'Newsreader', 'Source Serif 4', 'Source Serif Pro', 'Charter', serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
const SANS_FAMILY =
  "'DM Sans', -apple-system, 'SF Pro Display', 'Segoe UI Variable', 'Segoe UI', Roboto, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
const DISPLAY_FAMILY =
  "'Space Grotesk', 'DM Sans', -apple-system, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
const ERIKA_TYPE_FAMILY =
  "'Erica Type', 'Erika Type', 'DM Sans', -apple-system, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
const MONO_FAMILY =
  "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
/** Signature byline — matches app/portal chrome (DM Sans), system fallbacks for wallets. */
const SANS_BYLINE =
  "'DM Sans', Inter, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";

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
  thought: {
    label: 'Thought',
    tagline: 'DM Sans. Quiet, considered, sentence case.',
    titleFamily: SANS_FAMILY,
    titleWeight: 500,
    titleUppercase: false,
    titleLetterSpacing: -0.2,
    bylineFamily: SANS_BYLINE,
    titleCharsPerLine: 20,
    bylineMaxChars: 36,
  },
  poster: {
    label: 'Poster',
    tagline: 'Space Grotesk. Crisp, geometric, built for posters.',
    titleFamily: DISPLAY_FAMILY,
    titleWeight: 700,
    titleUppercase: true,
    titleLetterSpacing: 0.6,
    bylineFamily: SANS_BYLINE,
    // Caps run a bit wider than sentence case at the same size.
    titleCharsPerLine: 18,
    bylineMaxChars: 36,
  },
  letter: {
    label: 'Letter',
    tagline: 'Erica Type. Expressive, distinctive, unmistakably OnSocial.',
    titleFamily: ERIKA_TYPE_FAMILY,
    titleWeight: 400,
    titleUppercase: false,
    titleLetterSpacing: -0.3,
    bylineFamily: SANS_BYLINE,
    titleCharsPerLine: 20,
    bylineMaxChars: 36,
  },
  journal: {
    label: 'Journal',
    tagline: 'Newsreader. Quiet editorial serif.',
    titleFamily: SERIF_FAMILY,
    titleWeight: 500,
    titleUppercase: false,
    titleLetterSpacing: 0,
    bylineFamily: SANS_BYLINE,
    titleCharsPerLine: 20,
    bylineMaxChars: 36,
  },
  mono: {
    label: 'Mono',
    tagline: 'JetBrains Mono. Dev-native, terminal-adjacent.',
    titleFamily: MONO_FAMILY,
    titleWeight: 600,
    titleUppercase: false,
    titleLetterSpacing: 0,
    bylineFamily: MONO_FAMILY,
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
    titleCharsPerLine: 17,
    bylineMaxChars: 36,
  },
};

// ── Palettes ────────────────────────────────────────────────────────────────
// Four lighting finishes. Each declares the bg + the text colours that
// look good on that bg. Voice choice doesn't change these; bold-light
// and journal-light share the same cream + ink-black.

export const PALETTES = [
  'light',
  'mist',
  'sand',
  'sky',
  'night',
  'noir',
  'dusk',
  'forest',
  'graphite',
  'black',
  'white',
] as const;
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
    label: 'Paper',
    tagline: 'Cream off-white. Premium print stock, no warm cast.',
    bgFrom: '#FAFAF6',
    bgTo: '#F2F1EC',
    bgAngle: 180,
    textPrimary: '#0B0B0F',
    // Warm stone — not cool gray-500 (reads as link-blue next to black).
    textMuted: '#6F6E69',
  },
  mist: {
    label: 'Mist',
    tagline: 'Cool pale grey. Clean, quiet, contemporary.',
    bgFrom: '#F1F3F5',
    bgTo: '#E6E9EC',
    bgAngle: 180,
    textPrimary: '#15171A',
    textMuted: '#6E747B',
  },
  sand: {
    label: 'Sand',
    tagline: 'Warm stone. Grounded, tactile, understated.',
    bgFrom: '#F4EEE4',
    bgTo: '#E8DFD2',
    bgAngle: 180,
    textPrimary: '#211C17',
    textMuted: '#766C60',
  },
  sky: {
    label: 'Sky',
    tagline: 'Pale blue. Open, calm, clear.',
    bgFrom: '#E4F1FA',
    bgTo: '#C9DFF2',
    bgAngle: 160,
    textPrimary: '#102133',
    textMuted: '#5C6E80',
  },
  night: {
    label: 'Night',
    tagline: 'Deep navy with a subtle lift. Warm white type.',
    bgFrom: '#0E1320',
    bgTo: '#141A2B',
    bgAngle: 160,
    textPrimary: '#F5EFE6',
    // Warm taupe muted to match primary — avoid blue-gray #8A93A6.
    textMuted: '#9A948A',
  },
  noir: {
    label: 'Noir',
    tagline: 'Matte black. Editorial, photographic, high contrast.',
    bgFrom: '#0B0B0F',
    bgTo: '#14141A',
    bgAngle: 180,
    textPrimary: '#FFFFFF',
    textMuted: '#8A8A8A',
  },
  dusk: {
    label: 'Dusk',
    tagline: 'Indigo with violet lift. Moody, after-hours.',
    bgFrom: '#1A1A2E',
    bgTo: '#232342',
    bgAngle: 160,
    textPrimary: '#EDEAF7',
    // Soft lilac-gray, not saturated “link” blue-violet.
    textMuted: '#9E9AAD',
  },
  forest: {
    label: 'Forest',
    tagline: 'Deep green-black. Grounded and nocturnal.',
    bgFrom: '#0D1914',
    bgTo: '#14221B',
    bgAngle: 160,
    textPrimary: '#EDF4EC',
    textMuted: '#98A69A',
  },
  graphite: {
    label: 'Graphite',
    tagline: 'Dark grey. Refined, neutral, low-glare.',
    bgFrom: '#1A1B1F',
    bgTo: '#282A30',
    bgAngle: 180,
    textPrimary: '#F2F2F3',
    textMuted: '#A0A2A8',
  },
  black: {
    label: 'Black',
    tagline: 'True black. Absolute contrast and restraint.',
    bgFrom: '#000000',
    bgTo: '#090909',
    bgAngle: 180,
    textPrimary: '#FFFFFF',
    textMuted: '#969696',
  },
  white: {
    label: 'White',
    tagline: 'True white. Crisp, bright, unadorned.',
    bgFrom: '#FFFFFF',
    bgTo: '#F7F7F7',
    bgAngle: 180,
    textPrimary: '#0B0B0F',
    textMuted: '#6B6B70',
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
  'thought-night': 'Thought',
  'poster-noir': 'Poster',
  'letter-light': 'Letter',
  'journal-light': 'Journal',
  'mono-noir': 'Terminal',
  'receipt-light': 'Receipt',
  'mono-matrix': 'Matrix',
};

// Per-mood descriptions for the iconic ones. Other moods get
// `${voice.tagline} ${palette.tagline}` auto-composed.
const FRIENDLY_DESCRIPTIONS: Partial<Record<MoodKey, string>> = {
  'thought-night': 'Deep navy, quiet DM Sans. A considered thought.',
  'poster-noir': 'Matte black, Space Grotesk. A short statement.',
  'letter-light': 'Cream stock, Erica Type. Expressive and personal.',
  'journal-light': 'Cream off-white, Newsreader. Quiet editorial.',
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
export const DEFAULT_MOOD: MoodKey = 'thought-night';

/** Map a legacy or canonical mood string to a catalog key. */
export function canonicalizeMoodKey(raw: string): MoodKey | null {
  if (raw in MOODS) return raw as MoodKey;
  if (raw === 'mono-matrix') return 'mono-matrix';
  const dash = raw.indexOf('-');
  if (dash <= 0) return null;
  const legacyVoice = raw.slice(0, dash);
  const palette = raw.slice(dash + 1) as Palette;
  const voice = LEGACY_VOICE_ALIASES[legacyVoice];
  if (!voice || !PALETTES.includes(palette)) return null;
  return `${voice}-${palette}` as MoodKey;
}

/** Resolve & normalise a mood spec. Unknown keys fall back to the default. */
export function resolveMood(spec?: { bg?: string }): MoodKey {
  if (typeof spec?.bg !== 'string') return DEFAULT_MOOD;
  return canonicalizeMoodKey(spec.bg) ?? DEFAULT_MOOD;
}

export function isMoodKey(v: unknown): v is MoodKey {
  return typeof v === 'string' && canonicalizeMoodKey(v) != null;
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
