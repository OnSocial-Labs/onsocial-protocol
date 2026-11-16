import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  HOME_FEED_COLD_SKELETON_FRAMES,
  PostRowSkeleton,
} from '@/features/home/post-skeleton';

describe('PostRowSkeleton', () => {
  it('always reserves engagement bones, including text frames', () => {
    const html = renderToStaticMarkup(
      createElement(PostRowSkeleton, { rows: 1 })
    );

    expect(html).toContain('post-card-engagement');
    expect(html).toContain('post-card-engagement-actions');
    expect(html).toContain('post-card-engagement-trailing');
  });

  it('cold frames reserve quote inset + poll option seats', () => {
    const html = renderToStaticMarkup(
      createElement(PostRowSkeleton, {
        rows: HOME_FEED_COLD_SKELETON_FRAMES.length,
        frames: HOME_FEED_COLD_SKELETON_FRAMES,
      })
    );

    expect(html).toContain('post-card-quote-inset--pending');
    expect(html).toContain('post-row-skeleton-poll-option');
    expect(html).toContain('post-row-skeleton-media--single');
    expect(html).toContain('post-row-skeleton-media--collage-2');
  });
});
