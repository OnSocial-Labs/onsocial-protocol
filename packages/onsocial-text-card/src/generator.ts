// ---------------------------------------------------------------------------
// Pure SVG text-card generator — runs identically in Node and the browser.
//
// Design (v0.3 — "editorial"):
//   - The thought is the hero. Top-anchored, big, alone.
//   - No avatar. The byline is type-only.
//   - The author's deterministic colour lives in a small "mark" at the
//     top-left — the only ornamentation, the author's signature.
//   - Single-line byline "Name · @handle" — bold name, thin middle-dot,
//     muted handle. Auto-shrinks the name and truncates the handle as
//     needed to stay on one line.
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
// Emoji handling (v0.3.1):
//   - Wrap & width estimation segment by grapheme cluster (Intl.Segmenter)
//     so multi-codepoint emoji like 🏳️‍🌈 count as one symbol, and width
//     accounts for emoji glyphs being roughly square (~1.0× the font
//     size, vs ~0.5× for sans).
//   - Font-family chains include emoji fallbacks ('Apple Color Emoji',
//     'Segoe UI Emoji', 'Noto Color Emoji') for consistent rendering
//     across renderers.
//
// Zero deps. Returns raw SVG markup.
// ---------------------------------------------------------------------------

import { MOODS, resolveMood, type MoodKey } from './themes.js';

const WIDTH = 600;
const HEIGHT = 600;
const PADDING = 56;
const CONTENT_WIDTH = WIDTH - PADDING * 2;

// Author mark.
const MARK_RULE_W = 36;
const MARK_RULE_H = 3;
const MARK_DOT_R = 5; // radius
const MARK_SQUARE = 10;
const MARK_BAR_W = 4;
const MARK_BAR_H = 24;
const MARK_GAP_BELOW = 32; // px reserved between mark and title

// Title.
// Auto-shrink ladder — try the largest first; drop a step if the text
// won't fit in TITLE_MAX_LINES at the per-mood character budget. Below
// the floor, ellipsis-truncate. Line-height tracks font size 1.27×.
const TITLE_FONT_SIZES = [44, 38, 32, 28] as const;
const TITLE_LINE_HEIGHT_RATIO = 56 / 44; // ~1.27
const TITLE_MAX_LINES = 6;

// Byline (bottom band).
const NAME_FONT_SIZES = [20, 18, 16, 14] as const;

// ── Receipt mood (v0.5) ─────────────────────────────────────────────────────
// A short claim + a photo as proof. Different layout from every other
// mood: title top-anchored at most 2 lines, photo is the hero of the
// bottom half, byline anchors under the photo.
//
// The photo is 220×220 — ~13% of the canvas, ~70px at typical wallet
// thumbnail size. Big enough to read; small enough that the type still
// owns the top half. Hairline border, no rotation, no white frame —
// keep the chrome quiet, let the evidence speak.
const RECEIPT_PHOTO_SIZE = 220;
const RECEIPT_PHOTO_RADIUS = 6;
const RECEIPT_PHOTO_BOTTOM_GAP = 96; // space between photo and bottom edge
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
// Emoji glyphs render approximately square at the line's font size,
// regardless of family. Slightly conservative so we under-fit, not over.
const EMOJI_CHAR_RATIO = 1.0;

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

const MARK_COLOR_HEX: Record<Exclude<MarkColor, 'auto'>, string> = {
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
 * they render roughly twice as wide at a given font size.
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
    else w += g.length * fontSize * ratio;
  }
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

/**
 * Greedy word-wrap into a fixed number of lines, budgeting by *visual*
 * length (emojis cost 2). Lines beyond the limit are truncated with an
 * ellipsis on the last visible line.
 */
function wrap(
  text: string,
  maxCharsPerLine: number,
  maxLines: number
): string[] {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  const fits = (s: string): boolean => visualLength(s) <= maxCharsPerLine;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (!fits(word)) {
        // Hard-break by grapheme so multi-codepoint clusters stay intact.
        const gs = graphemes(word);
        let buf = '';
        for (const g of gs) {
          const next = buf + g;
          if (fits(next)) {
            buf = next;
          } else {
            if (buf) lines.push(buf);
            buf = g;
          }
          if (lines.length >= maxLines) break;
        }
        current = buf;
      } else {
        current = word;
      }
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  // If we dropped content, mark the last visible line with an ellipsis.
  const consumed = lines.join(' ');
  if (consumed.length < trimmed.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    const lastGs = graphemes(last);
    while (
      lastGs.length > 0 &&
      visualLength(lastGs.join('') + '…') > maxCharsPerLine
    ) {
      lastGs.pop();
    }
    lines[lines.length - 1] = `${lastGs.join('')}…`;
  }

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

/** Trim to `max` *visual* characters, appending an ellipsis when shortened. */
function truncateVisual(s: string, maxVisual: number): string {
  if (visualLength(s) <= maxVisual) return s;
  if (maxVisual <= 1) return '…';
  const gs = graphemes(s);
  const out: string[] = [];
  let used = 0;
  for (const g of gs) {
    const cost = isEmoji(g) ? 2 : 1;
    if (used + cost > maxVisual - 1) break;
    out.push(g);
    used += cost;
  }
  return out.join('') + '…';
}

// ── Title auto-shrink ──────────────────────────────────────────────────────
// The per-mood `titleCharsPerLine` budget is calibrated for the default
// 44px font. At smaller sizes the canvas fits proportionally more chars,
// so we scale the budget by (44 / size).

/** Try the size ladder; return the largest that fits without truncation. */
function pickTitleFontSize(
  text: string,
  baseCharsPerLine: number
): { size: number; charsPerLine: number; truncated: boolean } {
  const baseSize = TITLE_FONT_SIZES[0];
  for (const size of TITLE_FONT_SIZES) {
    const charsPerLine = Math.floor(baseCharsPerLine * (baseSize / size));
    const fitted = wrapWouldFit(text, charsPerLine, TITLE_MAX_LINES);
    if (fitted) return { size, charsPerLine, truncated: false };
  }
  // Floor reached: text still overflows; render at floor and let wrap()
  // ellipsis-truncate the visible portion.
  const floor = TITLE_FONT_SIZES[TITLE_FONT_SIZES.length - 1];
  const charsPerLine = Math.floor(baseCharsPerLine * (baseSize / floor));
  return { size: floor, charsPerLine, truncated: true };
}

/**
 * Receipt-mood variant of the size ladder. Bigger sizes (56 → 40), 2-line
 * cap. Same scaling logic as `pickTitleFontSize` so longer claims (still
 * inside RECEIPT_TITLE_MAX_CHARS) shrink proportionally.
 */
function pickReceiptTitleFontSize(
  text: string,
  baseCharsPerLine: number
): { size: number; charsPerLine: number; truncated: boolean } {
  const baseSize = RECEIPT_TITLE_FONT_SIZES[0];
  for (const size of RECEIPT_TITLE_FONT_SIZES) {
    const charsPerLine = Math.floor(baseCharsPerLine * (baseSize / size));
    const fitted = wrapWouldFit(text, charsPerLine, RECEIPT_TITLE_MAX_LINES);
    if (fitted) return { size, charsPerLine, truncated: false };
  }
  const floor = RECEIPT_TITLE_FONT_SIZES[RECEIPT_TITLE_FONT_SIZES.length - 1];
  const charsPerLine = Math.floor(baseCharsPerLine * (baseSize / floor));
  return { size: floor, charsPerLine, truncated: true };
}

/** Like `wrap`, but only returns whether the text fits in `maxLines`. */
function wrapWouldFit(
  text: string,
  maxCharsPerLine: number,
  maxLines: number
): boolean {
  const words = text.trim().split(/\s+/);
  const fits = (s: string): boolean => visualLength(s) <= maxCharsPerLine;
  let lines = 0;
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) {
      lines += 1;
      if (lines >= maxLines) return false;
    }
    if (!fits(word)) {
      // Hard-break a long word by graphemes; each break adds a line.
      const gs = graphemes(word);
      let buf = '';
      for (const g of gs) {
        const next = buf + g;
        if (fits(next)) {
          buf = next;
        } else {
          if (buf) {
            lines += 1;
            if (lines >= maxLines) return false;
          }
          buf = g;
        }
      }
      current = buf;
    } else {
      current = word;
    }
  }
  if (current) lines += 1;
  return lines <= maxLines;
}

/**
 * UI helper: report whether a title will render at the default size, in
 * a shrunk size, or be truncated. Used by compose UIs to drive the
 * green / amber / red counter ("fits at 44px" → "fits at 28px, smaller"
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
  const text = mood.titleUppercase ? title.toUpperCase() : title;
  const fit = pickTitleFontSize(text, mood.titleCharsPerLine);
  const baseSize = TITLE_FONT_SIZES[0];
  const floorSize = TITLE_FONT_SIZES[TITLE_FONT_SIZES.length - 1];
  const status: TitleFitStatus = fit.truncated
    ? 'truncated'
    : fit.size === baseSize
      ? 'fits'
      : 'shrunk';
  const approxMaxChars =
    Math.floor(mood.titleCharsPerLine * (baseSize / floorSize)) *
    TITLE_MAX_LINES;
  return {
    status,
    size: fit.size,
    isMaxSize: fit.size === baseSize,
    truncated: fit.truncated,
    approxMaxChars,
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

export interface TextCardOptions {
  /** The thought — the hero of the card. */
  title: string;
  /**
   * Optional longer text. Stored in NFT metadata for wallets that surface
   * it, but **deliberately not rendered on the card**.
   */
  description?: string;
  /**
   * Author of the thought. When provided, a two-line byline appears at
   * the bottom and the author's deterministic colour is used for the
   * top-left mark (unless overridden via `theme.markColor`).
   */
  creator?: {
    accountId: string;
    displayName?: string;
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
   * short claim. Only honoured when `theme.bg === 'receipt'` — every
   * other mood ignores it (the text-card's other moods are intentionally
   * type-only). The image is laid out at 220×220 in the bottom half of
   * the canvas, aligned to the same left column as the title. Provide a
   * stable gateway URL or data URI for offline / wallet rendering.
   */
  photo?: string;
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
  // Receipt is a layout, not just a voice — every receipt-* mood
  // gets the short-claim + photo-as-proof treatment.
  const isReceipt = moodKey.startsWith('receipt-');
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
    ? opts.title.length > RECEIPT_TITLE_MAX_CHARS
      ? opts.title.slice(0, RECEIPT_TITLE_MAX_CHARS - 1).trimEnd() + '\u2026'
      : opts.title
    : opts.title;

  const titleSource = mood.titleUppercase ? rawTitle.toUpperCase() : rawTitle;

  // ── Auto-shrink ladder ──────────────────────────────────────────
  // Standard moods: try the standard 4 sizes (44 → 38 → 32 → 28) and
  // pick the largest that fits in TITLE_MAX_LINES at the per-mood
  // budget. Receipt mood: bigger ladder (56 → 48 → 44 → 40) capped at
  // 2 lines, because the title is guaranteed-short and we want headline
  // weight.
  const fit = isReceipt
    ? pickReceiptTitleFontSize(titleSource, mood.titleCharsPerLine)
    : pickTitleFontSize(titleSource, mood.titleCharsPerLine);
  const titleFontSize = fit.size;
  const titleLineHeight = Math.round(titleFontSize * TITLE_LINE_HEIGHT_RATIO);
  const titleLines = wrap(
    titleSource,
    fit.charsPerLine,
    isReceipt ? RECEIPT_TITLE_MAX_LINES : TITLE_MAX_LINES
  );

  const creator = opts.creator;

  // ── Author mark ─────────────────────────────────────────────────────
  let markBlock = '';
  let titleStartY = PADDING + titleFontSize;
  if (creator) {
    const colorOverride = opts.theme?.markColor;
    const markColor =
      colorOverride &&
      colorOverride !== 'auto' &&
      colorOverride in MARK_COLOR_HEX
        ? MARK_COLOR_HEX[colorOverride as Exclude<MarkColor, 'auto'>]
        : SIGNATURE_PALETTE[paletteIndex(creator.accountId)];
    markBlock = `\n  ${renderMark(markShape, markColor)}`;
    titleStartY = PADDING + MARK_GAP_BELOW + titleFontSize;
  }

  const titleLetterSpacingAttr = mood.titleLetterSpacing
    ? ` letter-spacing="${mood.titleLetterSpacing}"`
    : '';

  // Title alignment — left anchors at PADDING, center anchors at WIDTH/2.
  // Receipt mode forces left alignment so the photo below feels anchored
  // to the same column as the headline.
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

  // ── Photo (receipt mood only) ──────────────────────────────────────
  // Photo is the hero of the bottom half — 220×220, anchored to the
  // left column (matching the title), sitting RECEIPT_PHOTO_BOTTOM_GAP
  // above the bottom edge so the byline can tuck underneath. Hairline
  // border, soft corner radius, no rotation, no white frame — the
  // photo IS the design.
  //
  // We only honour http(s) and data:image/* URIs; any other scheme
  // (javascript:, file:, etc.) is silently dropped so untrusted callers
  // can't smuggle script into the SVG via `<image href>`.
  const hasPhoto =
    isReceipt &&
    typeof opts.photo === 'string' &&
    opts.photo.length > 0 &&
    /^(https?:|data:image\/)/i.test(opts.photo);
  const photoX = PADDING;
  const photoY = HEIGHT - RECEIPT_PHOTO_BOTTOM_GAP - RECEIPT_PHOTO_SIZE;

  // ── Byline (bottom): single line "Name · @handle" ──────────────────
  // Bold name, thin middle-dot separator, muted handle. Auto-shrinks
  // the name and truncates the handle as needed to stay on one line.
  let bylineBlock = '';
  if (creator) {
    const accountId = creator.accountId;
    const rawName =
      creator.displayName?.trim() ||
      accountId.replace(/\.(near|testnet)$/i, '');
    const handle = `@${accountId}`;
    const sep = ' · ';

    const isMono = mood.bylineFamily.toLowerCase().includes('mono');
    const nameKind: 'sans-bold' | 'mono' = isMono ? 'mono' : 'sans-bold';
    const handleKind: 'sans-regular' | 'mono' = isMono
      ? 'mono'
      : 'sans-regular';

    // Pick the largest name size at which "Name · @handle" still fits.
    const sizesByPref = NAME_FONT_SIZES; // 20, 18, 16, 14
    let nameSize = sizesByPref[sizesByPref.length - 1];
    let displayHandle = handle;
    let displayName = rawName;
    for (const size of sizesByPref) {
      const nameW = estimateWidthPx(rawName, size, nameKind);
      const sepW = estimateWidthPx(sep, size, 'sans-regular');
      const handleW = estimateWidthPx(handle, size, handleKind);
      if (nameW + sepW + handleW <= CONTENT_WIDTH) {
        nameSize = size;
        displayName = rawName;
        displayHandle = handle;
        break;
      }
    }
    // Still doesn't fit at smallest size? Truncate the handle, then the name.
    {
      const size = nameSize;
      const sepW = estimateWidthPx(sep, size, 'sans-regular');
      const nameW = estimateWidthPx(displayName, size, nameKind);
      let handleW = estimateWidthPx(displayHandle, size, handleKind);
      if (nameW + sepW + handleW > CONTENT_WIDTH) {
        const handleBudgetPx = Math.max(0, CONTENT_WIDTH - nameW - sepW);
        const handleRatio =
          handleKind === 'mono' ? MONO_CHAR_RATIO : SANS_CHAR_RATIO_REGULAR;
        const handleCharBudget = Math.max(
          4,
          Math.floor(handleBudgetPx / (size * handleRatio))
        );
        displayHandle = truncateVisual(handle, handleCharBudget);
        handleW = estimateWidthPx(displayHandle, size, handleKind);
      }
      if (nameW + sepW + handleW > CONTENT_WIDTH) {
        const nameBudgetPx = Math.max(0, CONTENT_WIDTH - sepW - handleW);
        const nameRatio =
          nameKind === 'mono' ? MONO_CHAR_RATIO : SANS_CHAR_RATIO_BOLD;
        const nameCharBudget = Math.max(
          4,
          Math.floor(nameBudgetPx / (size * nameRatio))
        );
        displayName = truncateVisual(displayName, nameCharBudget);
      }
    }

    const y = HEIGHT - PADDING;

    bylineBlock = `
  <text x="${PADDING}" y="${y}" font-family="${mood.bylineFamily}" font-size="${nameSize}" fill="${mood.textPrimary}"><tspan font-weight="600">${esc(displayName)}</tspan><tspan fill="${mood.textMuted}" font-weight="400">${esc(sep)}${esc(displayHandle)}</tspan></text>`;
  }

  const v = angleToVector(mood.bgAngle);

  // ── Photo block (receipt only) ─────────────────────────────────────
  // On dark variants the muted stroke can read as "inactive". Use the
  // primary text colour at low opacity so the photo still gets a clean
  // edge against the slate without a glowing rectangle.
  let photoBlock = '';
  let photoDefs = '';
  if (hasPhoto) {
    const strokeColor = isReceiptDark ? mood.textPrimary : mood.textMuted;
    const strokeOpacity = isReceiptDark ? '0.18' : '0.3';
    photoDefs = `
    <clipPath id="photoClip"><rect x="${photoX}" y="${photoY}" width="${RECEIPT_PHOTO_SIZE}" height="${RECEIPT_PHOTO_SIZE}" rx="${RECEIPT_PHOTO_RADIUS}" ry="${RECEIPT_PHOTO_RADIUS}"/></clipPath>`;
    photoBlock = `
  <image href="${esc(opts.photo!)}" x="${photoX}" y="${photoY}" width="${RECEIPT_PHOTO_SIZE}" height="${RECEIPT_PHOTO_SIZE}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>
  <rect x="${photoX}" y="${photoY}" width="${RECEIPT_PHOTO_SIZE}" height="${RECEIPT_PHOTO_SIZE}" rx="${RECEIPT_PHOTO_RADIUS}" ry="${RECEIPT_PHOTO_RADIUS}" fill="none" stroke="${strokeColor}" stroke-opacity="${strokeOpacity}" stroke-width="1"/>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="g" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}">
      <stop offset="0%" stop-color="${mood.bgFrom}"/>
      <stop offset="100%" stop-color="${mood.bgTo}"/>
    </linearGradient>${photoDefs}
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>${markBlock}
  <text x="${titleX}" y="${titleStartY}" font-family="${mood.titleFamily}" font-size="${titleFontSize}" font-weight="${mood.titleWeight}" fill="${mood.textPrimary}"${titleLetterSpacingAttr}${titleAnchorAttr}>${titleTspans}</text>${photoBlock}${bylineBlock}
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
