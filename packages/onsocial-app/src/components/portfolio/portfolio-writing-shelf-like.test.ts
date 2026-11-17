// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WritingShelfLikeCount } from '@/components/portfolio/portfolio-writing-list';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  );
});

function visibleText(html: string): string {
  return html
    .replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, '');
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
    expect(visibleText(one)).toBe(' · 1 like');

    const many = renderToStaticMarkup(
      createElement(WritingShelfLikeCount, { likeCount: 3, rollSignal: 2 })
    );
    expect(visibleText(many)).toBe(' · 3 likes');
  });

  it('computes the writing card link accessible name including the like count', () => {
    render(
      createElement(
        'a',
        { href: '/writing/1', className: 'portfolio-writing-card' },
        createElement('h2', null, 'A Quiet Miracle'),
        createElement(WritingShelfLikeCount, { likeCount: 3, rollSignal: 1 })
      )
    );
    // Title-only aria-label on the real Link was removed so likes join the name.
    expect(
      screen.getByRole('link', { name: /3 likes/i })
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /A Quiet Miracle/i })
    ).toBeTruthy();
  });
});
