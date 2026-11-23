import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CollectionPageSkeleton,
  type CollectionPageSkeletonProps,
} from '@/features/scarces/collection-page-skeleton';

describe('CollectionPageSkeleton', () => {
  it('reserves settled face chassis (party + commerce meter + activity)', () => {
    const html = renderToStaticMarkup(createElement(CollectionPageSkeleton));
    expect(html).toContain('data-collection-page-skeleton');
    expect(html).toContain('collection-skeleton-cover');
    expect(html).toContain('drops-discovery-party--lead');
    expect(html).toContain('collection-commerce-actions');
    expect(html).toContain('collection-product-row');
    expect(html).toContain('collection-progress');
    expect(html).toContain('collection-activity-seat');
    expect(html).toContain('collection-about-teaser');
    expect(html).toContain('collection-guest-tally');
    expect(html).not.toContain('collection-source-link');
    expect(html).not.toContain('collection-edition-line');
    expect(html).toContain('collection-skeleton-activity-list');
    expect(html).toContain('collection-use-actions');
    expect(html).toContain('collection-use-actions-chassis');
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
    expect(html).toContain('collection-tracks-skeleton');
    expect(html).toContain('is-square');
    expect(html).toContain('is-immersive');
    expect(html).toContain('collection-progress');
    expect(html).not.toContain('collection-skeleton-activity-list');
    expect(html).not.toContain('has-fans-seat');
  });

  it('reserves love-row fans on non-audio cold shell', () => {
    const html = renderToStaticMarkup(createElement(CollectionPageSkeleton));
    expect(html).toContain('has-fans-seat');
    expect(html).toContain('collection-drop-fans');
    expect(html).toContain('drops-discovery-fans-facepile');
  });
});
