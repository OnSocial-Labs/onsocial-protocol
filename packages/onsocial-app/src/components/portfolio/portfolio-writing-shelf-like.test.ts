import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WritingShelfLikeCount } from '@/components/portfolio/portfolio-writing-list';

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
    expect(one).toContain(' like');
    expect(one).toContain('os-rolling-number');
    // Digit + word are decorative under the single aria-label.
    expect(one).toMatch(/aria-hidden[^>]*>[\s\S]*os-rolling-number/);

    const many = renderToStaticMarkup(
      createElement(WritingShelfLikeCount, { likeCount: 12, rollSignal: 2 })
    );
    expect(many).toContain('aria-label="12 likes"');
    expect(many).toContain(' likes');
  });
});
