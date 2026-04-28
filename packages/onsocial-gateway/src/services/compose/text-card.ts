/**
 * Server-side text-card SVG generator.
 *
 * Used by `composeMint` when a QuickMint request has no media — produces
 * a typographically driven card so wallets render the NFT with a real
 * visual instead of a "missing image" placeholder.
 *
 * Design principles (kept intentional):
 *   - The thought IS the artwork. Title is the hero.
 *   - Author owns the frame (avatar initial + display name + @handle).
 *   - No platform branding on the visual — provenance lives on-chain.
 *   - Square 1:1 so it renders consistently across wallets, marketplaces,
 *     Twitter cards and Farcaster Frames.
 *
 * Pure string generation (no canvas / sharp deps).
 */

const WIDTH = 600;
const HEIGHT = 600;
const PADDING = 56;

const COLORS = {
  bgFrom: '#0B0D12',
  bgTo: '#1A1F2A',
  border: '#22272F',
  textPrimary: '#FFFFFF',
  textMuted: '#9AA3B2',
  quoteGlyph: '#7C5CFF',
};

// Deterministic palette for the author chip background.
const AVATAR_PALETTE = [
  '#7C5CFF',
  '#22C55E',
  '#F97316',
  '#EC4899',
  '#06B6D4',
  '#EAB308',
  '#A855F7',
  '#10B981',
];

const TITLE_FONT_SIZE = 42;
const TITLE_LINE_HEIGHT = 54;
const TITLE_MAX_LINES = 5;

const DESC_FONT_SIZE = 20;
const DESC_LINE_HEIGHT = 28;
const DESC_MAX_LINES = 3;

// Approximate character widths so we can wrap without measuring fonts.
// Calibrated for the chosen font sizes.
const TITLE_CHARS_PER_LINE = 24;
const DESC_CHARS_PER_LINE = 42;

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
 * Greedy word-wrap into a fixed number of lines. Lines beyond the limit
 * are truncated with an ellipsis on the last visible line.
 */
function wrap(
  text: string,
  maxCharsPerLine: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // Break a single oversized word.
      if (word.length > maxCharsPerLine) {
        let remaining = word;
        while (remaining.length > maxCharsPerLine) {
          lines.push(remaining.slice(0, maxCharsPerLine));
          remaining = remaining.slice(maxCharsPerLine);
        }
        current = remaining;
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

  // Add ellipsis if we truncated.
  const totalConsumed = lines.join(' ').length;
  if (totalConsumed < text.trim().length && lines.length > 0) {
    const last = lines[lines.length - 1];
    const truncated =
      last.length > maxCharsPerLine - 1
        ? last.slice(0, maxCharsPerLine - 1)
        : last;
    lines[lines.length - 1] = `${truncated}…`;
  }

  return lines;
}

/** Stable-hash a string into a palette index. */
function paletteIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % AVATAR_PALETTE.length;
}

/** First grapheme of the seed (uppercase). Falls back to '?'. */
function initial(seed: string): string {
  const trimmed = seed.trim();
  if (!trimmed) return '?';
  // Strip leading '@' on handles.
  const cleaned = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return cleaned[0]?.toUpperCase() ?? '?';
}

export interface TextCardOptions {
  title: string;
  description?: string;
  /**
   * Author of the thought. When provided, an avatar chip + display name
   * + handle are rendered in the bottom-left of the card. When omitted,
   * the card renders title-only.
   */
  creator?: {
    /** Required if `creator` is provided — used for handle and avatar fallback. */
    accountId: string;
    /** Pretty name (e.g. profile.name). Defaults to accountId without TLD. */
    displayName?: string;
  };
}

/** Generate a text-card SVG. Returns the raw SVG markup. */
export function generateTextCardSvg(opts: TextCardOptions): string {
  const titleLines = wrap(opts.title, TITLE_CHARS_PER_LINE, TITLE_MAX_LINES);
  const descLines = opts.description
    ? wrap(opts.description, DESC_CHARS_PER_LINE, DESC_MAX_LINES)
    : [];

  const creator = opts.creator;
  const showAuthor = !!creator;

  // ---- Vertical layout -------------------------------------------------
  // The author chip occupies a fixed-height block at the bottom; the
  // title+description stack is vertically centred in the remaining space.
  const AUTHOR_BLOCK_HEIGHT = showAuthor ? 96 : 0;
  const contentTop = PADDING + 32; // leave room for the quote glyph
  const contentBottom = HEIGHT - PADDING - AUTHOR_BLOCK_HEIGHT;
  const contentArea = contentBottom - contentTop;

  const titleBlockHeight = titleLines.length * TITLE_LINE_HEIGHT;
  const descBlockHeight = descLines.length * DESC_LINE_HEIGHT;
  const stackHeight =
    titleBlockHeight + (descLines.length ? 24 + descBlockHeight : 0);

  const stackTop = contentTop + Math.max(0, (contentArea - stackHeight) / 2);
  const titleStartY = stackTop + TITLE_FONT_SIZE; // first baseline

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="${PADDING}" dy="${i === 0 ? 0 : TITLE_LINE_HEIGHT}">${esc(line)}</tspan>`
    )
    .join('');

  const descStartY = titleStartY + titleBlockHeight + 12;
  const descTspans = descLines
    .map(
      (line, i) =>
        `<tspan x="${PADDING}" dy="${i === 0 ? 0 : DESC_LINE_HEIGHT}">${esc(line)}</tspan>`
    )
    .join('');

  // ---- Author chip (bottom-left) --------------------------------------
  let authorBlock = '';
  if (creator) {
    const accountId = creator.accountId;
    const displayName =
      creator.displayName?.trim() ||
      // Strip the .near / .testnet suffix for a cleaner default.
      accountId.replace(/\.(near|testnet)$/i, '');
    const handle = `@${accountId}`;
    const avatarColor = AVATAR_PALETTE[paletteIndex(accountId)];
    const avatarLetter = initial(displayName || accountId);

    const chipY = HEIGHT - PADDING - 32;
    const avatarR = 22;
    const avatarCx = PADDING + avatarR;
    const avatarCy = chipY;
    const textX = avatarCx + avatarR + 14;

    authorBlock = `
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="${avatarColor}"/>
  <text x="${avatarCx}" y="${avatarCy + 7}" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="20" font-weight="700" fill="${COLORS.textPrimary}">${esc(avatarLetter)}</text>
  <text x="${textX}" y="${avatarCy - 4}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="17" font-weight="600" fill="${COLORS.textPrimary}">${esc(displayName)}</text>
  <text x="${textX}" y="${avatarCy + 17}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="13" font-weight="400" fill="${COLORS.textMuted}">${esc(handle)}</text>`;
  }

  // ---- Decorative quote glyph -----------------------------------------
  // Top-left, large, low-opacity — frames the thought as a quote without
  // competing with the title.
  const quoteGlyph = `
  <text x="${PADDING - 6}" y="${PADDING + 78}" font-family="Georgia, 'Times New Roman', serif" font-size="160" font-weight="700" fill="${COLORS.quoteGlyph}" opacity="0.16">\u201C</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${COLORS.bgFrom}"/>
      <stop offset="100%" stop-color="${COLORS.bgTo}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
  <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="${COLORS.border}" stroke-width="1.5" rx="28"/>
  ${quoteGlyph}
  <text x="${PADDING}" y="${titleStartY}" font-family="Georgia, 'Times New Roman', serif" font-size="${TITLE_FONT_SIZE}" font-weight="700" fill="${COLORS.textPrimary}">${titleTspans}</text>
  ${descLines.length ? `<text x="${PADDING}" y="${descStartY}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${DESC_FONT_SIZE}" font-weight="400" fill="${COLORS.textMuted}">${descTspans}</text>` : ''}${authorBlock}
</svg>`;
}
