import { PALETTES, type MoodKey, type Palette, type Voice } from './themes.js';

/**
 * Locked layouts for minted cards. A format selects the layout and the
 * typography voice; callers may choose only from its curated finishes.
 *
 * Format keys and voice keys match 1:1 (Proof reuses the Mono voice).
 */
export const CARD_FORMATS = [
  'thought',
  'poster',
  'letter',
  'journal',
  'mono',
  'receipt',
  'proof',
] as const;

export type CardFormat = (typeof CARD_FORMATS)[number];

export interface CardFormatSpec {
  key: CardFormat;
  label: string;
  description: string;
  /** Maximum accepted title length before the gateway rejects the request. */
  maxCharacters: number;
  /** Maximum visual title lines. The renderer still measures and wraps words. */
  maxLines: number;
  /** A photo is required for this format. */
  requiresPhoto: boolean;
  /** Canonical typography for this format. */
  voice: Voice;
  /** Default finish when callers omit one. */
  defaultPalette: Palette;
  /** Finishes deliberately approved for this layout. */
  palettes: readonly Palette[];
}

const ALL_PALETTES = PALETTES;

export const CARD_FORMAT_REGISTRY: Record<CardFormat, CardFormatSpec> = {
  thought: {
    key: 'thought',
    label: 'Thought',
    description: 'A considered thought, set quietly.',
    maxCharacters: 108,
    maxLines: 6,
    requiresPhoto: false,
    voice: 'thought',
    defaultPalette: 'night',
    palettes: ALL_PALETTES,
  },
  poster: {
    key: 'poster',
    label: 'Poster',
    description: 'A short statement with presence.',
    maxCharacters: 80,
    maxLines: 4,
    requiresPhoto: false,
    voice: 'poster',
    defaultPalette: 'noir',
    palettes: ALL_PALETTES,
  },
  letter: {
    key: 'letter',
    label: 'Letter',
    description: 'An expressive excerpt in Erica Type.',
    maxCharacters: 120,
    maxLines: 6,
    requiresPhoto: false,
    voice: 'letter',
    defaultPalette: 'light',
    palettes: ALL_PALETTES,
  },
  journal: {
    key: 'journal',
    label: 'Journal',
    description: 'A measured editorial excerpt in Newsreader.',
    maxCharacters: 120,
    maxLines: 6,
    requiresPhoto: false,
    voice: 'journal',
    defaultPalette: 'light',
    palettes: ALL_PALETTES,
  },
  mono: {
    key: 'mono',
    label: 'Mono',
    description: 'A concise technical or terminal-native note.',
    maxCharacters: 80,
    maxLines: 6,
    requiresPhoto: false,
    voice: 'mono',
    defaultPalette: 'noir',
    palettes: ALL_PALETTES,
  },
  receipt: {
    key: 'receipt',
    label: 'Receipt',
    description: 'A short claim with the image as proof.',
    maxCharacters: 60,
    maxLines: 2,
    requiresPhoto: true,
    voice: 'receipt',
    defaultPalette: 'light',
    palettes: ALL_PALETTES,
  },
  proof: {
    key: 'proof',
    label: 'Proof',
    description: 'A photo-led record with a concise caption.',
    maxCharacters: 56,
    maxLines: 2,
    requiresPhoto: true,
    voice: 'mono',
    defaultPalette: 'noir',
    palettes: ALL_PALETTES,
  },
};

export const DEFAULT_CARD_FORMAT: CardFormat = 'thought';

export function isCardFormat(value: unknown): value is CardFormat {
  return (
    typeof value === 'string' &&
    (CARD_FORMATS as readonly string[]).includes(value)
  );
}

export function resolveCardFormat(value?: unknown): CardFormat {
  return isCardFormat(value) ? value : DEFAULT_CARD_FORMAT;
}

/** Resolve a stable mood key from a curated format + approved finish. */
export function moodForCardFormat(
  format: CardFormat,
  palette?: Palette
): MoodKey {
  const spec = CARD_FORMAT_REGISTRY[format];
  const selected =
    palette && spec.palettes.includes(palette) ? palette : spec.defaultPalette;
  return `${spec.voice}-${selected}` as MoodKey;
}

export function isCardFormatPalette(
  format: CardFormat,
  palette: unknown
): palette is Palette {
  return (
    typeof palette === 'string' &&
    (CARD_FORMAT_REGISTRY[format].palettes as readonly string[]).includes(
      palette
    )
  );
}
