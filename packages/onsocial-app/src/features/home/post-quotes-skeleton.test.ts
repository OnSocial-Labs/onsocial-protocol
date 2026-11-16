import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PostQuotesRouteLoading } from '@/features/home/post-quotes-route-loading';
import {
  PostQuotesPageSkeleton,
  PostQuotesTrackSkeleton,
} from '@/features/home/post-quotes-skeleton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, prefetch: () => undefined }),
  usePathname: () => '/@alice.testnet/posts/1/quotes',
  useSearchParams: () => new URLSearchParams(),
}));

describe('PostQuotesPageSkeleton', () => {
  it('reserves quote rows under the reach screen class', () => {
    const html = renderToStaticMarkup(createElement(PostQuotesPageSkeleton));

    expect(html).toContain('post-quotes-screen');
    expect(html).toContain('post-row-skeleton-list');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('PostQuotesTrackSkeleton', () => {
  it('keeps Quotes and Reposts labels in the toolbar seat', () => {
    const html = renderToStaticMarkup(
      createElement(PostQuotesTrackSkeleton, { activeTab: 'reposts' })
    );

    expect(html).toContain('post-quotes-track');
    expect(html).toContain('Quotes');
    expect(html).toContain('Reposts');
    expect(html).toContain('is-active');
    expect(html).toContain('inert=""');
  });
});

describe('PostQuotesRouteLoading', () => {
  it('paints Post reach chrome with an inert track and list skeleton', () => {
    const html = renderToStaticMarkup(
      createElement(PostQuotesRouteLoading, { backHref: '/@alice.testnet/posts/1' })
    );

    expect(html).toContain('Post reach');
    expect(html).toContain('Loading post reach');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('post-quotes-track');
    expect(html).toContain('post-row-skeleton-list');
    expect(html).toContain('inert=""');
  });
});
