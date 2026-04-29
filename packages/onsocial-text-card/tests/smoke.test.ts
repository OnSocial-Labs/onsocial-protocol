// Smoke tests for the text-card mood catalog.
// These are intentionally lightweight — the goal is to catch regressions
// in the public surface (mood keys, types, exports) on every CI run.
import { describe, it, expect } from 'vitest';
import {
  MOODS,
  VOICES,
  PALETTES,
  DEFAULT_MOOD,
  isMoodKey,
  splitMoodKey,
  composeMoodKey,
  resolveMood,
  resolveTheme,
  THEME_MANIFEST,
  generateTextCardSvg,
} from '../src/index.js';

describe('themes catalog', () => {
  it('contains 6 voices and 4 palettes', () => {
    expect(VOICES).toHaveLength(6);
    expect(PALETTES).toHaveLength(4);
  });

  it('generates 25 moods (6×4 grid + mono-matrix bonus)', () => {
    const keys = Object.keys(MOODS);
    expect(keys).toHaveLength(25);
    expect(keys).toContain('mono-matrix');
    for (const v of VOICES) {
      for (const p of PALETTES) {
        expect(keys).toContain(`${v}-${p}`);
      }
    }
  });

  it('default mood is serif-night and resolvable', () => {
    expect(DEFAULT_MOOD).toBe('serif-night');
    expect(MOODS[DEFAULT_MOOD]).toBeDefined();
    expect(resolveMood({ bg: 'unknown' })).toBe('serif-night');
    expect(resolveMood({ bg: 'display-noir' })).toBe('display-noir');
  });

  it('isMoodKey accepts every catalog key and rejects unknowns', () => {
    for (const k of Object.keys(MOODS)) expect(isMoodKey(k)).toBe(true);
    expect(isMoodKey('ink')).toBe(false);
    expect(isMoodKey('paper')).toBe(false);
    expect(isMoodKey(undefined)).toBe(false);
    expect(isMoodKey(42)).toBe(false);
  });

  it('split/compose round-trips for standard moods', () => {
    for (const v of VOICES) {
      for (const p of PALETTES) {
        const k = composeMoodKey(v, p);
        const parts = splitMoodKey(k);
        expect(parts).toEqual({ voice: v, palette: p });
      }
    }
    expect(splitMoodKey('mono-matrix')).toBeNull();
  });

  it('friendly labels are present on iconic moods', () => {
    expect(MOODS['serif-light'].label).toBe('Paper');
    expect(MOODS['serif-night'].label).toBe('Ink');
    expect(MOODS['bold-noir'].label).toBe('Bold');
    expect(MOODS['mono-noir'].label).toBe('Terminal');
    expect(MOODS['mono-matrix'].label).toBe('Matrix');
    expect(MOODS['receipt-light'].label).toBe('Receipt');
    // Non-iconic falls back to "Voice — Palette".
    expect(MOODS['display-noir'].label).toBe('Display — Noir');
  });

  it('THEME_MANIFEST exposes voices, palettes, and moods', () => {
    expect(THEME_MANIFEST.voices).toHaveLength(6);
    expect(THEME_MANIFEST.palettes).toHaveLength(4);
    expect(THEME_MANIFEST.moods).toHaveLength(25);
  });

  it('resolveTheme returns the default mood + quote font shim', () => {
    const t = resolveTheme();
    expect(t.bg).toBe('serif-night');
    expect(t.font).toBe('quote');
  });
});

describe('generator smoke', () => {
  const creator = { accountId: 'alice.near', displayName: 'Alice' };

  it('renders a valid SVG for every mood', () => {
    for (const k of Object.keys(MOODS)) {
      const svg = generateTextCardSvg({
        title: 'Smoke check.',
        creator,
        theme: { bg: k },
      });
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    }
  });

  it('honours photo only on receipt moods', () => {
    const photo = 'https://cdn.onsocial.id/ipfs/bafySmoke';
    const receipt = generateTextCardSvg({
      title: 'Shipped.',
      creator,
      theme: { bg: 'receipt-light' },
      photo,
    });
    expect(receipt).toContain('<image');
    expect(receipt).toContain(photo);

    const nonReceipt = generateTextCardSvg({
      title: 'Just words.',
      creator,
      theme: { bg: 'serif-night' },
      photo,
    });
    expect(nonReceipt).not.toContain('<image');
  });
});
