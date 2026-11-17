import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WritingShelfLikeCount } from '@/components/portfolio/portfolio-writing-list';

const portfolioSrc = dirname(fileURLToPath(import.meta.url));

function visibleText(html: string): string {
  return html
    .replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, '');
}

function accessibleText(html: string): string {
  return html
    .replace(/aria-hidden(?:="[^"]*")?[^>]*>[\s\S]*?<\/[^>]+>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('writing shelf like label', () => {
  it('shows · N like(s), hides at 0, and exposes one accessible name via sr-only', () => {
    expect(
      renderToStaticMarkup(
        createElement(WritingShelfLikeCount, { likeCount: 0 })
      )
    ).toBe('');

    const one = renderToStaticMarkup(
      createElement(WritingShelfLikeCount, { likeCount: 1, rollSignal: 1 })
    );
    expect(one).not.toContain('aria-label=');
    expect(one).toContain('class="sr-only"');
    expect(one).toContain('>1 like<');
    expect(one).toContain('os-rolling-number');
    expect(one).toContain('> · <');
    expect(visibleText(one)).toBe(' · 1 like');
    expect(accessibleText(one)).toMatch(/1 like/);

    const many = renderToStaticMarkup(
      createElement(WritingShelfLikeCount, { likeCount: 3, rollSignal: 2 })
    );
    expect(many).toContain('>3 likes<');
    expect(visibleText(many)).toBe(' · 3 likes');
    expect(accessibleText(many)).toMatch(/3 likes/);
  });

  it('lets the writing card link include the like count in its accessible name', () => {
    const source = readFileSync(
      join(portfolioSrc, 'portfolio-writing-list.tsx'),
      'utf8'
    );
    // Title-only aria-label overrode the visible meta (including likes).
    expect(source).not.toMatch(/aria-label=\{article\.title\}/);
    expect(source).toContain('className="sr-only"');

    const card = renderToStaticMarkup(
      createElement(
        'a',
        { href: '/writing/1', className: 'portfolio-writing-card' },
        createElement('h2', null, 'A Quiet Miracle'),
        createElement(WritingShelfLikeCount, { likeCount: 3, rollSignal: 1 })
      )
    );
    // Same composition the shelf link uses once the title aria-label is gone.
    expect(accessibleText(card)).toMatch(/3 likes/);
    expect(accessibleText(card)).toMatch(/A Quiet Miracle/);
  });
});
