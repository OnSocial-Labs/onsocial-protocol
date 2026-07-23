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
});
