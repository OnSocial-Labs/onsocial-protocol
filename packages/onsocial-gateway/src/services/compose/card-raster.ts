import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Resvg, type ResvgRenderOptions } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const OUTPUT_WIDTH = 1200;

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

function resolveFontFiles(): string[] {
  const files = [...FONT_FILES];
  for (const candidate of EMOJI_FONT_CANDIDATES) {
    if (existsSync(candidate)) {
      files.push(candidate);
      break;
    }
  }
  return files;
}

/**
 * Resvg 2.x ignores `fitTo` when fonts are supplied via `fontBuffers`.
 * Scale the SVG canvas attrs instead (viewBox stays 600 so layout holds).
 */
function scaleSvgToOutput(svg: string): string {
  return svg
    .replace(/\bwidth="\d+(?:\.\d+)?"/i, `width="${OUTPUT_WIDTH}"`)
    .replace(/\bheight="\d+(?:\.\d+)?"/i, `height="${OUTPUT_WIDTH}"`);
}

/**
 * Produce the permanent NFT asset. Fonts load as buffers — Resvg 2.x does
 * not register Fontsource `.woff` via `fontFiles`, which produced blank-title
 * PNGs (mark + avatar only). System fonts stay off so hosts cannot leak into
 * permanent artwork beyond the optional emoji face.
 */
export function rasterizeTextCard(svg: string): Buffer {
  const fontFiles = resolveFontFiles();
  // Read eagerly so a missing production font fails the mint rather than
  // silently substituting a host font into permanent artwork.
  const fontBuffers = fontFiles.map((fontFile) => readFileSync(fontFile));

  // `fontBuffers` is supported by @resvg/resvg-js@2.6 but missing from its
  // published typings (only `fontFiles` / `fontDirs` are declared).
  const options = {
    font: {
      fontBuffers,
      loadSystemFonts: false,
      defaultFontFamily: 'DM Sans',
    },
  } as ResvgRenderOptions;

  const image = new Resvg(scaleSvgToOutput(svg), options);
  return Buffer.from(image.render().asPng());
}
