import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeFeedReveal } from '@/features/home/home-feed-reveal';

function markup(showSkeleton: boolean) {
  return renderToStaticMarkup(
    createElement(
      HomeFeedReveal,
      {
        showSkeleton,
        skeleton: createElement(
          'div',
          { className: 'post-row-skeleton-list' },
          'skeleton'
        ),
      },
      createElement('article', { className: 'post-card' }, 'let’s try')
    )
  );
}

describe('HomeFeedReveal', () => {
  it('keeps one element type for the skeleton and the list', () => {
    const hidden = createElement(
      HomeFeedReveal,
      { showSkeleton: true, skeleton: null },
      null
    );
    const shown = createElement(
      HomeFeedReveal,
      { showSkeleton: false, skeleton: null },
      null
    );
    expect(hidden.type).toBe(shown.type);
    expect(hidden.type).toBe(HomeFeedReveal);
  });

  it('does not paint the list before it is final', () => {
    const html = markup(true);
    expect(html).toContain('post-row-skeleton-list');
    expect(html).not.toContain('let’s try');
    expect(html).not.toContain('home-feed-reveal-body');
  });

  it('paints server content with the skeleton still under the fade', () => {
    const html = markup(false);
    expect(html).toContain('home-feed-reveal-body');
    expect(html).toContain('let’s try');
    expect(html).toContain('post-row-skeleton-list');
    expect(html).toContain('home-feed-reveal-cover is-under');
    expect(html).not.toContain('opacity:0');
  });
});
