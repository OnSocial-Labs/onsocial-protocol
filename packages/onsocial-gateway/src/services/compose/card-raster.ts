import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { Resvg, type ResvgRenderOptions } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
/** 600 design grid × 3 — sharper when UI shows the card small. */
const OUTPUT_WIDTH = 1800;

function packageFont(path: string): string {
  return require.resolve(path);
}

const FONT_FILES = [
  packageFont('@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff'),
  packageFont('@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff'),
  packageFont('@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff'),
  packageFont(
    '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff'
  ),
  packageFont('@fontsource/newsreader/files/newsreader-latin-500-normal.woff'),
  packageFont(
    '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff'
  ),
  fileURLToPath(
    new URL(
      '../../../../onsocial-app/public/fonts/erica-type/erika_type-webfont.woff',
      import.meta.url
    )
  ),
  fileURLToPath(
    new URL(
      '../../../../onsocial-app/public/fonts/erica-type/erika_type_b-webfont.woff',
      import.meta.url
    )
  ),
];

/**
 * Optional color-emoji face so mint PNGs match browser preview when the
 * host ships Noto Color Emoji (gateway Docker installs `font-noto-emoji`).
 * Override with ONSOCIAL_EMOJI_FONT=/path/to/font.ttf.
 */
const EMOJI_FONT_CANDIDATES = [
  process.env.ONSOCIAL_EMOJI_FONT,
  '/usr/share/fonts/noto/NotoColorEmoji.ttf',
  '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
  '/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf',
].filter((p): p is string => typeof p === 'string' && p.length > 0);

const WOFF_SIGNATURE = 0x774f4646; // 'wOFF'

/**
 * WOFF v1 → raw SFNT (TTF/OTF). Resvg's font database only parses
 * TTF/OTF from disk, and its in-memory `fontBuffers` path is silently
 * ignored by the musl (Alpine) binding — text rendered as nothing in
 * production while glibc dev machines looked fine. Decompressing the
 * woffs ourselves lets every platform use plain `fontFiles`.
 */
function woffToSfnt(woff: Buffer): Buffer {
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);

  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) {
    searchRange *= 2;
    entrySelector += 1;
  }
  searchRange *= 16;
  const rangeShift = numTables * 16 - searchRange;

  const header = Buffer.alloc(12);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(rangeShift, 10);

  const records = Buffer.alloc(numTables * 16);
  const tables: Buffer[] = [];
  let offset = 12 + numTables * 16;

  for (let i = 0; i < numTables; i += 1) {
    const entry = 44 + i * 20;
    const tag = woff.readUInt32BE(entry);
    const dataOffset = woff.readUInt32BE(entry + 4);
    const compLength = woff.readUInt32BE(entry + 8);
    const origLength = woff.readUInt32BE(entry + 12);
    const origChecksum = woff.readUInt32BE(entry + 16);

    const raw = woff.subarray(dataOffset, dataOffset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
    if (data.length !== origLength) {
      throw new Error(
        `WOFF table ${i} decompressed to ${data.length} bytes, expected ${origLength}`
      );
    }

    const record = i * 16;
    records.writeUInt32BE(tag, record);
    records.writeUInt32BE(origChecksum, record + 4);
    records.writeUInt32BE(offset, record + 8);
    records.writeUInt32BE(origLength, record + 12);

    const padded = Buffer.alloc((data.length + 3) & ~3);
    data.copy(padded);
    tables.push(padded);
    offset += padded.length;
  }

  return Buffer.concat([header, records, ...tables]);
}

const CONVERTED_FONT_DIR = join(tmpdir(), 'onsocial-card-fonts');

/** Lazy per-process cache: source path → on-disk TTF/OTF path for Resvg. */
let resolvedFontFilesCache: string[] | null = null;

function toResvgFontFile(sourcePath: string): string {
  // Read eagerly so a missing production font fails the mint rather than
  // silently substituting a host font into permanent artwork.
  const bytes = readFileSync(sourcePath);
  if (bytes.length < 4 || bytes.readUInt32BE(0) !== WOFF_SIGNATURE) {
    return sourcePath; // already TTF/OTF — Resvg reads it directly
  }

  const target = join(
    CONVERTED_FONT_DIR,
    `${basename(sourcePath, '.woff')}.ttf`
  );
  mkdirSync(CONVERTED_FONT_DIR, { recursive: true });
  // Write via temp + rename so concurrent workers never read a torn file.
  const scratch = `${target}.${process.pid}.tmp`;
  writeFileSync(scratch, woffToSfnt(bytes));
  renameSync(scratch, target);
  return target;
}

function resolveFontFiles(): string[] {
  if (resolvedFontFilesCache) return resolvedFontFilesCache;
  const files = FONT_FILES.map(toResvgFontFile);
  for (const candidate of EMOJI_FONT_CANDIDATES) {
    if (existsSync(candidate)) {
      files.push(candidate);
      break;
    }
  }
  resolvedFontFilesCache = files;
  return files;
}

/**
 * Resvg 2.x ignores `fitTo` when fonts are supplied explicitly.
 * Scale the SVG canvas attrs instead (viewBox stays 600 so layout holds).
 */
function scaleSvgToOutput(svg: string): string {
  return svg
    .replace(/\bwidth="\d+(?:\.\d+)?"/i, `width="${OUTPUT_WIDTH}"`)
    .replace(/\bheight="\d+(?:\.\d+)?"/i, `height="${OUTPUT_WIDTH}"`);
}

/**
 * Produce the permanent NFT asset. Fonts load via `fontFiles` with
 * TTFs decompressed from our woffs — `fontBuffers` is a silent no-op on
 * the musl Resvg binding (blank titles in Docker), and `fontFiles`
 * cannot parse WOFF directly. System fonts stay off so hosts cannot
 * leak into permanent artwork beyond the optional emoji face.
 *
 * Quality: layout stays the 600 design grid × 3 (1800 PNG). Text uses
 * optimizeLegibility; embedded avatar/photo use optimizeQuality — neither
 * changes on-card sizes.
 */
export function rasterizeTextCard(svg: string): Buffer {
  const options = {
    font: {
      fontFiles: resolveFontFiles(),
      loadSystemFonts: false,
      defaultFontFamily: 'DM Sans',
    },
    // 1 = optimizeLegibility (text); 2 = geometricPrecision (marks/clips)
    textRendering: 1,
    shapeRendering: 2,
    // 0 = optimizeQuality for <image> (avatar / proof photo)
    imageRendering: 0,
  } as ResvgRenderOptions;

  const image = new Resvg(scaleSvgToOutput(svg), options);
  return Buffer.from(image.render().asPng());
}
