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
  formatProvenanceLine,
  shortProvenancePostId,
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

  it('keeps the full unique account id in the byline', () => {
    const longId = 'test05.onsocial.testnet';
    const withName = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: longId, displayName: 'Test' },
      theme: { bg: 'serif-night' },
    });
    expect(withName).toContain(longId);
    expect(withName).toContain('Test');
    expect(withName).not.toContain(`@${longId}`);
    // Must not ellipsis-truncate the unique id.
    expect(withName).not.toMatch(/test05\.onsocial\.testne…/);

    const solo = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: longId },
      theme: { bg: 'serif-night' },
    });
    expect(solo).toContain(longId);
    expect(solo).not.toContain(`@${longId}`);
    // No distinct name → single signature, not a duplicated bare id.
    expect(solo).not.toContain('test05.onsocial ·');
  });

  it('prefixes id with ~ not @', () => {
    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'serif-night' },
    });
    expect(svg).toContain('~alice.near');
    expect(svg).not.toContain('@alice.near');
    expect(svg).not.toContain('~/alice.near');
  });

  it('always stacks name above signed id', () => {
    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'serif-night' },
    });
    expect(svg).toContain('Alice');
    expect(svg).toContain('~alice.near');
    // Two separate text nodes — name then handle.
    const textOpens = svg.match(/<text /g) ?? [];
    expect(textOpens.length).toBeGreaterThanOrEqual(3); // title + name + handle
  });

  it('uses DM Sans for the signature byline (app chrome parity)', () => {
    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'serif-night' },
    });
    expect(svg).toContain('DM Sans');
    expect(MOODS['serif-night'].bylineFamily).toContain('DM Sans');
  });

  it('renders provenance with brand, when, and short post id', () => {
    expect(shortProvenancePostId('abc')).toBe('abc');
    expect(shortProvenancePostId('verylongpostidentifier99')).toBe(
      'very…er99'
    );
    expect(
      formatProvenanceLine({
        issuedAt: Date.UTC(2026, 6, 18, 21, 14),
        postId: 'p7',
      })
    ).toBe('OnSocial · 18 Jul 26 · 21:14 · p7');

    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'serif-night' },
      provenance: {
        issuedAt: Date.UTC(2026, 6, 18, 21, 14),
        postId: 'post42',
      },
    });
    expect(svg).toContain('OnSocial · 18 Jul 26 · 21:14 · post42');
  });
});
