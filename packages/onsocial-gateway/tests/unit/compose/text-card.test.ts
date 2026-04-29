import { describe, it, expect } from 'vitest';
import { generateTextCardSvg } from '../../../src/services/compose/text-card.js';
import { measureTitleFit } from '@onsocial/text-card';

describe('generateTextCardSvg', () => {
  it('produces a valid SVG document with the title text', () => {
    const svg = generateTextCardSvg({ title: 'Hello World' });
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Hello World');
  });

  it('contains no platform branding chrome', () => {
    const svg = generateTextCardSvg({ title: 'Hello World' });
    expect(svg).not.toContain('OnSocial');
    expect(svg).not.toContain('SCARCE');
    expect(svg).not.toContain('powered by');
  });

  it('does NOT render description on the card (v0.2 design)', () => {
    // Description stays in NFT metadata for wallets that surface it,
    // but is deliberately omitted from the visible card so the title
    // (the thought) stands alone.
    const svg = generateTextCardSvg({
      title: 'Title',
      description: 'A helpful description',
    });
    expect(svg).not.toContain('A helpful description');
  });

  it('escapes XML-unsafe characters in title', () => {
    const svg = generateTextCardSvg({
      title: '<script>alert("x")</script>',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&quot;x&quot;');
  });

  it('wraps long titles into multiple lines', () => {
    const longTitle = 'word '.repeat(40).trim();
    const svg = generateTextCardSvg({ title: longTitle });
    const tspans = svg.match(/<tspan/g) ?? [];
    expect(tspans.length).toBeGreaterThan(1);
  });

  it('truncates with an ellipsis when text exceeds the line budget', () => {
    const huge = 'lorem ipsum dolor sit amet '.repeat(50).trim();
    const svg = generateTextCardSvg({ title: huge });
    expect(svg).toContain('…');
  });

  it('handles single oversized words by hard-breaking them', () => {
    const svg = generateTextCardSvg({
      title: 'a'.repeat(120),
    });
    const tspans = svg.match(/<tspan/g) ?? [];
    expect(tspans.length).toBeGreaterThan(1);
  });

  it('renders author byline when creator is provided (name + handle, no avatar)', () => {
    const svg = generateTextCardSvg({
      title: 'My thought',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
    });
    // v0.4: single-line byline "Name · @handle".
    expect(svg).toContain('>Alice<');
    expect(svg).toContain('@alice.near');
    expect(svg).toContain(' · ');
    // v0.3 has NO avatar — the only decoration is the small coloured
    // mark at the top-left (a thin rule, height=3).
    expect(svg).not.toMatch(/<rect [^>]*rx="8"/);
    expect(svg).toMatch(/<rect [^>]*width="36"[^>]*height="3"/);
  });

  it('falls back to accountId (without TLD) when displayName is omitted', () => {
    const svg = generateTextCardSvg({
      title: 'A thought',
      creator: { accountId: 'bob.testnet' },
    });
    expect(svg).toContain('@bob.testnet');
    expect(svg).toMatch(/>bob</);
  });

  it('escapes XML-unsafe characters in displayName and accountId', () => {
    const svg = generateTextCardSvg({
      title: 'x',
      creator: {
        accountId: 'a&b.near',
        displayName: '<Hacker>',
      },
    });
    expect(svg).not.toContain('<Hacker>');
    expect(svg).toContain('&lt;Hacker&gt;');
    expect(svg).toContain('@a&amp;b.near');
  });

  it('omits author byline AND mark when no creator is provided', () => {
    const svg = generateTextCardSvg({ title: 'No author' });
    expect(svg).not.toContain('@');
    // No top-left mark either when there's no author.
    expect(svg).not.toMatch(/<rect [^>]*width="36"[^>]*height="3"/);
  });

  it('produces a stable mark colour for the same accountId', () => {
    const a = generateTextCardSvg({
      title: 'x',
      creator: { accountId: 'alice.near' },
    });
    const b = generateTextCardSvg({
      title: 'y',
      creator: { accountId: 'alice.near' },
    });
    const re =
      /<rect [^>]*width="36"[^>]*height="3"[^>]*fill="(#[0-9A-F]{6})"/i;
    const colorA = a.match(re)?.[1];
    const colorB = b.match(re)?.[1];
    expect(colorA).toBeTruthy();
    expect(colorA).toBe(colorB);
  });

  it('shrinks the byline name font for long names instead of truncating', () => {
    // 45 chars — too wide at 20px (~44 char budget), fits at 18px.
    const longName = 'Alexander Bartholomew Cunningham III Junior!!';
    expect(longName.length).toBe(45);
    const svg = generateTextCardSvg({
      title: 't',
      creator: { accountId: 'a.near', displayName: longName },
    });
    // Full name rendered (no ellipsis), and the byline <text> font-size
    // attr is one of the shrunk steps (< default 20).
    expect(svg).toContain(longName);
    // Byline structure (v0.4): <text ... font-size="N" ...><tspan font-weight="600">Name</tspan>...
    const sizeMatch = svg.match(
      new RegExp(`font-size="(\\d+)"[^<]*<tspan font-weight="600">${longName}<`)
    );
    expect(sizeMatch).toBeTruthy();
    expect(Number(sizeMatch![1])).toBeLessThan(20);
  });

  // ── v0.3.1: customisation knobs ────────────────────────────────────────

  it('overrides the mark colour when theme.markColor is set', () => {
    const svg = generateTextCardSvg({
      title: 't',
      creator: { accountId: 'alice.near' },
      theme: { markColor: 'green' },
    });
    // Green = #22C55E (palette[1]).
    expect(svg).toMatch(/<rect [^>]*width="36"[^>]*fill="#22C55E"/i);
  });

  it('renders a dot when theme.markShape="dot"', () => {
    const svg = generateTextCardSvg({
      title: 't',
      creator: { accountId: 'a.near' },
      theme: { markShape: 'dot' },
    });
    expect(svg).toContain('<circle');
    expect(svg).not.toMatch(/<rect [^>]*width="36"[^>]*height="3"/);
  });

  it('renders a vertical bar when theme.markShape="bar"', () => {
    const svg = generateTextCardSvg({
      title: 't',
      creator: { accountId: 'a.near' },
      theme: { markShape: 'bar' },
    });
    // Bar: 4 wide × 24 tall.
    expect(svg).toMatch(/<rect [^>]*width="4"[^>]*height="24"/);
  });

  it('centres the title when theme.titleAlign="center"', () => {
    const svg = generateTextCardSvg({
      title: 'centred',
      theme: { titleAlign: 'center' },
    });
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toMatch(/<tspan x="300"/);
  });

  // ── Emoji handling ─────────────────────────────────────────────────────

  it('wraps emoji-heavy titles by visual width, not codepoint count', () => {
    // 8 emojis + 11 chars text = ~27 visual units, exceeds the
    // default ink budget of 22 → must wrap. By codepoint count it'd
    // appear shorter and miss the wrap.
    const svg = generateTextCardSvg({
      title: '🔥🚀🔥🚀🔥🚀🔥🚀 hot take now',
    });
    const tspans = svg.match(/<tspan/g) ?? [];
    expect(tspans.length).toBeGreaterThan(1);
  });

  it('renders multi-codepoint emoji (ZWJ sequences) without splitting them', () => {
    // 🏳️‍🌈 is a 6-codepoint ZWJ sequence — must stay together.
    const svg = generateTextCardSvg({ title: 'pride 🏳️‍🌈 always' });
    expect(svg).toContain('🏳️‍🌈');
  });

  it('declares emoji-font fallbacks in font-family chains', () => {
    const svg = generateTextCardSvg({
      title: 't',
      creator: { accountId: 'a.near', displayName: 'Alice' },
    });
    expect(svg).toContain('Apple Color Emoji');
    expect(svg).toContain('Noto Color Emoji');
  });

  // ── v0.4: title auto-shrink ladder ─────────────────────────────────────

  it('shrinks the title font when text would overflow at the default size', () => {
    // ~190 chars — overflows at 44px (132 cap), should fit at a smaller step.
    const long =
      'The best ideas always feel obvious in retrospect, but until you hear them spoken aloud they sound like nonsense, or worse, like everybody on earth had already figured it out years ago.';
    const svg = generateTextCardSvg({ title: long });
    const sizeMatch = svg.match(
      /<text[^>]*y="\d+"[^>]*font-size="(\d+)"[^>]*>(?:<tspan[^>]*>[\s\S]*?<\/tspan>){2,}<\/text>/
    );
    expect(sizeMatch).toBeTruthy();
    const size = Number(sizeMatch![1]);
    expect(size).toBeLessThan(44);
    expect(size).toBeGreaterThanOrEqual(28);
  });

  it('measureTitleFit reports fits / shrunk / truncated', () => {
    expect(measureTitleFit('short').status).toBe('fits');
    const long =
      'The best ideas always feel obvious in retrospect, but until you hear them spoken aloud they sound like nonsense, or worse, like everybody on earth had already figured it out years ago.';
    const m = measureTitleFit(long);
    expect(['shrunk', 'truncated']).toContain(m.status);
    expect(m.size).toBeLessThanOrEqual(44);
    expect(m.size).toBeGreaterThanOrEqual(28);
    expect(m.approxMaxChars).toBeGreaterThan(150);
  });

  // ── v0.5: receipt mood ──────────────────────────────────────────────────
  // The receipt mood is the only place `photo` is honoured. Short claim
  // top, 220×220 photo bottom-left, byline below. Other moods silently
  // ignore the photo so callers can't smuggle imagery into a text-only card.

  it('renders a receipt with photo when bg=receipt and photo is provided', () => {
    const svg = generateTextCardSvg({
      title: 'Shipped.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'receipt-light' },
      photo: 'https://cdn.onsocial.id/ipfs/bafyPhoto',
    });
    expect(svg).toContain('<image');
    expect(svg).toContain('href="https://cdn.onsocial.id/ipfs/bafyPhoto"');
    expect(svg).toContain('clip-path="url(#photoClip)"');
    expect(svg).toContain('id="photoClip"');
    // 220×220 anchored bottom-left at the standard 56px padding.
    expect(svg).toContain('width="220" height="220"');
  });

  it('omits the photo block on receipt mood when no photo is provided', () => {
    const svg = generateTextCardSvg({
      title: 'Shipped.',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'receipt-light' },
    });
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('photoClip');
  });

  it('ignores `photo` on non-receipt moods (text-only stays text-only)', () => {
    const svg = generateTextCardSvg({
      title: 'thought only',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'serif-night' },
      photo: 'https://cdn.onsocial.id/ipfs/bafyPhoto',
    });
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('photoClip');
  });

  it('rejects unsafe photo URI schemes on receipt mood (javascript:, file:, etc.)', () => {
    const svg = generateTextCardSvg({
      title: 'safe',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'receipt-light' },
      // eslint-disable-next-line no-script-url
      photo: 'javascript:alert(1)',
    });
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('javascript:');
  });

  it('accepts data:image/* URIs for offline / inlined receipt photos', () => {
    const svg = generateTextCardSvg({
      title: 'inline',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'receipt-light' },
      photo: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(svg).toContain('<image');
    expect(svg).toContain('href="data:image/png;base64,iVBORw0KGgo=');
  });

  it('defensively truncates receipt titles past the 60-char cap', () => {
    // The SDK throws first; this is a last line of defence in case the
    // gateway is bypassed and the generator is called directly.
    const longClaim = 'x'.repeat(80);
    const svg = generateTextCardSvg({
      title: longClaim,
      creator: { accountId: 'alice.near', displayName: 'Alice' },
      theme: { bg: 'receipt-light' },
      photo: 'https://cdn.onsocial.id/ipfs/bafyPhoto',
    });
    expect(svg).not.toContain('x'.repeat(80));
    // Hard cap at 60 chars (incl. ellipsis). The truncated title wraps
    // across two tspans; concatenate them to verify the visible payload.
    const tspanText = Array.from(svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g))
      .map((m) => m[1])
      .filter((t) => /x/.test(t))
      .join('');
    expect(tspanText.length).toBe(60);
    expect(tspanText.endsWith('\u2026')).toBe(true);
  });
});
