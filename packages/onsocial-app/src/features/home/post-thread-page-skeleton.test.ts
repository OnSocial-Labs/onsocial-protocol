import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PostThreadRouteLoading } from '@/features/home/post-thread-route-loading';
import { PostThreadPageSkeleton } from '@/features/home/post-skeleton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, prefetch: () => undefined }),
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
}));

function markup() {
  return renderToStaticMarkup(createElement(PostThreadPageSkeleton));
}

describe('PostThreadPageSkeleton', () => {
  it('matches the opened post: focal block, replies label, then reply rows', () => {
    const html = markup();
    const focal = html.indexOf('post-card--detail');
    const time = html.indexOf('post-card-detail-time');
    const actions = html.indexOf('post-card-engagement');
    const replies = html.indexOf('thread-controls-row');
    const replyRows = html.indexOf('post-row-skeleton-list', replies);

    expect(focal).toBeGreaterThan(-1);
    expect(time).toBeGreaterThan(focal);
    expect(actions).toBeGreaterThan(time);
    expect(replies).toBeGreaterThan(actions);
    expect(replyRows).toBeGreaterThan(replies);
    expect(html).toContain('divider-detail');
    expect(html).toContain('aria-hidden="true"');
  });

  it('keeps the loading reply bar inert and reserves the expand slot', () => {
    const html = renderToStaticMarkup(
      createElement(PostThreadRouteLoading, { backHref: '/home' })
    );
    const dock = html.slice(html.indexOf('is-reply-reserve'));
    const textarea = dock.match(/<textarea\b[^>]*>/)?.[0] ?? '';

    expect(dock.startsWith('is-reply-reserve')).toBe(true);
    expect(html).toContain('inert=""');
    expect(textarea).toContain('disabled');
    expect(dock).toContain('os-write-dock-expand-icon');
    expect(textarea).not.toContain('kept-text');
  });
});
