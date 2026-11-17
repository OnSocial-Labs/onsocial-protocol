import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WritingShelfLikeCount } from '@/components/portfolio/portfolio-writing-list';

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

describe('writing shelf like label', () => {
  it('shows · N like(s), hides at 0, and exposes one accessible name', () => {
    expect(
      renderToStaticMarkup(
        createElement(WritingShelfLikeCount, { likeCount: 0 })
      )
    ).toBe('');

    const one = renderToStaticMarkup(
      createElement(WritingShelfLikeCount, { likeCount: 1, rollSignal: 1 })
    );
    expect(one).toContain('aria-label="1 like"');
    expect(one).toContain('os-rolling-number');
    // Main's separator sibling: leading space + middot + trailing space.
    expect(one).toContain('> · <');
    expect(visibleText(one)).toBe(' · 1 like');

    const many = renderToStaticMarkup(
      createElement(WritingShelfLikeCount, { likeCount: 3, rollSignal: 2 })
    );
    expect(many).toContain('aria-label="3 likes"');
    expect(visibleText(many)).toBe(' · 3 likes');
  });
});
