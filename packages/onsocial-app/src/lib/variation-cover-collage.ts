/**
 * Client-side variation Drop cover collage (square packaging art).
 * Token media stays per-seat; this is collection-level face only.
 */

import {
  MOODS,
  moodForCardFormat,
} from '@onsocial/text-card';

export const COLLAGE_STYLES = [
  'single',
  'duet',
  'orbit',
  'pack',
  'grid',
  'mosaic',
  'film',
] as const;

export type CollageStyle = (typeof COLLAGE_STYLES)[number];

export const COLLAGE_STYLE_LABELS: Record<CollageStyle, string> = {
  single: 'Single',
  duet: 'Duet',
  orbit: 'Orbit',
  pack: 'Pack',
  grid: 'Grid',
  mosaic: 'Mosaic',
  film: 'Film',
};

const OUTPUT_SIZE = 1200;
const MAX_TILES = 16;

/**
 * Outer frame radius as a fraction of the square.
 * Clears typical `0.75rem` clip on mid/large covers; tiny create thumbs may
 * shave a little paper at the corners (same chrome as seat tiles).
 */
export const COLLAGE_FRAME_RADIUS_RATIO = 0.1;

/** Minimum inset so seat art clears the rounded CSS/card clip. */
export function collageSafePad(size: number): number {
  return size * COLLAGE_FRAME_RADIUS_RATIO;
}

/** Distinct ground per style — warm paper / true black, no grey mush. */
export const STYLE_PAPER: Record<CollageStyle, string> = {
  single: '#F5F1EA',
  duet: '#F3EEE6',
  orbit: '#F1EDE6',
  pack: '#F6F0E7',
  grid: '#F4EFE6',
  mosaic: '#0C0B0A',
  film: '#050505',
};

/** Resolve canvas fill: explicit hex / Finish bg, else per-style Auto default. */
export function resolveCollagePaperColor(
  style: CollageStyle,
  paperColor?: string | null
): string {
  const trimmed = paperColor?.trim();
  if (trimmed) return trimmed;
  return STYLE_PAPER[style];
}

/** Parse #RGB / #RRGGBB into 0–255 channels. */
function parseHexRgb(
  hex: string
): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : raw;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Ink for packaging chrome — Finish textPrimary when known, else luminance
 * from the paper fill (light paper → dark type, dark paper → light type).
 */
export function resolveCollageInkColor(
  paperColor: string,
  inkColor?: string | null
): string {
  const explicit = inkColor?.trim();
  if (explicit) return explicit;
  const rgb = parseHexRgb(paperColor);
  if (!rgb) return '#0B0B0F';
  return paperLuminance(rgb) > 0.45 ? '#0B0B0F' : '#F5F0E8';
}

function paperLuminance(rgb: { r: number; g: number; b: number }): number {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

/** True when paper is dark enough that black seat shadows disappear. */
export function isCollagePaperDark(paperColor: string): boolean {
  const rgb = parseHexRgb(paperColor);
  if (!rgb) return false;
  return paperLuminance(rgb) <= 0.45;
}

export type CollageSeatImage = {
  seat: number;
  /** Object URL or https/ipfs-resolvable URL (CORS-enabled). */
  src: string;
};

export function nextCollageStyle(current: CollageStyle, delta: 1 | -1): CollageStyle {
  const i = COLLAGE_STYLES.indexOf(current);
  const next = (i + delta + COLLAGE_STYLES.length) % COLLAGE_STYLES.length;
  return COLLAGE_STYLES[next]!;
}

/** Prefer cover seat, then evenly sample up to `max` seats. */
export function sampleCollageSeats(
  seatNumbers: readonly number[],
  coverSeat: number,
  max: number = MAX_TILES
): number[] {
  const unique = [
    ...new Set(
      seatNumbers.filter((n) => Number.isSafeInteger(n) && n >= 1)
    ),
  ].sort((a, b) => a - b);
  if (unique.length === 0) return [];
  const cover = unique.includes(coverSeat) ? coverSeat : unique[0]!;
  if (unique.length <= max) {
    return [cover, ...unique.filter((s) => s !== cover)];
  }
  const rest = unique.filter((s) => s !== cover);
  const picked = new Set<number>([cover]);
  const slots = max - 1;
  for (let i = 0; i < slots; i += 1) {
    const t = (i + 0.5) / slots;
    const idx = Math.min(rest.length - 1, Math.floor(t * rest.length));
    picked.add(rest[idx]!);
  }
  // Fill if duplicates collapsed
  for (const s of rest) {
    if (picked.size >= max) break;
    picked.add(s);
  }
  return [cover, ...[...picked].filter((s) => s !== cover).sort((a, b) => a - b)];
}

function tileCapForStyle(style: CollageStyle, available: number): number {
  if (style === 'single') return 1;
  if (style === 'duet') return 2;
  if (style === 'film') return Math.min(4, Math.max(3, available));
  if (style === 'orbit') return Math.min(6, Math.max(4, available));
  // Pack / grid / mosaic — real seat count only (no duplicate padding).
  if (style === 'pack') return Math.min(9, Math.max(1, available));
  if (style === 'grid') return Math.min(9, Math.max(1, available));
  if (style === 'mosaic') return Math.min(MAX_TILES, Math.max(1, available));
  return Math.min(MAX_TILES, Math.max(1, available));
}

/** Columns × rows for an equal-square nest grid. */
function gridDims(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  if (n <= 12) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 };
}

/** Repeat seats so each layout still reads as that style with few uploads. */
export function expandCollageSrcsForStyle(
  srcs: string[],
  style: CollageStyle
): string[] {
  if (srcs.length === 0) return srcs;
  const target = tileCapForStyle(style, srcs.length);
  if (srcs.length >= target) return srcs.slice(0, target);
  const out = [...srcs];
  let i = 0;
  while (out.length < target) {
    out.push(srcs[i % srcs.length]!);
    i += 1;
  }
  return out;
}

/** @deprecated internal alias — prefer expandCollageSrcsForStyle */
function expandSrcsForStyle(
  srcs: string[],
  style: CollageStyle
): string[] {
  return expandCollageSrcsForStyle(srcs, style);
}

async function loadBitmap(src: string): Promise<ImageBitmap> {
  const res = await fetch(collageFetchUrl(src), { mode: 'cors' });
  if (!res.ok) throw new Error(`Could not load seat art (${res.status})`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/**
 * Prefer same-origin `/api/ipfs/…` for OnSocial CDN URLs so canvas fetch
 * is not blocked by CDN CORS when building packaging covers.
 */
export function collageFetchUrl(src: string): string {
  const trimmed = src.trim();
  if (
    !trimmed ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  const cdn = trimmed.match(
    /^https:\/\/cdn\.(?:testnet\.)?onsocial\.id\/ipfs\/(.+)$/i
  );
  if (cdn?.[1]) {
    return `/api/ipfs/${encodeURIComponent(cdn[1])}`;
  }
  if (trimmed.startsWith('ipfs://')) {
    const path = trimmed.slice('ipfs://'.length).replace(/^\/+/, '');
    if (path) return `/api/ipfs/${encodeURIComponent(path)}`;
  }
  return trimmed;
}

function drawCoverFill(
  ctx: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
  paperDark = false
) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (radius > 0) {
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }
  // Cover — fill the gate completely (crop overflow).
  const scale = Math.max(w / bmp.width, h / bmp.height);
  const dw = bmp.width * scale;
  const dh = bmp.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(bmp, dx, dy, dw, dh);
  ctx.restore();

  // Print edge — paper-aware hairline (no cast shadow; depth from overlap/fan).
  if (radius > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.strokeStyle = paperDark
      ? 'rgb(255 255 255 / 0.18)'
      : 'rgb(0 0 0 / 0.08)';
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.003);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Seat corner radius inside the packaging collage.
 * Soft photo corners (not zero) — sharp + rotation reads jagged on paper.
 * Film stays square (strip gates).
 */
export function collageTileCornerRadius(
  style: CollageStyle,
  w: number,
  h: number,
  _canvasSize: number
): number {
  if (style === 'film') return 0;
  return Math.min(w, h) * 0.055;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Packaging title faces — Header is the cover default; others mirror mint Formats. */
export const COLLAGE_FONTS = [
  'header',
  'poster',
  'letter',
  'journal',
  'mono',
] as const;

export type CollageFont = (typeof COLLAGE_FONTS)[number];

export const COLLAGE_FONT_LABELS: Record<CollageFont, string> = {
  header: 'Header',
  poster: 'Poster',
  letter: 'Letter',
  journal: 'Journal',
  mono: 'Mono',
};

export const COLLAGE_FONT_DESCRIPTIONS: Record<CollageFont, string> = {
  header: 'IBM Plex Sans. Quiet packaging type.',
  poster: 'Space Grotesk. Crisp, geometric, built for posters.',
  letter: 'Erica Type. Expressive, distinctive.',
  journal: 'Newsreader. Quiet editorial serif.',
  mono: 'JetBrains Mono. Dev-native, terminal-adjacent.',
};

export const DEFAULT_COLLAGE_FONT: CollageFont = 'header';

export function isCollageFont(value: string): value is CollageFont {
  return (COLLAGE_FONTS as readonly string[]).includes(value);
}

/** Accept legacy keys from earlier drafts (`plex` / `thought` → Header). */
export function resolveCollageFont(value?: string | null): CollageFont {
  if (value && isCollageFont(value)) return value;
  if (value === 'plex' || value === 'thought') return 'header';
  return DEFAULT_COLLAGE_FONT;
}

const HEADER_FAMILY_FALLBACK = "'IBM Plex Sans', system-ui, sans-serif";

function resolveAppFontFamily(cssVar: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  return value ? `${value}, system-ui, sans-serif` : fallback;
}

type CollageFontSpec = {
  titleFamily: string;
  titleWeight: number;
  titleUppercase: boolean;
  titleLetterSpacing: number;
};

function resolveHeaderFamily(): string {
  return resolveAppFontFamily('--font-ibm-plex-sans', HEADER_FAMILY_FALLBACK);
}

function resolveCollageFontSpec(font: CollageFont): CollageFontSpec {
  if (font === 'header') {
    return {
      titleFamily: resolveHeaderFamily(),
      titleWeight: 650,
      titleUppercase: false,
      titleLetterSpacing: 0,
    };
  }
  const mood = MOODS[moodForCardFormat(font, 'light')];
  return {
    titleFamily: mood.titleFamily,
    titleWeight: mood.titleWeight,
    titleUppercase: mood.titleUppercase,
    titleLetterSpacing: mood.titleLetterSpacing,
  };
}

function drawCoverChrome(
  ctx: CanvasRenderingContext2D,
  opts: {
    size: number;
    title: string | null;
    showTitle: boolean;
    uniqueCount: number;
    showLabel: boolean;
    inkColor: string;
    font: CollageFont;
  }
) {
  const size = opts.size;
  const showTitle = opts.showTitle && Boolean(opts.title?.trim());
  const showLabel = opts.showLabel && opts.uniqueCount > 0;
  if (!showTitle && !showLabel) return;

  const face = resolveCollageFontSpec(opts.font);
  // Unique stays Header — quiet packaging meta, not the title voice.
  const labelFamily = resolveHeaderFamily();
  const margin = Math.max(size * 0.04, collageSafePad(size) + size * 0.012);
  const ink = opts.inkColor;

  if (showTitle) {
    const raw = opts.title!.trim();
    let title = raw.length > 28 ? `${raw.slice(0, 27)}…` : raw;
    if (face.titleUppercase) title = title.toUpperCase();
    const fontSize = Math.round(size * 0.048);
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = `${face.titleWeight} ${fontSize}px ${face.titleFamily}`;
    if (
      typeof (ctx as CanvasRenderingContext2D & { letterSpacing?: string })
        .letterSpacing !== 'undefined' &&
      face.titleLetterSpacing
    ) {
      (
        ctx as CanvasRenderingContext2D & { letterSpacing: string }
      ).letterSpacing = `${face.titleLetterSpacing}px`;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, margin, margin, size * 0.88);
    ctx.restore();
  }

  if (showLabel) {
    const label = `${opts.uniqueCount.toLocaleString('en-US')} unique`;
    const fontSize = Math.round(size * 0.028);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = ink;
    ctx.font = `550 ${fontSize}px ${labelFamily}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, size - margin, size - margin, size * 0.4);
    ctx.restore();
  }
}

export type CollageLayoutRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
};

export type CollageChromeOpts = {
  showTitle?: boolean;
  showLabel?: boolean;
};

/** Top paper band for title — always reserved so seats don’t jump on toggle. */
export function collageTitleBand(size: number, _showTitle = true): number {
  void _showTitle;
  return Math.max(
    size * 0.11,
    collageSafePad(size) + size * 0.048 + size * 0.028
  );
}

/** Bottom paper band for label — always reserved so seats don’t jump on toggle. */
export function collageLabelBand(size: number, _showLabel = true): number {
  void _showLabel;
  return Math.max(
    size * 0.09,
    collageSafePad(size) + size * 0.028 + size * 0.022
  );
}

/**
 * Mosaic magazine fill — every count packs the content box (no dead paper
 * under the hero). Odd counts get a centered bottom row when needed.
 */
function layoutMosaicRects(
  count: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  gap: number
): CollageLayoutRect[] {
  if (count <= 1) {
    return [{ x: boxX, y: boxY, w: boxW, h: boxH }];
  }

  if (count === 2) {
    const w = (boxW - gap) / 2;
    return [
      { x: boxX, y: boxY, w, h: boxH },
      { x: boxX + w + gap, y: boxY, w, h: boxH },
    ];
  }

  if (count === 3) {
    const heroW = boxW * 0.58;
    const sideW = boxW - heroW - gap;
    const sideH = (boxH - gap) / 2;
    return [
      { x: boxX, y: boxY, w: heroW, h: boxH },
      { x: boxX + heroW + gap, y: boxY, w: sideW, h: sideH },
      { x: boxX + heroW + gap, y: boxY + sideH + gap, w: sideW, h: sideH },
    ];
  }

  if (count === 4) {
    const w = (boxW - gap) / 2;
    const h = (boxH - gap) / 2;
    return [
      { x: boxX, y: boxY, w, h },
      { x: boxX + w + gap, y: boxY, w, h },
      { x: boxX, y: boxY + h + gap, w, h },
      { x: boxX + w + gap, y: boxY + h + gap, w, h },
    ];
  }

  // 5+: hero top-left, side stack beside hero, bottom row fills the rest.
  const rem = count - 1;
  const sideCount = Math.min(3, Math.max(2, Math.floor(rem / 2)));
  const bottomCount = rem - sideCount;
  const heroW = boxW * 0.58;
  const sideW = boxW - heroW - gap;
  const bottomH =
    bottomCount > 0 ? Math.min(boxH * 0.4, (boxH - gap) * 0.42) : 0;
  const heroH = boxH - (bottomCount > 0 ? bottomH + gap : 0);
  const sideH = (heroH - gap * (sideCount - 1)) / sideCount;

  const rects: CollageLayoutRect[] = [
    { x: boxX, y: boxY, w: heroW, h: heroH },
  ];
  for (let i = 0; i < sideCount; i += 1) {
    rects.push({
      x: boxX + heroW + gap,
      y: boxY + i * (sideH + gap),
      w: sideW,
      h: sideH,
    });
  }
  if (bottomCount > 0) {
    const bottomY = boxY + heroH + gap;
    const bottomW = (boxW - gap * (bottomCount - 1)) / bottomCount;
    for (let i = 0; i < bottomCount; i += 1) {
      rects.push({
        x: boxX + i * (bottomW + gap),
        y: bottomY,
        w: bottomW,
        h: bottomH,
      });
    }
  }
  return rects;
}

/**
 * Pure layout geometry for a style + tile count.
 * Seats stay inside the frame safe pad and always clear title/label paper
 * bands — toggling chrome only shows type, it does not reflow seats.
 */
export function layoutCollageRects(
  style: CollageStyle,
  n: number,
  size: number,
  _chrome: CollageChromeOpts = {}
): CollageLayoutRect[] {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return [];
  const safe = collageSafePad(size);
  const padX = Math.max(size * 0.028, safe);
  // Always reserve bands — stable pack when Title/Label flip.
  const padTop = Math.max(padX, collageTitleBand(size));
  const padBottom = Math.max(padX, collageLabelBand(size));
  const boxX = padX;
  const boxY = padTop;
  const boxW = size - padX * 2;
  const boxH = size - padTop - padBottom;
  if (boxW < 8 || boxH < 8) return [];

  if (style === 'single') {
    // Main piece only — full packaging face.
    return [{ x: boxX, y: boxY, w: boxW, h: boxH }];
  }

  if (style === 'duet') {
    const gap = size * 0.012;
    const w = (boxW - gap) / 2;
    return [
      { x: boxX, y: boxY, w, h: boxH },
      { x: boxX + w + gap, y: boxY, w, h: boxH },
    ].slice(0, Math.min(2, count));
  }

  if (style === 'film') {
    // Square gates centered in the content box (fit height + width).
    const gap = size * 0.012;
    const rail = size * 0.048;
    const maxGate = Math.max(8, boxH - rail * 2);
    const cell = Math.min((boxW - gap * (count - 1)) / count, maxGate);
    const gateH = cell;
    const stripW = cell * count + gap * (count - 1);
    const stripH = gateH + rail * 2;
    const stripLeft = boxX + Math.max(0, (boxW - stripW) / 2);
    const stripTop = boxY + Math.max(0, (boxH - stripH) / 2);
    const gateY = stripTop + rail;
    return Array.from({ length: count }, (_, i) => ({
      x: stripLeft + i * (cell + gap),
      y: gateY,
      w: cell,
      h: gateH,
    }));
  }

  if (style === 'orbit') {
    const gap = size * 0.012;
    if (count === 1) {
      const hero = Math.min(boxW, boxH) * 0.92;
      return [
        {
          x: boxX + (boxW - hero) / 2,
          y: boxY + (boxH - hero) / 2,
          w: hero,
          h: hero,
        },
      ];
    }
    const hero = Math.min(boxW * 0.66, boxH);
    const sideW = boxW - hero - gap;
    const stack = count - 1;
    const smallH = (boxH - gap * (stack - 1)) / stack;
    const rects: CollageLayoutRect[] = [
      { x: boxX, y: boxY + (boxH - hero) / 2, w: hero, h: hero },
    ];
    for (let i = 1; i < count; i += 1) {
      rects.push({
        x: boxX + hero + gap,
        y: boxY + (i - 1) * (smallH + gap),
        w: sideW,
        h: smallH,
      });
    }
    return rects;
  }

  if (style === 'pack') {
    // Deck fan — hero (index 0) front-center; others fan L/R with soft rotate.
    const cx = boxX + boxW / 2;
    const cy = boxY + boxH / 2;
    const short = Math.min(boxW, boxH);
    const cellSeed =
      count <= 1
        ? 0.78
        : count === 2
          ? 0.64
          : count === 3
            ? 0.58
            : count <= 5
              ? 0.52
              : 0.46;
    const spreadSeed =
      count <= 1
        ? 0
        : count === 2
          ? 0.16
          : count === 3
            ? 0.2
            : count <= 5
              ? 0.24
              : 0.28;
    const maxRot =
      count <= 1
        ? 0
        : count === 2
          ? 0.11
          : count === 3
            ? 0.13
            : count <= 5
              ? 0.15
              : 0.17;
    const liftSeed = count <= 1 ? 0 : 0.018;

    const fanT = (i: number): number => {
      if (count === 1 || i === 0) return 0;
      if (count === 2) return -0.62;
      const others = count - 1;
      const j = i - 1;
      // Alternate L/R so hero stays visually centered.
      const rank = Math.ceil((j + 1) / 2);
      const sign = j % 2 === 0 ? -1 : 1;
      const maxRank = Math.ceil(others / 2);
      return sign * (rank / maxRank);
    };

    const make = (cell: number, spread: number): CollageLayoutRect[] =>
      Array.from({ length: count }, (_, i) => {
        if (count === 1) {
          return { x: cx - cell / 2, y: cy - cell / 2, w: cell, h: cell };
        }
        const t = fanT(i);
        const rot = t * maxRot;
        const lift = Math.abs(t) * short * liftSeed;
        return {
          x: cx - cell / 2 + t * spread,
          y: cy - cell / 2 + lift,
          w: cell,
          h: cell,
          rot,
        };
      });

    let cell = short * cellSeed;
    let spread = short * spreadSeed;
    let rects = make(cell, spread);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of rects) {
      const b = collageRectBounds(r);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    const span = Math.max(cx - minX, maxX - cx, cy - minY, maxY - cy);
    const maxSpan = Math.min(
      cx - boxX,
      boxX + boxW - cx,
      cy - boxY,
      boxY + boxH - cy
    );
    if (span > 0 && maxSpan > 0) {
      const s = (maxSpan * 0.97) / span;
      cell *= s;
      spread *= s;
      rects = make(cell, spread);
    }
    return rects;
  }

  if (style === 'grid') {
    // Equal squares nestled — incomplete last row is centered (odd counts).
    const gap = size * 0.012;
    const { cols, rows } = gridDims(count);
    const cell = Math.min(
      (boxW - gap * (cols - 1)) / cols,
      (boxH - gap * (rows - 1)) / rows
    );
    const gridW = cell * cols + gap * (cols - 1);
    const gridH = cell * rows + gap * (rows - 1);
    const originX = boxX + (boxW - gridW) / 2;
    const originY = boxY + (boxH - gridH) / 2;
    return Array.from({ length: count }, (_, i) => {
      const row = Math.floor(i / cols);
      const colInRow = i % cols;
      const rowStart = row * cols;
      const rowCount = Math.min(cols, count - rowStart);
      const rowW = cell * rowCount + gap * Math.max(0, rowCount - 1);
      const rowOriginX = originX + (gridW - rowW) / 2;
      return {
        x: rowOriginX + colInRow * (cell + gap),
        y: originY + row * (cell + gap),
        w: cell,
        h: cell,
      };
    });
  }

  // mosaic — filled magazine layouts (no empty hole under the hero).
  return layoutMosaicRects(count, boxX, boxY, boxW, boxH, size * 0.012);
}

function layoutRects(
  style: CollageStyle,
  n: number,
  size: number,
  chrome: CollageChromeOpts = {}
): CollageLayoutRect[] {
  return layoutCollageRects(style, n, size, chrome);
}

function drawFilmFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  frameCount: number,
  _chrome: CollageChromeOpts = {}
) {
  // Match layoutCollageRects('film') — square gates + sprocket rails.
  void _chrome;
  const count = Math.max(1, frameCount);
  const safe = collageSafePad(size);
  const padX = Math.max(size * 0.028, safe);
  const padTop = Math.max(padX, collageTitleBand(size));
  const padBottom = Math.max(padX, collageLabelBand(size));
  const boxX = padX;
  const boxY = padTop;
  const boxW = size - padX * 2;
  const boxH = size - padTop - padBottom;
  const gap = size * 0.012;
  const rail = size * 0.048;
  const maxGate = Math.max(8, boxH - rail * 2);
  const cell = Math.min((boxW - gap * (count - 1)) / count, maxGate);
  const gateH = cell;
  const stripW = cell * count + gap * (count - 1);
  const stripH = gateH + rail * 2;
  const stripLeft = boxX + Math.max(0, (boxW - stripW) / 2);
  const stripTop = boxY + Math.max(0, (boxH - stripH) / 2);
  ctx.fillStyle = '#0A0A0A';
  ctx.fillRect(stripLeft - size * 0.008, stripTop, stripW + size * 0.016, stripH);
  const holeW = size * 0.018;
  const holeH = Math.min(rail * 0.55, size * 0.026);
  const holePadY = (rail - holeH) / 2;
  ctx.fillStyle = '#2A2A2A';
  for (
    let x = stripLeft + size * 0.01;
    x < stripLeft + stripW - holeW;
    x += holeW * 2.15
  ) {
    ctx.fillRect(x, stripTop + holePadY, holeW, holeH);
    ctx.fillRect(x, stripTop + stripH - holePadY - holeH, holeW, holeH);
  }
}

/** Axis-aligned bounds of a possibly rotated tile (for tests / safety). */
export function collageRectBounds(
  rect: CollageLayoutRect
): { minX: number; minY: number; maxX: number; maxY: number } {
  const rot = rect.rot ?? 0;
  if (!rot) {
    return {
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.w,
      maxY: rect.y + rect.h,
    };
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const hw = rect.w / 2;
  const hh = rect.h / 2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([dx, dy]) => ({
    x: cx + dx! * cos - dy! * sin,
    y: cy + dx! * sin + dy! * cos,
  }));
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

/**
 * Render a square packaging collage from seat images.
 * Throws if no images load (caller should fall back to seat-only cover).
 */
export async function renderVariationCoverCollage(opts: {
  images: CollageSeatImage[];
  coverSeat: number;
  uniqueCount: number;
  style: CollageStyle;
  title?: string | null;
  showTitle?: boolean;
  showLabel: boolean;
  /** Explicit paper hex (Finish bgFrom). Null/omit → STYLE_PAPER[style]. */
  paperColor?: string | null;
  /** Finish textPrimary. Null/omit → luminance from paper. */
  inkColor?: string | null;
  /** Packaging title voice — same Formats as mint-from-post. */
  font?: CollageFont | null;
  size?: number;
}): Promise<Blob> {
  const size = opts.size ?? OUTPUT_SIZE;
  const font = resolveCollageFont(opts.font);
  const seatOrder = sampleCollageSeats(
    opts.images.map((img) => img.seat),
    opts.coverSeat,
    MAX_TILES
  );
  const bySeat = new Map(opts.images.map((img) => [img.seat, img.src] as const));
  const baseSrcs = seatOrder
    .map((seat) => bySeat.get(seat))
    .filter((src): src is string => Boolean(src));
  const orderedSrcs = expandSrcsForStyle(baseSrcs, opts.style);
  if (orderedSrcs.length === 0) {
    throw new Error('No seat art available for the cover collage.');
  }

  const bitmaps = await Promise.all(
    orderedSrcs.map((src) => loadBitmap(src))
  );

  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');

    const paperColor = resolveCollagePaperColor(opts.style, opts.paperColor);
    const inkColor = resolveCollageInkColor(paperColor, opts.inkColor);
    const paperDark = isCollagePaperDark(paperColor);
    const showTitle = Boolean(opts.showTitle && opts.title?.trim());
    const showLabel = Boolean(opts.showLabel && opts.uniqueCount > 0);
    const chrome = { showTitle, showLabel };
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, size, size);
    if (opts.style === 'film') {
      drawFilmFrame(ctx, size, bitmaps.length, chrome);
    }

    const rects = layoutRects(opts.style, bitmaps.length, size, chrome);
    // Pack: draw back-to-front so hero (index 0) is on top — draw others first
    const order =
      opts.style === 'pack'
        ? [...bitmaps.keys()].reverse()
        : [...bitmaps.keys()];

    for (const i of order) {
      const bmp = bitmaps[i]!;
      const r = rects[i];
      if (!r) continue;
      const radius = collageTileCornerRadius(opts.style, r.w, r.h, size);
      if (r.rot) {
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.rotate(r.rot);
        drawCoverFill(
          ctx,
          bmp,
          -r.w / 2,
          -r.h / 2,
          r.w,
          r.h,
          radius,
          paperDark
        );
        ctx.restore();
      } else {
        drawCoverFill(ctx, bmp, r.x, r.y, r.w, r.h, radius, paperDark);
      }
    }

    drawCoverChrome(ctx, {
      size,
      title: opts.title ?? null,
      showTitle: Boolean(opts.showTitle),
      uniqueCount: opts.uniqueCount,
      showLabel: opts.showLabel,
      inkColor,
      font,
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) =>
          out
            ? resolve(out)
            : reject(new Error('Could not encode cover collage')),
        'image/png'
      );
    });
    return blob;
  } finally {
    for (const bmp of bitmaps) bmp.close();
  }
}
