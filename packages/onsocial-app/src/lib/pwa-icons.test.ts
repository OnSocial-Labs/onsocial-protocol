import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { appleStartupImages } from '@/lib/apple-startup-images';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = join(appRoot, 'public');

/** Same ink threshold as scripts/gen-icons.mjs. */
const GLYPH_MIN = 32;

type GlyphBox = {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  bw: number;
  bh: number;
  cx: number;
  cy: number;
  maxR: number;
  transparent: number;
  corner: { r: number; g: number; b: number; a: number };
};

async function measureIcon(file: string): Promise<GlyphBox> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let transparent = 0;
  let maxR = 0;
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 0;
      if (a < 255) transparent += 1;
      if (a < GLYPH_MIN || (r < GLYPH_MIN && g < GLYPH_MIN && b < GLYPH_MIN)) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const dist = Math.hypot(x - centerX, y - centerY);
      if (dist > maxR) maxR = dist;
    }
  }
  return {
    width,
    height,
    minX,
    minY,
    maxX,
    maxY,
    bw: maxX - minX + 1,
    bh: maxY - minY + 1,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    maxR,
    transparent,
    corner: {
      r: data[0] ?? 0,
      g: data[1] ?? 0,
      b: data[2] ?? 0,
      a: data[3] ?? 0,
    },
  };
}

function expectCentred(box: GlyphBox) {
  expect(Math.abs(box.cx - (box.width - 1) / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.cy - (box.height - 1) / 2)).toBeLessThanOrEqual(1);
}

function expectOpaqueBlack(box: GlyphBox) {
  expect(box.transparent).toBe(0);
  expect(box.corner).toEqual({ r: 0, g: 0, b: 0, a: 255 });
}

function paddingFraction(box: GlyphBox) {
  const padX = Math.min(box.minX, box.width - 1 - box.maxX) / box.width;
  const padY = Math.min(box.minY, box.height - 1 - box.maxY) / box.height;
  return Math.min(padX, padY);
}

describe('installed app icons', () => {
  it('centres a maskable glyph inside the safe zone', async () => {
    for (const name of [
      'onsocial_icon_maskable_192.png',
      'onsocial_icon_maskable_512.png',
    ]) {
      const box = await measureIcon(join(publicDir, name));
      expect(box.width).toBe(box.height);
      const fraction = Math.max(box.bw, box.bh) / box.width;
      expect(fraction).toBeGreaterThanOrEqual(0.49);
      expect(fraction).toBeLessThanOrEqual(0.51);
      expect(paddingFraction(box)).toBeGreaterThanOrEqual(0.22);
      expectCentred(box);
      expectOpaqueBlack(box);
      expect(box.maxR).toBeLessThanOrEqual(box.width * 0.4);
    }
  });

  it('keeps any icons full-bleed with a mid-size glyph', async () => {
    for (const [name, size] of [
      ['onsocial_icon_192.png', 192],
      ['onsocial_icon_512.png', 512],
    ] as const) {
      const box = await measureIcon(join(publicDir, name));
      expect(box.width).toBe(size);
      expect(box.height).toBe(size);
      const fraction = Math.max(box.bw, box.bh) / size;
      expect(fraction).toBeGreaterThanOrEqual(0.55);
      expect(fraction).toBeLessThanOrEqual(0.58);
      expect(paddingFraction(box)).toBeGreaterThanOrEqual(0.2);
      expectCentred(box);
      expectOpaqueBlack(box);
      expect(box.maxR).toBeLessThan(size * 0.5);
    }
  });

  it('paints the Apple touch icon full-bleed without a baked corner', async () => {
    const box = await measureIcon(join(publicDir, 'apple-touch-icon.png'));
    expect(box.width).toBe(180);
    expect(box.height).toBe(180);
    const fraction = Math.max(box.bw, box.bh) / 180;
    expect(fraction).toBeGreaterThanOrEqual(0.54);
    expect(fraction).toBeLessThanOrEqual(0.56);
    expect(paddingFraction(box)).toBeGreaterThanOrEqual(0.2);
    expectCentred(box);
    expectOpaqueBlack(box);
  });

  it('matches manifest theme_color to the black splash', () => {
    const source = readFileSync(join(appRoot, 'src/app/manifest.ts'), 'utf8');
    expect(source).toContain("background_color: '#000000'");
    expect(source).toContain("theme_color: '#000000'");
    expect(source).toContain("src: '/onsocial_icon_maskable_192.png'");
    expect(source).not.toContain('#0c0d10');
  });
});

describe('iOS startup images', () => {
  it('centres a black launch mark for each portrait size', async () => {
    const layout = readFileSync(join(appRoot, 'src/app/layout.tsx'), 'utf8');
    expect(layout).toContain('startupImage: [...appleStartupImages]');
    expect(appleStartupImages.length).toBeGreaterThan(0);

    for (const image of appleStartupImages) {
      const match = image.url.match(/\/apple-splash\/(\d+)x(\d+)\.png$/);
      expect(match).not.toBeNull();
      const width = Number(match?.[1]);
      const height = Number(match?.[2]);
      expect(image.media).toMatch(
        /^screen and \(device-width: \d+px\) and \(device-height: \d+px\) and \(-webkit-device-pixel-ratio: \d+\) and \(orientation: portrait\)$/
      );
      const box = await measureIcon(
        join(publicDir, image.url.replace(/^\//, ''))
      );
      expect(box.width).toBe(width);
      expect(box.height).toBe(height);
      const cssWidth = Number(image.media.match(/device-width: (\d+)px/)?.[1]);
      const cssHeight = Number(
        image.media.match(/device-height: (\d+)px/)?.[1]
      );
      const ratio = Number(image.media.match(/pixel-ratio: (\d+)/)?.[1]);
      expect(width).toBe(cssWidth * ratio);
      expect(height).toBe(cssHeight * ratio);
      const fraction = Math.max(box.bw, box.bh) / Math.min(width, height);
      expect(fraction).toBeGreaterThanOrEqual(0.23);
      expect(fraction).toBeLessThanOrEqual(0.25);
      expectCentred(box);
      expectOpaqueBlack(box);
    }
  });
});
