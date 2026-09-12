import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CollectionPageSkeleton,
  type CollectionPageSkeletonProps,
} from '@/features/scarces/collection-page-skeleton';

describe('CollectionPageSkeleton', () => {
  it('reserves only medium-agnostic drop geometry', () => {
    const html = renderToStaticMarkup(createElement(CollectionPageSkeleton));
    expect(html).toContain('data-collection-page-skeleton');
    expect(html).toContain('collection-skeleton-cover');
    expect(html).toContain('collection-skeleton-activity-list');
    expect(html).not.toContain('collection-use-actions');
    expect(html).not.toContain('collection-skeleton-track-list');
  });

  it('reserves audio tracklist and square cover when isAudio is true', () => {
    const html = renderToStaticMarkup(
      createElement<CollectionPageSkeletonProps>(CollectionPageSkeleton, {
        isAudio: true,
      })
    );
    expect(html).toContain('data-collection-page-skeleton');
    expect(html).toContain('collection-skeleton-track-list');
    expect(html).toContain('is-square');
    expect(html).toContain('is-immersive');
    expect(html).not.toContain('collection-skeleton-activity-list');
  });
});
