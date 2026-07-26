import { describe, expect, it } from 'vitest';
import { buildTextCardPng } from '../../../src/services/compose/text-card-png.js';

describe('buildTextCardPng', () => {
  it('returns a 1200px PNG with title glyphs', async () => {
    const withTitle = await buildTextCardPng('alice.testnet', {
      title: 'I voted!',
      creator: { accountId: 'alice.testnet', displayName: 'Alice' },
      cardFormat: 'thought',
      cardPalette: 'night',
      cardMarkShape: 'square',
      cardMarkColor: 'tangerine',
    });
    const withoutTitle = await buildTextCardPng('alice.testnet', {
      title: '',
      creator: { accountId: 'alice.testnet', displayName: 'Alice' },
      cardFormat: 'thought',
      cardPalette: 'night',
      cardMarkShape: 'square',
      cardMarkColor: 'tangerine',
    });

    expect(withTitle.png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(withTitle.png.readUInt32BE(16)).toBe(1200);
    expect(withTitle.themeExtra.bg).toBe('thought-night');
    expect(withTitle.png.equals(withoutTitle.png)).toBe(false);
    expect(
      Math.abs(withTitle.png.length - withoutTitle.png.length)
    ).toBeGreaterThan(500);
  });
});
