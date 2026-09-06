import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SeriesPageSkeleton } from '@/features/scarces/series-page-skeleton';

describe('SeriesPageSkeleton', () => {
  it('reserves hero and list bones without empty-copy', () => {
    const html = renderToStaticMarkup(createElement(SeriesPageSkeleton));
    expect(html).toContain('data-series-page-skeleton');
    expect(html).toContain('series-skeleton-logo');
    expect(html).toContain('market-listing-row--skeleton');
    expect(html).not.toContain('Opening series');
    expect(html).not.toContain('isn’t available');
  });
});
