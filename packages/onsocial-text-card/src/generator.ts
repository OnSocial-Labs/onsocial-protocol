// ---------------------------------------------------------------------------
// Pure SVG text-card generator — runs identically in Node and the browser.
//
// Design (v0.3 — "editorial"):
//   - The thought is the hero. Top-anchored, big, alone.
//   - The author's deterministic colour lives in a small "mark" at the
//     top-left — the only ornamentation besides the optional byline avatar.
//   - Byline signature (always the same pattern):
//       [avatar?] Name          ← optional frozen face + DM Sans name
//                 accountId     ← full unique id (no @ / ~ prefix)
//       OnSocial · 18 Jul 26 · 21:14 · postId  ← quiet provenance
//     Avatar is optional; when present it is inlined (data URI) at mint so
//     the permanent PNG does not depend on a live profile URL. No distinct
//     name → accountId alone. Title owns the voice fonts; the signature
//     stays a calm UI sans (mono voice → mono).
//   - No description on the card (stays in NFT metadata).
//
// Customisation (v0.3.1 — small, opinionated knobs):
//   - `theme.markColor`: lock the mark to a named palette colour instead
//     of the deterministic per-account hash. The deterministic colour is
//     itself a signal; the override is a stronger one ("my mark is
//     always green").
//   - `theme.markShape`: pick from {rule, dot, square, bar} — same
//     visual mass, different personality.
//   - `theme.titleAlign`: 'left' (default, editorial) or 'center' (poem).
//
// Emoji handling (v0.3.1 / v0.6):
//   - Wrap & width estimation segment by grapheme cluster (Intl.Segmenter)
//     so multi-codepoint emoji like 🏳️‍🌈 count as one symbol, and width
//     accounts for emoji glyphs being roughly square (~1.0× the font
//     size, vs ~0.55× for Latin).
//   - Font-family chains include emoji fallbacks ('Apple Color Emoji',
//     'Segoe UI Emoji', 'Noto Color Emoji') for browser preview.
//   - Permanent PNG mint loads Noto Color Emoji when the host ships it
//     (gateway Docker installs font-noto-emoji) so preview ≈ mint.
//
// Layout (v0.6):
//   - Unified inset (64px). Wrap / fit use per-voice advance ratios
//     (fontkit-calibrated) + letter-spacing, not raw character counts.
//   - Long tokens (@account, URLs, $TICKER) soft-break on punctuation
//     before falling back to grapheme hard-break + ellipsis.
//
// Zero deps. Returns raw SVG markup.
// ---------------------------------------------------------------------------

import {
  MOODS,
  resolveMood,
  familyForResvgWeight,
  type Mood,
  type MoodKey,
} from './themes.js';
import {
  CARD_FORMAT_REGISTRY,
  isCardFormat,
  type CardFormat,
} from './formats.js';

const WIDTH = 600;
const HEIGHT = 600;
/** Edge inset — keep title/byline off the trim for every voice. */
const PADDING = 64;
const CONTENT_WIDTH = WIDTH - PADDING * 2;

// Author mark.
const MARK_RULE_W = 36;
const MARK_RULE_H = 3;
const MARK_DOT_R = 5; // radius
const MARK_SQUARE = 10;
const MARK_BAR_W = 4;
const MARK_BAR_H = 24;
/** Clear air between the mark's bottom edge and the title's cap line. */
const MARK_GAP_BELOW = 28;
/**
 * Cap-height ≈ this fraction of `font-size` for Latin display faces.
 * Title baseline = visualTop + fontSize × ratio so the pad edge meets
 * the tops of capitals, not the em box (which floats above the glyphs).
 */
const TITLE_CAP_HEIGHT_RATIO = 0.7;

// Title.
// Auto-shrink ladder — try the largest first; drop a step if the text
// won't fit in TITLE_MAX_LINES at the measured pixel budget. Wide faces
// (Letter / Mono) use a deeper floor so longer copy packs the column
// instead of sitting sparse at 44px. Line-height tracks font size 1.27×.
const TITLE_FONT_SIZES = [44, 40, 36, 32] as const;
/** Deeper floor for wide / mono voices — fill width before truncating. */
const TITLE_FONT_SIZES_DENSE = [44, 40, 36, 32, 28] as const;
const TITLE_LINE_HEIGHT_RATIO = 56 / 44; // ~1.27
const TITLE_MAX_LINES = 7;
/** Poster locks base size — ALL CAPS presence, no shrink ladder. */
const POSTER_TITLE_FONT_SIZE = TITLE_FONT_SIZES[0];
/** Soften cover type so it sits in the stock, not on top of it. */
const TITLE_FILL_OPACITY = 0.92;

// Byline (bottom band) — one signature stamp, two opacities of the same ink.
// Tight stack + shared hue so name and id feel embedded, not two labels.
const BYLINE_NAME_SIZE = 17;
const BYLINE_HANDLE_SIZE = 13;
/** Only used when a very long account id won't fit at the default handle size. */
const BYLINE_HANDLE_FLOOR = 12;
const BYLINE_STACK_GAP = 5; // px between name baseline and handle baseline
const BYLINE_NAME_OPACITY = 0.72;
const BYLINE_HANDLE_OPACITY = 0.42;
const BYLINE_SOLO_OPACITY = 0.55;
const BYLINE_PROVENANCE_SIZE = 11;
const BYLINE_PROVENANCE_OPACITY = 0.3;
/** Extra air between the account id and the OnSocial · date line. */
const BYLINE_PROVENANCE_GAP = 12;
const BYLINE_PROVENANCE_BRAND = 'OnSocial';
/** Circular creator face beside the signature stack. */
const BYLINE_AVATAR_SIZE = 36;
const BYLINE_AVATAR_GAP = 12;
const PROVENANCE_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

// ── Receipt / Proof (v0.6) ──────────────────────────────────────────────────
// Short claim + photo as proof. Three clean zones stacked top→bottom:
//   1. Claim (title) at the top pad, ≤2 lines.
//   2. Full-bleed photo plane — no border, no radius — filling the gap
//      between the claim and the signature.
//   3. Signature footer on the card background (never over the photo),
//      so the account stays legible regardless of the image.
// The photo band is measured to fit between the claim baseline and the
// byline top, so it can never collide with either.
const RECEIPT_CLAIM_PHOTO_GAP = 24; // air below the claim, above the photo
const RECEIPT_PHOTO_BYLINE_GAP = 24; // air below the photo, above signature
const RECEIPT_PHOTO_MIN_HEIGHT = 180;
/** Soft corner on the evidence plane — no stroke, just a quiet clip. */
const RECEIPT_PHOTO_RADIUS = 20;
const RECEIPT_TITLE_MAX_LINES = 2;
// Hard cap on receipt title length. Past this point the format breaks
// (the claim stops feeling like a headline and starts feeling like a
// caption). The SDK throws BEFORE the gateway is called; the generator
// truncates as a defensive last line.
export const RECEIPT_TITLE_MAX_CHARS = 60;
// Receipt title sizes — bigger than the standard ladder because we have
// guaranteed-short text and want headline weight.
const RECEIPT_TITLE_FONT_SIZES = [56, 48, 44, 40] as const;

// Width estimates (no canvas to measure with) — fraction of font size.
const SANS_CHAR_RATIO_BOLD = 0.56;
const SANS_CHAR_RATIO_REGULAR = 0.5;
const MONO_CHAR_RATIO = 0.62;
/** Proportional space advance — much narrower than a letter. */
const PROPORTIONAL_SPACE_RATIO = 0.26;
// Emoji glyphs render approximately square at the line's font size,
// regardless of family. Slightly conservative so we under-fit, not over.
const EMOJI_CHAR_RATIO = 1.0;
/**
 * Prefer soft-breaking long tokens after these graphemes (URLs, NEAR
 * accounts, tickers, hashtags) before grapheme hard-break.
 */
const SOFT_BREAK_AFTER = new Set([
  '/',
  '.',
  '_',
  '-',
  ':',
  '@',
  '#',
  '$',
  '?',
  '&',
  '=',
  '%',
]);

// ── Signature palette ──────────────────────────────────────────────────────
// 12 distinct hues. Each account hashes to one of them — instant
// "this is mine" signal across a wallet grid.

const SIGNATURE_PALETTE = [
  '#7C5CFF', // violet
  '#22C55E', // green
  '#F97316', // orange
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#EAB308', // amber
  '#A855F7', // purple
  '#10B981', // emerald
  '#F43F5E', // rose
  '#3B82F6', // blue
  '#84CC16', // lime
  '#FB923C', // tangerine
];

/** Named handles for the palette — what users pick when overriding. */
export type MarkColor =
  | 'auto'
  | 'violet'
  | 'green'
  | 'orange'
  | 'pink'
  | 'cyan'
  | 'amber'
  | 'purple'
  | 'emerald'
  | 'rose'
  | 'blue'
  | 'lime'
  | 'tangerine';

export const MARK_COLOR_HEX: Record<Exclude<MarkColor, 'auto'>, string> = {
  violet: SIGNATURE_PALETTE[0],
  green: SIGNATURE_PALETTE[1],
  orange: SIGNATURE_PALETTE[2],
  pink: SIGNATURE_PALETTE[3],
  cyan: SIGNATURE_PALETTE[4],
  amber: SIGNATURE_PALETTE[5],
  purple: SIGNATURE_PALETTE[6],
  emerald: SIGNATURE_PALETTE[7],
  rose: SIGNATURE_PALETTE[8],
  blue: SIGNATURE_PALETTE[9],
  lime: SIGNATURE_PALETTE[10],
  tangerine: SIGNATURE_PALETTE[11],
};

export const MARK_COLORS: ReadonlyArray<Exclude<MarkColor, 'auto'>> = [
  'violet',
  'green',
  'orange',
  'pink',
  'cyan',
  'amber',
  'purple',
  'emerald',
  'rose',
  'blue',
  'lime',
  'tangerine',
];

export function isMarkColor(v: unknown): v is MarkColor {
  return v === 'auto' || (typeof v === 'string' && v in MARK_COLOR_HEX);
}

/** Mark shape — same visual mass, different vibe. */
export type MarkShape = 'rule' | 'dot' | 'square' | 'bar';

export const MARK_SHAPES: ReadonlyArray<MarkShape> = [
  'rule',
  'dot',
  'square',
  'bar',
];

export function isMarkShape(v: unknown): v is MarkShape {
  return (
    typeof v === 'string' && (MARK_SHAPES as readonly string[]).includes(v)
  );
}

/** Title alignment. */
export type TitleAlign = 'left' | 'center';

export function isTitleAlign(v: unknown): v is TitleAlign {
  return v === 'left' || v === 'center';
}

// ── Emoji-aware text helpers ───────────────────────────────────────────────

const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Split into grapheme clusters (handles 🏳️‍🌈, 👨‍👩‍👧, ZWJ sequences). */
function graphemes(s: string): string[] {
  const SegmenterCtor = (
    globalThis as unknown as {
      Intl?: { Segmenter?: new (l?: string, o?: object) => unknown };
    }
  ).Intl?.Segmenter;
  if (SegmenterCtor) {
    const seg = new SegmenterCtor(undefined, {
      granularity: 'grapheme',
    }) as Iterable<{ segment: string }>;
    // @ts-expect-error: Intl.Segmenter typing is environment-dependent.
    return Array.from(seg.segment(s), (g) => g.segment) as string[];
  }
  // Fallback: split by codepoint (still better than .length, handles BMP+).
  return Array.from(s);
}

function isEmoji(g: string): boolean {
  return EMOJI_RE.test(g);
}

/**
 * Visual character budget — emojis count as ~2 normal characters because
 * they render roughly twice as wide at a given font size. Used for byline
 * truncation helpers that still speak in "chars".
 */
function visualLength(s: string): number {
  let n = 0;
  for (const g of graphemes(s)) n += isEmoji(g) ? 2 : 1;
  return n;
}

/** Estimate pixel width of a string at a given font-size + family kind. */
function estimateWidthPx(
  s: string,
  fontSize: number,
  kind: 'sans-bold' | 'sans-regular' | 'mono'
): number {
  const ratio =
    kind === 'mono'
      ? MONO_CHAR_RATIO
      : kind === 'sans-bold'
        ? SANS_CHAR_RATIO_BOLD
        : SANS_CHAR_RATIO_REGULAR;
  let w = 0;
  for (const g of graphemes(s)) {
    if (isEmoji(g)) w += fontSize * EMOJI_CHAR_RATIO;
    else w += fontSize * ratio;
  }
  return w;
}

/** Title metrics from the active mood (advance + SVG letter-spacing). */
function titleMetrics(mood: Mood): {
  advanceRatio: number;
  letterSpacing: number;
  monospace: boolean;
} {
  return {
    advanceRatio: mood.titleAdvanceRatio,
    letterSpacing: mood.titleLetterSpacing,
    monospace: mood.titleFamily.toLowerCase().includes('mono'),
  };
}

type TitleMetrics = ReturnType<typeof titleMetrics>;

/**
 * Pixel width of title text at `fontSize` using the voice's mean advance
 * and SVG letter-spacing (applied between graphemes). Spaces in
 * proportional faces use a narrow advance so wrap fills the column.
 */
function estimateTitleWidthPx(
  s: string,
  fontSize: number,
  metrics: TitleMetrics
): number {
  const gs = graphemes(s);
  if (gs.length === 0) return 0;
  let w = 0;
  for (const g of gs) {
    if (isEmoji(g)) w += fontSize * EMOJI_CHAR_RATIO;
    else if (g === ' ' || g === '\u00A0') {
      w +=
        fontSize *
        (metrics.monospace ? metrics.advanceRatio : PROPORTIONAL_SPACE_RATIO);
    } else w += fontSize * metrics.advanceRatio;
  }
  if (gs.length > 1) w += metrics.letterSpacing * (gs.length - 1);
  return w;
}

/** XML-safe escape. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function lineFits(
  s: string,
  maxWidthPx: number,
  fontSize: number,
  metrics: TitleMetrics
): boolean {
  return estimateTitleWidthPx(s, fontSize, metrics) <= maxWidthPx;
}

/** Soft-break ends (exclusive grapheme indices) inside a long token. */
function softBreakEnds(gs: string[]): number[] {
  const ends: number[] = [];
  for (let i = 0; i < gs.length - 1; i++) {
    if (SOFT_BREAK_AFTER.has(gs[i])) ends.push(i + 1);
  }
  return ends;
}

/**
 * Split a single overlong token across lines, preferring breaks after
 * URL/account punctuation, then grapheme hard-break.
 */
function breakLongToken(
  word: string,
  maxWidthPx: number,
  fontSize: number,
  metrics: TitleMetrics
): string[] {
  const gs = graphemes(word);
  const softEnds = softBreakEnds(gs);
  const parts: string[] = [];
  let start = 0;

  while (start < gs.length) {
    let end = start + 1;
    while (
      end <= gs.length &&
      lineFits(gs.slice(start, end).join(''), maxWidthPx, fontSize, metrics)
    ) {
      end += 1;
    }
    // `end` is first index that does not fit; last fitting is end - 1.
    let breakAt = end - 1;
    if (breakAt <= start) {
      // Single grapheme wider than the column — take it anyway.
      parts.push(gs[start]);
      start += 1;
      continue;
    }
    const softInRange = softEnds.filter((i) => i > start && i <= breakAt);
    if (softInRange.length > 0) {
      breakAt = softInRange[softInRange.length - 1]!;
    }
    parts.push(gs.slice(start, breakAt).join(''));
    start = breakAt;
  }
  return parts;
}

function appendEllipsis(
  line: string,
  maxWidthPx: number,
  fontSize: number,
  metrics: TitleMetrics
): string {
  const ell = '\u2026';
  const gs = graphemes(line);
  while (
    gs.length > 0 &&
    !lineFits(gs.join('') + ell, maxWidthPx, fontSize, metrics)
  ) {
    gs.pop();
  }
  return `${gs.join('')}${ell}`;
}

/**
 * Greedy word-wrap by measured pixel width. Lines beyond `maxLines` are
 * dropped and the last visible line gets a reliable ellipsis.
 */
function wrapByWidth(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  metrics: TitleMetrics,
  maxLines: number
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/);
  const unlimited: string[] = [];
  let current = '';

  const fits = (s: string) => lineFits(s, maxWidthPx, fontSize, metrics);

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) unlimited.push(current);
    if (!fits(word)) {
      const chunks = breakLongToken(word, maxWidthPx, fontSize, metrics);
      for (let i = 0; i < chunks.length - 1; i++) {
        unlimited.push(chunks[i]!);
      }
      current = chunks[chunks.length - 1] ?? '';
    } else {
      current = word;
    }
  }
  if (current) unlimited.push(current);

  if (unlimited.length <= maxLines) return unlimited;

  const lines = unlimited.slice(0, maxLines);
  lines[lines.length - 1] = appendEllipsis(
    lines[lines.length - 1]!,
    maxWidthPx,
    fontSize,
    metrics
  );
  return lines;
}

/** Stable index into the signature palette for a given seed string. */
function paletteIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % SIGNATURE_PALETTE.length;
}

/** Like `wrapByWidth`, but only returns whether the text fits in `maxLines`. */
function wrapWouldFitByWidth(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  metrics: TitleMetrics,
  maxLines: number
): boolean {
  return countWrappedLines(text, maxWidthPx, fontSize, metrics) <= maxLines;
}

/** Line count if wrapped with no ellipsis cap (for density / fit checks). */
function countWrappedLines(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  metrics: TitleMetrics
): number {
  const words = text.trim().split(/\s+/);
  if (words.length === 1 && words[0] === '') return 0;
  const fits = (s: string) => lineFits(s, maxWidthPx, fontSize, metrics);
  let lines = 0;
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) lines += 1;
    if (!fits(word)) {
      const chunks = breakLongToken(word, maxWidthPx, fontSize, metrics);
      lines += Math.max(0, chunks.length - 1);
      current = chunks[chunks.length - 1] ?? '';
    } else {
      current = word;
    }
  }
  if (current) lines += 1;
  return lines;
}

/** Trim to `max` *visual* characters, appending an ellipsis when shortened. */
function truncateVisual(s: string, maxVisual: number): string {
  if (visualLength(s) <= maxVisual) return s;
  if (maxVisual <= 1) return '\u2026';
  const gs = graphemes(s);
  const out: string[] = [];
  let used = 0;
  for (const g of gs) {
    const cost = isEmoji(g) ? 2 : 1;
    if (used + cost > maxVisual - 1) break;
    out.push(g);
    used += cost;
  }
  return out.join('') + '\u2026';
}

// ── Title auto-shrink ──────────────────────────────────────────────────────
// Fit against CONTENT_WIDTH using per-voice advance ratios. Keep the type
// as LARGE as possible: use the biggest size that still fits inside the
// format's line budget, and only step down when the copy runs out of
// lines. Wide / mono faces get a deeper floor (down to 28px) so long copy
// shrinks gracefully instead of truncating early — but we never shrink a
// title that already fits.

function titleSizeLadder(metrics: TitleMetrics): readonly number[] {
  return metrics.monospace || metrics.advanceRatio >= 0.58
    ? TITLE_FONT_SIZES_DENSE
    : TITLE_FONT_SIZES;
}

/** Try the size ladder; return the largest that fits without truncation. */
function pickTitleFontSize(
  text: string,
  metrics: TitleMetrics,
  maxLines = TITLE_MAX_LINES
): { size: number; truncated: boolean } {
  const ladder = titleSizeLadder(metrics);
  for (const size of ladder) {
    if (wrapWouldFitByWidth(text, CONTENT_WIDTH, size, metrics, maxLines)) {
      return { size, truncated: false };
    }
  }
  const floor = ladder[ladder.length - 1]!;
  return { size: floor, truncated: true };
}

/**
 * Receipt-mood variant of the size ladder. Bigger sizes (56 → 40), 2-line
 * cap. Same pixel-width logic as `pickTitleFontSize`.
 */
function pickReceiptTitleFontSize(
  text: string,
  metrics: TitleMetrics
): { size: number; truncated: boolean } {
  for (const size of RECEIPT_TITLE_FONT_SIZES) {
    if (
      wrapWouldFitByWidth(
        text,
        CONTENT_WIDTH,
        size,
        metrics,
        RECEIPT_TITLE_MAX_LINES
      )
    ) {
      return { size, truncated: false };
    }
  }
  const floor = RECEIPT_TITLE_FONT_SIZES[RECEIPT_TITLE_FONT_SIZES.length - 1];
  return { size: floor, truncated: true };
}

/**
 * UI helper: report whether a title will render at the default size, in
 * a shrunk size, or be truncated. Used by compose UIs to drive the
 * green / amber / red counter ("fits at 44px" → "fits at 32px, smaller"
 * → "will be truncated; full text saved to metadata").
 */
export type TitleFitStatus = 'fits' | 'shrunk' | 'truncated';

export interface TitleFit {
  status: TitleFitStatus;
  /** The size the title will render at (px). */
  size: number;
  /** Is this the largest size in the ladder? */
  isMaxSize: boolean;
  /** Will the text be ellipsis-truncated at the chosen size? */
  truncated: boolean;
  /** Approximate visible-character ceiling at the floor size. */
  approxMaxChars: number;
}

export function measureTitleFit(
  title: string,
  spec?: { bg?: string }
): TitleFit {
  const moodKey = resolveMood(spec);
  const mood = MOODS[moodKey];
  const metrics = titleMetrics(mood);
  const text = mood.titleUppercase ? title.toUpperCase() : title;
  const fit = pickTitleFontSize(text, metrics);
  const baseSize = TITLE_FONT_SIZES[0];
  const ladder = titleSizeLadder(metrics);
  const floorSize = ladder[ladder.length - 1]!;
  const status: TitleFitStatus = fit.truncated
    ? 'truncated'
    : fit.size === baseSize
      ? 'fits'
      : 'shrunk';
  const approxCharsPerLine = Math.max(
    8,
    Math.floor(CONTENT_WIDTH / (floorSize * metrics.advanceRatio))
  );
  return {
    status,
    size: fit.size,
    isMaxSize: fit.size === baseSize,
    truncated: fit.truncated,
    approxMaxChars: approxCharsPerLine * TITLE_MAX_LINES,
  };
}

/** Convert an angle in degrees to a normalised gradient endpoint. */
function angleToVector(degrees: number): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const rad = ((degrees - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x1: 0.5 - cos / 2,
    y1: 0.5 - sin / 2,
    x2: 0.5 + cos / 2,
    y2: 0.5 + sin / 2,
  };
}

/** Quiet footer under the signature — brand, when, optional source post. */
export interface TextCardProvenance {
  /** Brand label. Defaults to `OnSocial`. */
  brand?: string;
  /**
   * Instant the scarce was listed/minted (or the source post time).
   * Accepts ms, seconds, or NEAR ns — normalised to UTC.
   */
  issuedAt?: number | Date;
  /** Source post id — shown short when long. */
  postId?: string;
}

export interface TextCardOptions {
  /** The thought — the hero of the card. */
  title: string;
  /**
   * Locked visual layout recorded with the mint. When omitted, legacy callers
   * retain their mood-derived layout (receipt moods still use Receipt).
   */
  format?: CardFormat;
  /**
   * Optional longer text. Stored in NFT metadata for wallets that surface
   * it, but **deliberately not rendered on the card**.
   */
  description?: string;
  /**
   * Author of the thought. When provided, a signature byline appears at
   * the bottom and the author's deterministic colour is used for the
   * top-left mark (unless overridden via `theme.markColor`).
   */
  creator?: {
    accountId: string;
    displayName?: string;
    /**
     * Optional face for the signature. Prefer a `data:image/*` URI so the
     * minted PNG stays self-contained. http(s) is accepted for live
     * previews only.
     */
    avatar?: string;
  };
  /** Mood + per-card customisation. */
  theme?: {
    bg?: MoodKey | string;
    /** @deprecated v0.1 axis. Ignored — moods own their typography. */
    font?: string;
    /**
     * Lock the mark to a named palette colour. When omitted or `'auto'`,
     * the per-account deterministic colour is used.
     */
    markColor?: MarkColor;
    /** Mark shape. Defaults to `'rule'`. */
    markShape?: MarkShape;
    /** Title alignment. Defaults to `'left'`. */
    titleAlign?: TitleAlign;
  };
  /**
   * Photo URL or `data:image/*` URI rendered as **proof** beneath a
   * short claim. Only honoured on receipt/proof layouts — other moods
   * stay type-only. The image is a full-bleed plane under the claim
   * (no border); byline sits beneath. Provide a stable gateway URL or
   * data URI for offline / wallet rendering.
   */
  photo?: string;
  /** Optional provenance line under the signature. */
  provenance?: TextCardProvenance;
}

/** Normalise ms / sec / NEAR ns timestamps to UTC milliseconds. */
export function provenanceTimeMs(raw: number | Date): number {
  if (raw instanceof Date) return raw.getTime();
  if (!Number.isFinite(raw) || raw <= 0) return Date.now();
  if (raw > 1e15) return Math.floor(raw / 1e6); // ns → ms
  if (raw > 1e12) return Math.floor(raw); // ms
  return Math.floor(raw * 1000); // sec → ms
}

/** Shorten long post ids for the card footer; keep short ids intact. */
export function shortProvenancePostId(postId: string): string {
  const id = postId.trim();
  if (!id) return '';
  if (id.length <= 12) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

/** UTC `18 Jul 26 · 21:14` for the provenance line. */
export function formatProvenanceWhen(raw: number | Date): string {
  const d = new Date(provenanceTimeMs(raw));
  const day = d.getUTCDate();
  const mon = PROVENANCE_MONTHS[d.getUTCMonth()] ?? 'Jan';
  const yy = String(d.getUTCFullYear()).slice(-2);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${mon} ${yy} · ${hh}:${mm}`;
}

/**
 * Build the muted provenance string:
 * `OnSocial · 18 Jul 26 · 21:14 · postId`
 */
export function formatProvenanceLine(
  provenance: TextCardProvenance | undefined
): string | null {
  if (!provenance) return null;
  const parts: string[] = [];
  const brand = provenance.brand?.trim() || BYLINE_PROVENANCE_BRAND;
  parts.push(brand);
  if (provenance.issuedAt != null) {
    parts.push(formatProvenanceWhen(provenance.issuedAt));
  }
  const postId = provenance.postId
    ? shortProvenancePostId(provenance.postId)
    : '';
  if (postId) parts.push(postId);
  if (parts.length <= 1 && !provenance.issuedAt && !postId) return null;
  return parts.join(' · ');
}

/** Render a single mark shape at the top-left corner. */
function markHeight(shape: MarkShape): number {
  switch (shape) {
    case 'dot':
      return MARK_DOT_R * 2;
    case 'square':
      return MARK_SQUARE;
    case 'bar':
      return MARK_BAR_H;
    case 'rule':
    default:
      return MARK_RULE_H;
  }
}

/** Title baseline so capital tops land on `visualTop`. */
function titleBaselineY(visualTop: number, fontSize: number): number {
  return Math.round(visualTop + fontSize * TITLE_CAP_HEIGHT_RATIO);
}

/** Render a single mark shape at the top-left corner. */
function renderMark(shape: MarkShape, color: string): string {
  switch (shape) {
    case 'dot':
      return `<circle cx="${PADDING + MARK_DOT_R}" cy="${PADDING + MARK_DOT_R}" r="${MARK_DOT_R}" fill="${color}"/>`;
    case 'square':
      return `<rect x="${PADDING}" y="${PADDING}" width="${MARK_SQUARE}" height="${MARK_SQUARE}" rx="1" fill="${color}"/>`;
    case 'bar':
      return `<rect x="${PADDING}" y="${PADDING}" width="${MARK_BAR_W}" height="${MARK_BAR_H}" rx="${MARK_BAR_W / 2}" fill="${color}"/>`;
    case 'rule':
    default:
      return `<rect x="${PADDING}" y="${PADDING}" width="${MARK_RULE_W}" height="${MARK_RULE_H}" rx="${MARK_RULE_H / 2}" fill="${color}"/>`;
  }
}

/** Generate a text-card SVG. Returns raw SVG markup (string). */
export function generateTextCardSvg(opts: TextCardOptions): string {
  const moodKey = resolveMood(opts.theme);
  const mood = MOODS[moodKey];
  const format = isCardFormat(opts.format)
    ? opts.format
    : moodKey.startsWith('receipt-')
      ? 'receipt'
      : 'thought';
  const formatSpec = CARD_FORMAT_REGISTRY[format];
  // Receipt is a layout, not just a voice — every receipt-* mood
  // gets the short-claim + photo-as-proof treatment.
  const isReceipt =
    moodKey.startsWith('receipt-') ||
    format === 'receipt' ||
    format === 'proof';
  // Dark receipt finishes (night / noir / dusk) want a lifted hairline
  // on the photo border so it reads as a clean edge against the dark bg
  // rather than a glowing outline.
  const isReceiptDark = isReceipt && moodKey !== 'receipt-light';

  const markShape: MarkShape = isMarkShape(opts.theme?.markShape)
    ? (opts.theme!.markShape as MarkShape)
    : 'rule';
  const titleAlign: TitleAlign = isTitleAlign(opts.theme?.titleAlign)
    ? (opts.theme!.titleAlign as TitleAlign)
    : 'left';

  // Receipt mood: defensive truncation. The SDK throws BEFORE the
  // gateway is called, so this only kicks in when the gateway is
  // misconfigured or the generator is called directly with too-long
  // text. Truncation here keeps the layout safe rather than overflowing.
  const rawTitle = isReceipt
    ? opts.title.length > formatSpec.maxCharacters
      ? opts.title.slice(0, formatSpec.maxCharacters - 1).trimEnd() + '\u2026'
      : opts.title
    : opts.title;

  const titleSource =
    mood.titleUppercase || formatSpec.key === 'poster'
      ? rawTitle.toUpperCase()
      : rawTitle;

  // Standard moods: try the size ladder and pick a size that fits the
  // format's maxLines at the measured pixel budget. Wide faces also
  // density-prefer so longer copy packs the column. Poster: locked 44px
  // ALL CAPS (no shrink). Receipt/Proof: bigger ladder (56 → 40), 2 lines.
  const titleMaxLines = Math.min(formatSpec.maxLines, TITLE_MAX_LINES);
  const isPoster = formatSpec.key === 'poster';
  const metrics = titleMetrics(mood);
  const fit = isReceipt
    ? pickReceiptTitleFontSize(titleSource, metrics)
    : isPoster
      ? {
          size: POSTER_TITLE_FONT_SIZE,
          truncated: !wrapWouldFitByWidth(
            titleSource,
            CONTENT_WIDTH,
            POSTER_TITLE_FONT_SIZE,
            metrics,
            titleMaxLines
          ),
        }
      : pickTitleFontSize(titleSource, metrics, titleMaxLines);
  const titleFontSize = fit.size;
  const titleLineHeight = Math.round(titleFontSize * TITLE_LINE_HEIGHT_RATIO);
  const titleLines = wrapByWidth(
    titleSource,
    CONTENT_WIDTH,
    titleFontSize,
    metrics,
    titleMaxLines
  );

  const creator = opts.creator;

  // ── Author mark ─────────────────────────────────────────────────────
  let markBlock = '';
  // Cap-height compensate so the visual top of the title sits on the
  // pad (or on the air below the mark), not on the em box above glyphs.
  let titleStartY = titleBaselineY(PADDING, titleFontSize);
  if (creator) {
    const colorOverride = opts.theme?.markColor;
    const markColor =
      colorOverride &&
      colorOverride !== 'auto' &&
      colorOverride in MARK_COLOR_HEX
        ? MARK_COLOR_HEX[colorOverride as Exclude<MarkColor, 'auto'>]
        : SIGNATURE_PALETTE[paletteIndex(creator.accountId)];
    markBlock = `\n  ${renderMark(markShape, markColor)}`;
    const titleVisualTop = PADDING + markHeight(markShape) + MARK_GAP_BELOW;
    titleStartY = titleBaselineY(titleVisualTop, titleFontSize);
  }

  const titleLetterSpacingAttr = mood.titleLetterSpacing
    ? ` letter-spacing="${mood.titleLetterSpacing}"`
    : '';

  // Title alignment — left anchors at PADDING, center anchors at WIDTH/2.
  // Receipt mode forces left alignment so the claim sits above the photo.
  const effectiveTitleAlign: TitleAlign = isReceipt ? 'left' : titleAlign;
  const titleX = effectiveTitleAlign === 'center' ? WIDTH / 2 : PADDING;
  const titleAnchorAttr =
    effectiveTitleAlign === 'center' ? ' text-anchor="middle"' : '';

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="${titleX}" dy="${i === 0 ? 0 : titleLineHeight}">${esc(line)}</tspan>`
    )
    .join('');

  // Bottom of the rendered claim (last baseline + a descender allowance).
  const claimBottomY = Math.round(
    titleStartY +
      (titleLines.length - 1) * titleLineHeight +
      titleFontSize * 0.24
  );

  // ── Photo (receipt / proof) ────────────────────────────────────────
  // Full-bleed evidence plane between the claim and the signature — no
  // border, no radius. Its band is measured after the byline so it can
  // never overlap the account line.
  //
  // We only honour http(s) and data:image/* URIs; any other scheme
  // (javascript:, file:, etc.) is silently dropped so untrusted callers
  // can't smuggle script into the SVG via `<image href>`.
  const hasPhoto =
    isReceipt &&
    typeof opts.photo === 'string' &&
    opts.photo.length > 0 &&
    /^(https?:|data:image\/)/i.test(opts.photo);

  // ── Byline (bottom): signature + quiet provenance ──────────────────
  // Name / account id above; optional `OnSocial · date · time · postId` under.
  let bylineBlock = '';
  // Topmost y of any byline element — photo band stops above this.
  let bylineTopY = HEIGHT - PADDING;
  const provenanceLine = formatProvenanceLine(opts.provenance);
  const ink = mood.textPrimary;
  const isMono = mood.bylineFamily.toLowerCase().includes('mono');
  const nameKind: 'sans-bold' | 'mono' = isMono ? 'mono' : 'sans-bold';
  const handleKind: 'sans-regular' | 'mono' = isMono ? 'mono' : 'sans-regular';

  let stackBottomY = HEIGHT - PADDING;
  if (provenanceLine) {
    let provLine = provenanceLine;
    if (
      estimateWidthPx(provLine, BYLINE_PROVENANCE_SIZE, handleKind) >
      CONTENT_WIDTH
    ) {
      const ratio =
        handleKind === 'mono' ? MONO_CHAR_RATIO : SANS_CHAR_RATIO_REGULAR;
      const budget = Math.max(
        8,
        Math.floor(CONTENT_WIDTH / (BYLINE_PROVENANCE_SIZE * ratio))
      );
      provLine = truncateVisual(provLine, budget);
    }
    bylineBlock += `
  <text x="${PADDING}" y="${stackBottomY}" font-family="${familyForResvgWeight(mood.bylineFamily, 400)}" font-size="${BYLINE_PROVENANCE_SIZE}" font-weight="400" fill="${ink}" fill-opacity="${BYLINE_PROVENANCE_OPACITY}">${esc(provLine)}</text>`;
    stackBottomY -= BYLINE_PROVENANCE_SIZE + BYLINE_PROVENANCE_GAP;
  }

  let avatarDefs = '';
  if (creator) {
    const accountId = creator.accountId.trim();
    const handle = accountId;
    const rawName = creator.displayName?.trim() ?? '';
    const nameNorm = rawName.toLowerCase();
    const idNorm = accountId.toLowerCase();
    // Distinct only when the caller passed a real name — not the account id
    // itself (apps often pass the id as a displayName fallback).
    const hasDistinctName =
      Boolean(rawName) &&
      nameNorm !== idNorm &&
      nameNorm !== `@${idNorm}` &&
      nameNorm !== `~${idNorm}` &&
      nameNorm !== `~/${idNorm}` &&
      nameNorm !== handle.toLowerCase();

    const rawAvatar = creator.avatar?.trim() ?? '';
    const hasAvatar =
      rawAvatar.length > 0 && /^(https?:|data:image\/)/i.test(rawAvatar);
    const textX = hasAvatar
      ? PADDING + BYLINE_AVATAR_SIZE + BYLINE_AVATAR_GAP
      : PADDING;
    const textBudget = hasAvatar
      ? CONTENT_WIDTH - BYLINE_AVATAR_SIZE - BYLINE_AVATAR_GAP
      : CONTENT_WIDTH;

    let handleSize = BYLINE_HANDLE_SIZE;
    if (estimateWidthPx(handle, handleSize, handleKind) > textBudget) {
      handleSize = BYLINE_HANDLE_FLOOR;
    }

    const handleY = stackBottomY;
    let signatureBlock = '';

    if (!hasDistinctName) {
      signatureBlock = `
  <text x="${textX}" y="${handleY}" font-family="${familyForResvgWeight(mood.bylineFamily, 500)}" font-size="${handleSize}" font-weight="500" fill="${ink}" fill-opacity="${BYLINE_SOLO_OPACITY}">${esc(handle)}</text>`;
      bylineTopY = Math.min(bylineTopY, handleY - handleSize);
    } else {
      const nameSize = BYLINE_NAME_SIZE;
      let displayName = rawName;
      if (estimateWidthPx(displayName, nameSize, nameKind) > textBudget) {
        const nameRatio =
          nameKind === 'mono' ? MONO_CHAR_RATIO : SANS_CHAR_RATIO_BOLD;
        const nameCharBudget = Math.max(
          4,
          Math.floor(textBudget / (nameSize * nameRatio))
        );
        displayName = truncateVisual(displayName, nameCharBudget);
      }
      const nameY = handleY - handleSize - BYLINE_STACK_GAP;
      signatureBlock = `
  <text x="${textX}" y="${nameY}" font-family="${familyForResvgWeight(mood.bylineFamily, 500)}" font-size="${nameSize}" font-weight="500" fill="${ink}" fill-opacity="${BYLINE_NAME_OPACITY}">${esc(displayName)}</text>
  <text x="${textX}" y="${handleY}" font-family="${familyForResvgWeight(mood.bylineFamily, 400)}" font-size="${handleSize}" font-weight="400" fill="${ink}" fill-opacity="${BYLINE_HANDLE_OPACITY}">${esc(handle)}</text>`;
      bylineTopY = Math.min(bylineTopY, nameY - nameSize);
    }

    if (hasAvatar) {
      const stackTop = hasDistinctName
        ? handleY - handleSize - BYLINE_STACK_GAP - BYLINE_NAME_SIZE
        : handleY - handleSize;
      const stackMidY = (stackTop + handleY) / 2;
      const avatarY = Math.round(stackMidY - BYLINE_AVATAR_SIZE / 2);
      const avatarCx = PADDING + BYLINE_AVATAR_SIZE / 2;
      const avatarCy = avatarY + BYLINE_AVATAR_SIZE / 2;
      const ringOpacity =
        isReceiptDark || mood.bgFrom.startsWith('#0') ? '0.22' : '0.16';
      avatarDefs = `
    <clipPath id="avatarClip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${BYLINE_AVATAR_SIZE / 2}"/></clipPath>`;
      signatureBlock =
        `
  <image href="${esc(rawAvatar)}" x="${PADDING}" y="${avatarY}" width="${BYLINE_AVATAR_SIZE}" height="${BYLINE_AVATAR_SIZE}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${BYLINE_AVATAR_SIZE / 2}" fill="none" stroke="${ink}" stroke-opacity="${ringOpacity}" stroke-width="1"/>` +
        signatureBlock;
      bylineTopY = Math.min(bylineTopY, avatarY);
    }

    bylineBlock = signatureBlock + bylineBlock;
  }

  const v = angleToVector(mood.bgAngle);

  // ── Photo block (receipt / proof) ──────────────────────────────────
  // Evidence plane inset to the same 64px column as the type — soft
  // corner clip, no stroke — sized to fill the gap between the claim
  // and the signature so it can never collide with either.
  let photoBlock = '';
  let photoDefs = '';
  if (hasPhoto) {
    const photoX = PADDING;
    const photoW = CONTENT_WIDTH;
    const photoTop = claimBottomY + RECEIPT_CLAIM_PHOTO_GAP;
    const photoBottom = bylineTopY - RECEIPT_PHOTO_BYLINE_GAP;
    const photoH = Math.max(
      RECEIPT_PHOTO_MIN_HEIGHT,
      Math.round(photoBottom - photoTop)
    );
    photoDefs = `
    <clipPath id="photoClip"><rect x="${photoX}" y="${photoTop}" width="${photoW}" height="${photoH}" rx="${RECEIPT_PHOTO_RADIUS}" ry="${RECEIPT_PHOTO_RADIUS}"/></clipPath>`;
    // Clip on a wrapping <g> — more reliable than clip-path on <image>
    // itself (browser SVG-as-img and Resvg both honour group clips).
    photoBlock = `
  <g clip-path="url(#photoClip)">
    <image href="${esc(opts.photo!)}" x="${photoX}" y="${photoTop}" width="${photoW}" height="${photoH}" preserveAspectRatio="xMidYMid slice"/>
  </g>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="g" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}">
      <stop offset="0%" stop-color="${mood.bgFrom}"/>
      <stop offset="100%" stop-color="${mood.bgTo}"/>
    </linearGradient>${photoDefs}${avatarDefs}
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>${markBlock}
  <text x="${titleX}" y="${titleStartY}" font-family="${familyForResvgWeight(mood.titleFamily, mood.titleWeight)}" font-size="${titleFontSize}" font-weight="${mood.titleWeight}" fill="${mood.textPrimary}" fill-opacity="${TITLE_FILL_OPACITY}"${titleLetterSpacingAttr}${titleAnchorAttr}>${titleTspans}</text>${photoBlock}${bylineBlock}
</svg>`;
}

/**
 * Convenience: returns the SVG string plus a base64 `data:` URI suitable
 * for inlining in `<img src>` or for use as the on-chain `media` field.
 */
export function previewTextCard(opts: TextCardOptions): {
  svg: string;
  dataUri: string;
} {
  const svg = generateTextCardSvg(opts);
  const g = globalThis as unknown as {
    btoa?: (s: string) => string;
    Buffer?: {
      from(s: string, enc: string): { toString(enc: string): string };
    };
  };
  const base64 = g.btoa
    ? g.btoa(unescape(encodeURIComponent(svg)))
    : g.Buffer!.from(svg, 'utf-8').toString('base64');
  return { svg, dataUri: `data:image/svg+xml;base64,${base64}` };
}
