import { describe, it, expect } from 'vitest';
import { generateTextCardSvg } from '../../../src/services/compose/text-card.js';

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

  it('includes description when provided', () => {
    const svg = generateTextCardSvg({
      title: 'Title',
      description: 'A helpful description',
    });
    expect(svg).toContain('A helpful description');
  });

  it('escapes XML-unsafe characters in title and description', () => {
    const svg = generateTextCardSvg({
      title: '<script>alert("x")</script>',
      description: 'A & B',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&quot;x&quot;');
    expect(svg).toContain('A &amp; B');
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

  it('renders author chip when creator is provided (initial + name + handle)', () => {
    const svg = generateTextCardSvg({
      title: 'My thought',
      creator: { accountId: 'alice.near', displayName: 'Alice' },
    });
    expect(svg).toContain('Alice');
    expect(svg).toContain('@alice.near');
    expect(svg).toMatch(/<circle/);
    // Initial letter rendered.
    expect(svg).toMatch(/>A<\/text>/);
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

  it('omits the author block when no creator is provided', () => {
    const svg = generateTextCardSvg({ title: 'No author' });
    expect(svg).not.toMatch(/<circle/);
    expect(svg).not.toContain('@');
  });

  it('produces a stable avatar colour for the same accountId', () => {
    const a = generateTextCardSvg({
      title: 'x',
      creator: { accountId: 'alice.near' },
    });
    const b = generateTextCardSvg({
      title: 'y',
      creator: { accountId: 'alice.near' },
    });
    const colorA = a.match(/<circle [^>]*fill="(#[0-9A-F]{6})"/i)?.[1];
    const colorB = b.match(/<circle [^>]*fill="(#[0-9A-F]{6})"/i)?.[1];
    expect(colorA).toBeTruthy();
    expect(colorA).toBe(colorB);
  });
});
