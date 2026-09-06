import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollectionPageSkeleton } from '@/features/scarces/collection-page-skeleton';

describe('CollectionPageSkeleton', () => {
  it('reserves a use-action pill, not an in-page mint button', () => {
    const html = renderToStaticMarkup(createElement(CollectionPageSkeleton));
    expect(html).toContain('data-collection-page-skeleton');
    expect(html).toContain('collection-use-actions');
    expect(html).toContain('collection-skeleton-use-pill');
    expect(html).not.toContain('collection-skeleton-mint');
    expect(html).not.toContain('collection-skeleton-mint-btn');
  });
});
