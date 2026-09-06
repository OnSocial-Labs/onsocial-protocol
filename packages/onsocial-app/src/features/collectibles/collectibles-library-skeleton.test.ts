import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollectiblesLibrarySkeleton } from '@/features/collectibles/collectibles-library-skeleton';

describe('CollectiblesLibrarySkeleton', () => {
  it('paints creator and series bones above use-first row bones', () => {
    const html = renderToStaticMarkup(createElement(CollectiblesLibrarySkeleton));
    expect(html).toContain('data-collectibles-library-skeleton');
    expect(html).toContain('collectibles-library-heading--skeleton');
    expect(html).toContain('collectibles-library-series-heading--skeleton');
    expect(html).toContain('collectibles-library-heading-face--skeleton');
    expect(html).toContain('collectibles-holding-row--skeleton');
    expect(html).toContain('market-listing-shimmer-action');
    expect(html).not.toContain('market-listing-shimmer-time');
    expect(html.match(/collectibles-library-heading--skeleton/g)?.length).toBe(
      2
    );
    expect(
      html.match(/collectibles-library-series-heading--skeleton/g)?.length
    ).toBe(1);
    expect(html.match(/collectibles-holding-row--skeleton/g)?.length).toBe(6);
  });
});
