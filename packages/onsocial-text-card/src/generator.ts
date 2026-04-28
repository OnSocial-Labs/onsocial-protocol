// ---------------------------------------------------------------------------
// Pure SVG text-card generator — runs identically in Node and the browser.
//
// Used by the OnSocial gateway as the canonical render at mint time, and
// by client UIs (via @onsocial/sdk's `previewTextCard`) for live preview.
// Same input → byte-identical output, so what-you-see is what-you-get.
//
// Zero deps, no canvas, no sharp. Returns raw SVG markup.
// ---------------------------------------------------------------------------

import {
  BACKGROUNDS,
  FONTS,
  resolveTheme,
  type BackgroundKey,
  type FontKey,
} from './themes.js';

const WIDTH = 600;
const HEIGHT = 600;
const PADDING = 56;

const TITLE_FONT_SIZE = 42;
const TITLE_LINE_HEIGHT = 54;
const TITLE_MAX_LINES = 5;

const DESC_FONT_SIZE = 20;
const DESC_LINE_HEIGHT = 28;
const DESC_MAX_LINES = 3;

const TITLE_CHARS_PER_LINE = 24;
const DESC_CHARS_PER_LINE = 42;

/** Deterministic palette for the author chip background. Per-account colour. */
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

function paletteIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % AVATAR_PALETTE.length;
}

function initial(seed: string): string {
  const trimmed = seed.trim();
  if (!trimmed) return '?';
  const cleaned = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return cleaned[0]?.toUpperCase() ?? '?';
}

export interface TextCardOptions {
  title: string;
  description?: string;
  /**
   * Author of the thought. When provided, an avatar chip + display name
   * + handle are rendered in the bottom-left of the card.
   */
  creator?: {
    accountId: string;
    displayName?: string;
  };
  /**
   * Theme selection. Unknown / missing keys fall back to defaults.
   * Always validate at the route boundary before passing user input here.
   */
  theme?: {
    bg?: BackgroundKey | string;
    font?: FontKey | string;
  };
}

/** Generate a text-card SVG. Returns raw SVG markup (string). */
export function generateTextCardSvg(opts: TextCardOptions): string {
  const { bg, font } = resolveTheme(opts.theme);
  const palette = BACKGROUNDS[bg];
  const type = FONTS[font];

  const titleSource = type.titleUppercase
    ? opts.title.toUpperCase()
    : opts.title;
  const titleLines = wrap(titleSource, TITLE_CHARS_PER_LINE, TITLE_MAX_LINES);
  const descLines = opts.description
    ? wrap(opts.description, DESC_CHARS_PER_LINE, DESC_MAX_LINES)
    : [];

  const creator = opts.creator;
  const showAuthor = !!creator;

  // ---- Vertical layout -------------------------------------------------
  const AUTHOR_BLOCK_HEIGHT = showAuthor ? 96 : 0;
  const contentTop = PADDING + (type.showQuoteGlyph ? 32 : 0);
  const contentBottom = HEIGHT - PADDING - AUTHOR_BLOCK_HEIGHT;
  const contentArea = contentBottom - contentTop;

  const titleBlockHeight = titleLines.length * TITLE_LINE_HEIGHT;
  const descBlockHeight = descLines.length * DESC_LINE_HEIGHT;
  const stackHeight =
    titleBlockHeight + (descLines.length ? 24 + descBlockHeight : 0);

  const stackTop = contentTop + Math.max(0, (contentArea - stackHeight) / 2);
  const titleStartY = stackTop + TITLE_FONT_SIZE;

  const titleLetterSpacing = type.titleUppercase ? ' letter-spacing="2"' : '';

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
      accountId.replace(/\.(near|testnet)$/i, '');
    const handle = `@${accountId}`;
    // Author chip bg keeps the deterministic per-account palette so each
    // user gets "their colour" across themes. The accent (theme-derived)
    // is used as a subtle ring around the chip.
    const avatarColor = AVATAR_PALETTE[paletteIndex(accountId)];
    const avatarLetter = initial(displayName || accountId);

    const chipY = HEIGHT - PADDING - 32;
    const avatarR = 22;
    const avatarCx = PADDING + avatarR;
    const avatarCy = chipY;
    const textX = avatarCx + avatarR + 14;

    authorBlock = `
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 2}" fill="none" stroke="${palette.accent}" stroke-width="1.5" opacity="0.7"/>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="${avatarColor}"/>
  <text x="${avatarCx}" y="${avatarCy + 7}" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">${esc(avatarLetter)}</text>
  <text x="${textX}" y="${avatarCy - 4}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="17" font-weight="600" fill="${palette.textPrimary}">${esc(displayName)}</text>
  <text x="${textX}" y="${avatarCy + 17}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="13" font-weight="400" fill="${palette.textMuted}">${esc(handle)}</text>`;
  }

  // ---- Decorative quote glyph (only in 'quote' typography) ------------
  const quoteGlyph = type.showQuoteGlyph
    ? `
  <text x="${PADDING - 6}" y="${PADDING + 78}" font-family="Georgia, 'Times New Roman', serif" font-size="160" font-weight="700" fill="${palette.accent}" opacity="0.16">\u201C</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bgFrom}"/>
      <stop offset="100%" stop-color="${palette.bgTo}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
  <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" fill="none" stroke="${palette.border}" stroke-width="1.5" rx="28"/>${quoteGlyph}
  <text x="${PADDING}" y="${titleStartY}" font-family="${type.titleFamily}" font-size="${TITLE_FONT_SIZE}" font-weight="${type.titleWeight}" fill="${palette.textPrimary}"${titleLetterSpacing}>${titleTspans}</text>
  ${descLines.length ? `<text x="${PADDING}" y="${descStartY}" font-family="${type.descFamily}" font-size="${DESC_FONT_SIZE}" font-weight="400" fill="${palette.textMuted}">${descTspans}</text>` : ''}${authorBlock}
</svg>`;
}

/**
 * Convenience: returns the SVG string plus a base64 `data:` URI suitable
 * for inlining in `<img src>` or for use as the on-chain `media` field.
 * Useful for client-side live preview (no network round-trip).
 */
export function previewTextCard(opts: TextCardOptions): {
  svg: string;
  dataUri: string;
} {
  const svg = generateTextCardSvg(opts);
  const base64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg, 'utf8').toString('base64');
  return { svg, dataUri: `data:image/svg+xml;base64,${base64}` };
}
