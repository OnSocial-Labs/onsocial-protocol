import { describe, expect, it } from 'vitest';
import { generateTextCardSvg } from '@onsocial/text-card';
import { rasterizeTextCard } from '../../../src/services/compose/card-raster.js';

describe('rasterizeTextCard', () => {
  it('creates a 1200px PNG using the bundled card font set', () => {
    const png = rasterizeTextCard(
      generateTextCardSvg({
        title: 'A permanent thought.',
        format: 'thought',
        creator: { accountId: 'alice.near', displayName: 'Alice' },
        theme: { bg: 'poster-noir' },
      })
    );

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(png.readUInt32BE(16)).toBe(1200);
  });

  it('embeds title glyphs (woff must load via fontBuffers)', () => {
    const withTitle = rasterizeTextCard(
      generateTextCardSvg({
        title: 'I voted!',
        format: 'thought',
        creator: { accountId: 'alice.near', displayName: 'Alice' },
        theme: {
          bg: 'thought-night',
          markShape: 'square',
          markColor: 'tangerine',
        },
      })
    );
    const withoutTitle = rasterizeTextCard(
      generateTextCardSvg({
        title: '',
        format: 'thought',
        creator: { accountId: 'alice.near', displayName: 'Alice' },
        theme: {
          bg: 'thought-night',
          markShape: 'square',
          markColor: 'tangerine',
        },
      })
    );

    // Blank-title and titled cards must not compress to the same PNG.
    // When Resvg fails to load woffs, both lack glyphs and stay near-identical.
    expect(withTitle.equals(withoutTitle)).toBe(false);
    expect(Math.abs(withTitle.length - withoutTitle.length)).toBeGreaterThan(
      500
    );
  });
});
