#!/usr/bin/env node
/**
 * Rebuilds the installed-app icons from the maskable SVG path.
 *
 * The glyph is measured on its own bbox, then centred. Maskable icons keep
 * that bbox at 50% of the canvas (inside the 80% safe zone). `any` icons
 * use 56.5%. The Apple touch icon is full-bleed black at 55%, with no
 * baked corner radius. iOS startup images are the same black field with
 * the glyph at 24% of the shorter side.
 *
 *   node scripts/gen-icons.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  new URL('../packages/onsocial-app/package.json', import.meta.url)
);
const sharp = require('sharp');

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'packages/onsocial-app');
const publicDir = join(appRoot, 'public');
const sourceSvg = join(publicDir, 'onsocial_icon_maskable.svg');

/** Luminance at or above this counts as glyph ink. Matches the unit test. */
const GLYPH_MIN = 32;
const PROBE = 2048;

const MASKABLE_FRACTION = 0.5;
const ANY_FRACTION = 0.565;
const APPLE_FRACTION = 0.55;
/** Glyph bbox max side, as a fraction of the startup image's shorter side. */
const STARTUP_FRACTION = 0.24;

/**
 * Portrait startup sizes from `@vite-pwa/assets-generator`
 * `appleSplashScreenSizes`, which cites Apple's HIG device screen
 * dimensions. One row per distinct (css width, css height, pixel ratio).
 * Pixel size is css × ratio. Display Zoom and landscape are not included.
 *
 * https://github.com/vite-pwa/assets-generator/blob/main/src/splash.ts
 *
 * iPhone Duo is not in that list or in the HIG device tables, so it is
 * not here. The M4 iPad Pro point sizes (1032×1376 and 834×1210) are
 * not in that list either; the HIG live-activity table still lists
 * 1366×1024 and 1194×834.
 */
const STARTUP_DEVICES = [
  {
    label: 'iPhone 16 Pro Max, 17 Pro Max',
    cssWidth: 440,
    cssHeight: 956,
    ratio: 3,
  },
  {
    label: 'iPhone 16 Pro, 17, 17 Pro',
    cssWidth: 402,
    cssHeight: 874,
    ratio: 3,
  },
  { label: 'iPhone Air', cssWidth: 420, cssHeight: 912, ratio: 3 },
  {
    label: 'iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus',
    cssWidth: 430,
    cssHeight: 932,
    ratio: 3,
  },
  {
    label: 'iPhone 14 Pro, 15, 15 Pro, 16',
    cssWidth: 393,
    cssHeight: 852,
    ratio: 3,
  },
  {
    label: 'iPhone 12 Pro Max, 13 Pro Max, 14 Plus',
    cssWidth: 428,
    cssHeight: 926,
    ratio: 3,
  },
  {
    label: 'iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e',
    cssWidth: 390,
    cssHeight: 844,
    ratio: 3,
  },
  {
    label: 'iPhone 11 Pro, 12 mini, 13 mini',
    cssWidth: 375,
    cssHeight: 812,
    ratio: 3,
  },
  {
    label: 'iPhone 11 Pro Max, XS Max',
    cssWidth: 414,
    cssHeight: 896,
    ratio: 3,
  },
  { label: 'iPhone 11, XR', cssWidth: 414, cssHeight: 896, ratio: 2 },
  { label: 'iPhone SE 4.7-inch', cssWidth: 375, cssHeight: 667, ratio: 2 },
  {
    label: 'iPad Pro 12.9-inch, iPad Air 13-inch',
    cssWidth: 1024,
    cssHeight: 1366,
    ratio: 2,
  },
  { label: 'iPad Pro 11-inch', cssWidth: 834, cssHeight: 1194, ratio: 2 },
  {
    label: 'iPad Air 11-inch, iPad Air 10.9-inch, iPad 11-inch',
    cssWidth: 820,
    cssHeight: 1180,
    ratio: 2,
  },
  { label: 'iPad mini 8.3-inch', cssWidth: 744, cssHeight: 1133, ratio: 2 },
];

function glyphFromSvg(svg) {
  const view = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  if (!view || view[1] !== view[2]) {
    throw new Error('icon source needs a square viewBox');
  }
  const path = svg.match(/<path\b[^>]*\bd="([^"]+)"/);
  if (!path) throw new Error('icon source is missing a path');
  return { view: Number(view[1]), d: path[1] };
}

function measureGlyph(data, width, height, channels) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < GLYPH_MIN || (r < GLYPH_MIN && g < GLYPH_MIN && b < GLYPH_MIN)) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('glyph has no ink');
  return {
    minX,
    minY,
    maxX,
    maxY,
    bw: maxX - minX + 1,
    bh: maxY - minY + 1,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

async function rasterSvg(svg) {
  const png = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toBuffer();
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { png, data, info };
}

async function probeGlyph(d, view) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PROBE}" height="${PROBE}" viewBox="0 0 ${view} ${view}"><path fill="#ffffff" d="${d}"/></svg>`;
  const { info, data } = await rasterSvg(svg);
  if (info.width !== PROBE || info.height !== PROBE) {
    throw new Error(`probe raster is ${info.width}x${info.height}`);
  }
  const box = measureGlyph(data, info.width, info.height, info.channels);
  const k = view / PROBE;
  return {
    bw: box.bw * k,
    bh: box.bh * k,
    cx: box.cx * k,
    cy: box.cy * k,
  };
}

function iconSvg(width, height, d, scale, nudgeX, nudgeY, cx, cy) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#000000"/><g transform="translate(${width / 2 + nudgeX} ${height / 2 + nudgeY}) scale(${scale}) translate(${-cx} ${-cy})"><path fill="#ffffff" d="${d}"/></g></svg>`;
}

async function renderTuned(width, height, fraction, basis, glyph, d) {
  let scale = (basis * fraction) / Math.max(glyph.bw, glyph.bh);
  let nudgeX = 0;
  let nudgeY = 0;
  let png;
  for (let pass = 0; pass < 3; pass += 1) {
    const raster = await rasterSvg(
      iconSvg(width, height, d, scale, nudgeX, nudgeY, glyph.cx, glyph.cy)
    );
    if (raster.info.width !== width || raster.info.height !== height) {
      throw new Error(
        `raster ${raster.info.width}x${raster.info.height} !== ${width}x${height}`
      );
    }
    png = raster.png;
    const box = measureGlyph(
      raster.data,
      raster.info.width,
      raster.info.height,
      raster.info.channels
    );
    const got = Math.max(box.bw, box.bh) / basis;
    const offX = box.cx - (width - 1) / 2;
    const offY = box.cy - (height - 1) / 2;
    const scaleError = Math.abs(got - fraction);
    const centerError = Math.max(Math.abs(offX), Math.abs(offY));
    if (scaleError <= 0.004 && centerError <= 0.6) break;
    if (scaleError > 0.004) scale *= fraction / got;
    if (centerError > 0.6) {
      nudgeX -= offX;
      nudgeY -= offY;
    }
  }
  return png;
}

function startupMedia(device) {
  return `screen and (device-width: ${device.cssWidth}px) and (device-height: ${device.cssHeight}px) and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: portrait)`;
}

function writeStartupModule(devices) {
  const entries = devices
    .map((device) => {
      const width = device.cssWidth * device.ratio;
      const height = device.cssHeight * device.ratio;
      return `  // ${device.label}\n  {\n    url: '/apple-splash/${width}x${height}.png',\n    media:\n      '${startupMedia(device)}',\n  },`;
    })
    .join('\n');
  const source = `/** Portrait apple-touch-startup images. Generated by scripts/gen-icons.mjs. */\nexport const appleStartupImages = [\n${entries}\n] as const;\n`;
  writeFileSync(join(appRoot, 'src/lib/apple-startup-images.ts'), source);
}

async function main() {
  const { view, d } = glyphFromSvg(readFileSync(sourceSvg, 'utf8'));
  const glyph = await probeGlyph(d, view);
  const icons = [
    ['onsocial_icon_maskable_192.png', 192, MASKABLE_FRACTION],
    ['onsocial_icon_maskable_512.png', 512, MASKABLE_FRACTION],
    ['onsocial_icon_192.png', 192, ANY_FRACTION],
    ['onsocial_icon_512.png', 512, ANY_FRACTION],
    ['apple-touch-icon.png', 180, APPLE_FRACTION],
  ];
  for (const [name, size, fraction] of icons) {
    const png = await renderTuned(size, size, fraction, size, glyph, d);
    writeFileSync(join(publicDir, name), png);
    console.log(name, size, fraction);
  }

  const splashDir = join(publicDir, 'apple-splash');
  mkdirSync(splashDir, { recursive: true });
  for (const device of STARTUP_DEVICES) {
    const width = device.cssWidth * device.ratio;
    const height = device.cssHeight * device.ratio;
    const png = await renderTuned(
      width,
      height,
      STARTUP_FRACTION,
      Math.min(width, height),
      glyph,
      d
    );
    const name = `${width}x${height}.png`;
    writeFileSync(join(splashDir, name), png);
    console.log(name, device.label);
  }
  writeStartupModule(STARTUP_DEVICES);
  console.log('wrote apple-startup-images.ts');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
