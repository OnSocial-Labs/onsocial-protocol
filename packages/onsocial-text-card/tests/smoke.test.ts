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
  canonicalizeMoodKey,
  THEME_MANIFEST,
  generateTextCardSvg,
  formatProvenanceLine,
  shortProvenancePostId,
  CARD_FORMATS,
  CARD_FORMAT_REGISTRY,
  isCardFormat,
  moodForCardFormat,
} from '../src/index.js';

describe('themes catalog', () => {
  it('defines locked, format-specific card rules', () => {
    expect(CARD_FORMATS).toEqual([
      'thought',
      'poster',
      'letter',
      'journal',
      'mono',
      'receipt',
      'proof',
    ]);
    expect(CARD_FORMAT_REGISTRY.poster.maxCharacters).toBe(96);
    expect(CARD_FORMAT_REGISTRY.poster.maxLines).toBe(5);
    expect(CARD_FORMAT_REGISTRY.thought.maxCharacters).toBe(108);
    expect(CARD_FORMAT_REGISTRY.letter.maxCharacters).toBe(120);
    expect(CARD_FORMAT_REGISTRY.letter.maxLines).toBe(7);
    expect(CARD_FORMAT_REGISTRY.mono.maxCharacters).toBe(100);
    expect(CARD_FORMAT_REGISTRY.poster.voice).toBe('poster');
    expect(CARD_FORMAT_REGISTRY.letter.voice).toBe('letter');
    expect(CARD_FORMAT_REGISTRY.journal.voice).toBe('journal');
    expect(CARD_FORMAT_REGISTRY.mono.voice).toBe('mono');
    expect(CARD_FORMAT_REGISTRY.receipt.requiresPhoto).toBe(true);
    expect(CARD_FORMAT_REGISTRY.proof.requiresPhoto).toBe(true);
    expect(isCardFormat('thought')).toBe(true);
    expect(isCardFormat('freeform')).toBe(false);
    expect(moodForCardFormat('poster', 'noir')).toBe('poster-noir');
    expect(moodForCardFormat('thought', 'night')).toBe('thought-night');
    expect(moodForCardFormat('letter', 'light')).toBe('letter-light');
    expect(moodForCardFormat('journal', 'light')).toBe('journal-light');
  });

  it('renders Poster as ALL CAPS at standard size with room for a statement', () => {
    const title = 'Build permanence into every scarce cover on chain.';
    expect(title.length).toBeLessThanOrEqual(96);
    const svg = generateTextCardSvg({
      title,
      format: 'poster',
      theme: { bg: 'poster-noir' },
    });
    expect(svg).toContain('font-size="44"');
    expect(svg).toContain('fill-opacity="1"');
    expect(svg).toMatch(/BUILD/);
    expect(svg).toMatch(/PERMANENCE/);
    expect(svg).not.toContain('Build permanence');
  });

  it('keeps mark→title air constant and cap-height-aligns the title pad', () => {
    // Cap ratio 0.7 × 44 → baseline sits at round(visualTop + 30.8).
    const noMark = generateTextCardSvg({
      title: 'Hi',
      format: 'thought',
      theme: { bg: 'thought-night' },
    });
    // Pad 64 → caps on 64 → baseline 95.
    expect(noMark).toMatch(/<text[^>]*y="95"[^>]*font-size="44"/);

    const rule = generateTextCardSvg({
      title: 'Hi',
      creator: { accountId: 'a.near' },
      format: 'thought',
      theme: { bg: 'thought-night', markShape: 'rule' },
    });
    const bar = generateTextCardSvg({
      title: 'Hi',
      creator: { accountId: 'a.near' },
      format: 'thought',
      theme: { bg: 'thought-night', markShape: 'bar' },
    });
    const ruleY = Number(
      rule.match(/<text[^>]*y="(\d+)"[^>]*font-size="44"/)?.[1]
    );
    const barY = Number(
      bar.match(/<text[^>]*y="(\d+)"[^>]*font-size="44"/)?.[1]
    );
    // Mark heights: rule 3, bar 24 → title drops by exactly 21.
    expect(ruleY).toBe(126);
    expect(barY).toBe(147);
    expect(barY - ruleY).toBe(21);
  });

  it('contains 6 voices and 11 palettes', () => {
    expect(VOICES).toEqual([
      'thought',
      'poster',
      'letter',
      'journal',
      'mono',
      'receipt',
    ]);
    expect(PALETTES).toHaveLength(11);
  });

  it('generates 67 moods (6×11 grid + mono-matrix bonus)', () => {
    const keys = Object.keys(MOODS);
    expect(keys).toHaveLength(67);
    expect(keys).toContain('mono-matrix');
    for (const v of VOICES) {
      for (const p of PALETTES) {
        expect(keys).toContain(`${v}-${p}`);
      }
    }
  });

  it('default mood is thought-night and resolvable', () => {
    expect(DEFAULT_MOOD).toBe('thought-night');
    expect(MOODS[DEFAULT_MOOD]).toBeDefined();
    expect(resolveMood({ bg: 'unknown' })).toBe('thought-night');
    expect(resolveMood({ bg: 'poster-noir' })).toBe('poster-noir');
  });

  it('accepts legacy mood aliases and maps them to canonical keys', () => {
    expect(canonicalizeMoodKey('bold-night')).toBe('thought-night');
    expect(canonicalizeMoodKey('display-noir')).toBe('poster-noir');
    expect(canonicalizeMoodKey('serif-light')).toBe('journal-light');
    expect(isMoodKey('bold-night')).toBe(true);
    expect(resolveMood({ bg: 'bold-night' })).toBe('thought-night');
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

  it('friendly labels and fonts match the agreed curated system', () => {
    expect(MOODS['thought-night'].label).toBe('Thought');
    expect(MOODS['thought-night'].titleUppercase).toBe(false);
    expect(MOODS['thought-night'].titleFamily).toContain('DM Sans');
    expect(MOODS['poster-noir'].titleUppercase).toBe(true);
    expect(MOODS['poster-noir'].titleFamily).toContain('Space Grotesk');
    expect(MOODS['letter-light'].label).toBe('Letter');
    expect(MOODS['letter-light'].titleFamily).toContain('Erica Type');
    expect(MOODS['journal-light'].label).toBe('Journal');
    expect(MOODS['journal-light'].titleFamily).toContain('Newsreader');
    expect(MOODS['mono-noir'].label).toBe('Terminal');
    expect(MOODS['mono-matrix'].label).toBe('Matrix');
    expect(MOODS['receipt-light'].label).toBe('Receipt');
  });

  it('every finish is solid (no gradient banding in mint PNGs)', () => {
    for (const mood of Object.values(MOODS)) {
      expect(mood.bgFrom).toBe(mood.bgTo);
    }
    expect(MOODS['thought-white'].bgFrom).toBe('#FFFFFF');
    expect(MOODS['thought-black'].bgFrom).toBe('#000000');
    const svg = generateTextCardSvg({
      title: 'Solid white',
      theme: { bg: 'thought-white' },
    });
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).not.toContain('<linearGradient');
  });

  it('THEME_MANIFEST exposes voices, palettes, and moods', () => {
    expect(THEME_MANIFEST.voices).toHaveLength(6);
    expect(THEME_MANIFEST.palettes).toHaveLength(11);
    expect(THEME_MANIFEST.moods).toHaveLength(67);
  });

  it('resolveTheme returns the default mood + quote font shim', () => {
    const t = resolveTheme();
    expect(t.bg).toBe('thought-night');
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
      theme: { bg: 'thought-night' },
      photo,
    });
    expect(nonReceipt).not.toContain('<image');
  });

  it('renders the proof format as a photo-led locked layout', () => {
    const photo = 'https://cdn.onsocial.id/ipfs/bafyProof';
    const svg = generateTextCardSvg({
      title: 'A verifiable milestone.',
      creator,
      format: 'proof',
      theme: { bg: 'mono-noir' },
      photo,
    });
    expect(svg).toContain('<image');
    expect(svg).toContain(photo);
  });

  it('soft-breaks long account tokens instead of overflowing the column', () => {
    const svg = generateTextCardSvg({
      title: '@test03.onsocial.testnet collects $SOCIAL',
      format: 'letter',
      theme: { bg: 'letter-light' },
    });
    // Long NEAR id should soft-break on '.' rather than one runaway tspan.
    const tspans = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(
      (m) => m[1]
    );
    expect(tspans.length).toBeGreaterThan(1);
    expect(tspans.some((t) => t.includes('onsocial'))).toBe(true);
    // No single line should still hold the full unsplit token.
    expect(tspans.some((t) => t.includes('@test03.onsocial.testnet'))).toBe(
      false
    );
  });

  it('fits a longer mono note by stepping down the size, not truncating', () => {
    const title =
      'const proof = await mint({ postId, claim: "shipped on near" });';
    const svg = generateTextCardSvg({
      title,
      format: 'mono',
      theme: { bg: 'mono-noir' },
    });
    const size = Number(
      svg.match(/<text[^>]*font-size="(\d+)"[^>]*>/)?.[1] ?? '0'
    );
    expect(size).toBeGreaterThanOrEqual(28);
    expect(size).toBeLessThanOrEqual(44);
    // Long note should not be ellipsis-truncated at the fitted size.
    expect(svg).not.toContain('\u2026');
  });

  it('keeps the full unique account id in the byline', () => {
    const longId = 'test05.onsocial.testnet';
    const withName = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: longId, displayName: 'Test' },
      theme: { bg: 'thought-night' },
    });
    expect(withName).toContain(longId);
    expect(withName).toContain('Test');
    expect(withName).not.toContain(`@${longId}`);
    expect(withName).not.toMatch(/test05\.onsocial\.testne…/);

    const solo = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: longId },
      theme: { bg: 'thought-night' },
    });
    expect(solo).toContain(longId);
    expect(solo).not.toContain(`@${longId}`);
    expect(solo).not.toContain('test05.onsocial ·');
  });

  it('renders the plain account id in the byline (no @ or ~)', () => {
    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'thought-night' },
    });
    expect(svg).toContain('alice.near');
    expect(svg).not.toContain('@alice.near');
    expect(svg).not.toContain('~alice.near');
    expect(svg).not.toContain('~/alice.near');
  });

  it('always stacks name above signed id', () => {
    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'thought-night' },
    });
    expect(svg).toContain('Alice');
    expect(svg).toContain('alice.near');
    const textOpens = svg.match(/<text /g) ?? [];
    expect(textOpens.length).toBeGreaterThanOrEqual(3);
    expect(svg).toMatch(
      /<text x="64"[^>]*>Alice<\/text>\s*<text x="64"[^>]*>alice\.near<\/text>/
    );
  });

  it('renders a circular avatar beside the signature when provided', () => {
    const avatar =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: {
        accountId: 'alice.near',
        displayName: 'Alice',
        avatar,
      },
      theme: { bg: 'thought-night' },
    });
    expect(svg).toContain('clipPath id="avatarClip"');
    expect(svg).toContain(avatar);
    expect(svg).toContain('Alice');
    expect(svg).toContain('alice.near');
    // Text shifts right of the 36px face + gap (pad 64 → x=112).
    expect(svg).toMatch(
      /<text x="112"[^>]*>Alice<\/text>\s*<text x="112"[^>]*>alice\.near<\/text>/
    );
  });

  it('uses DM Sans for the signature byline (app chrome parity)', () => {
    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'thought-night' },
    });
    expect(svg).toContain('DM Sans');
    expect(MOODS['thought-night'].bylineFamily).toContain('DM Sans');
  });

  it('renders provenance with brand, when, and short post id', () => {
    expect(shortProvenancePostId('abc')).toBe('abc');
    expect(shortProvenancePostId('verylongpostidentifier99')).toBe('very…er99');
    expect(
      formatProvenanceLine({
        issuedAt: Date.UTC(2026, 6, 18, 21, 14),
        postId: 'p7',
      })
    ).toBe('OnSocial · 18 Jul 26 · 21:14 · p7');

    const svg = generateTextCardSvg({
      title: 'Hello.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'thought-night' },
      provenance: {
        issuedAt: Date.UTC(2026, 6, 18, 21, 14),
        postId: 'post42',
      },
    });
    expect(svg).toContain('OnSocial · 18 Jul 26 · 21:14 · post42');
  });
});
