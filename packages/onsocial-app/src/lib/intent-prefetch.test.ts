import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DiscoverLoading from '@/app/(app)/discover/loading';
import { PostThreadRouteLoading } from '@/features/home/post-thread-route-loading';
import {
  INTENT_PREFETCH_SEEN_CAP,
  anchorPrefetchDisabled,
  createIntentPrefetchSession,
} from '@/lib/intent-prefetch';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, prefetch: () => undefined }),
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/discover/discover-page-panel', () => ({
  DiscoverPagePanel: () => {
    throw new Error('loading mounted the live Discover panel');
  },
}));

const BASE = 'https://onsocial.test/home';

function session() {
  const prefetch = vi.fn();
  return { prefetch, intent: createIntentPrefetchSession(prefetch) };
}

describe('intent prefetch', () => {
  it('prefetches once per href on pointer enter and keyboard focus', () => {
    const { prefetch, intent } = session();
    const post = '/@alice.near/posts/1';

    expect(
      intent.request({
        href: post,
        base: BASE,
        kind: 'pointerenter',
        now: 1_000,
        keyboard: false,
      })
    ).toBe(true);
    expect(
      intent.request({
        href: post,
        base: BASE,
        kind: 'pointerenter',
        now: 1_100,
        keyboard: false,
      })
    ).toBe(false);
    expect(
      intent.request({
        href: `${post}#reply`,
        base: BASE,
        kind: 'focus',
        now: 1_200,
        keyboard: true,
      })
    ).toBe(false);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'focus',
        now: 1_300,
        keyboard: true,
      })
    ).toBe(true);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'touchstart',
        now: 1_400,
        keyboard: false,
      })
    ).toBe(false);

    expect(prefetch).toHaveBeenCalledTimes(2);
    expect(prefetch).toHaveBeenNthCalledWith(1, post);
    expect(prefetch).toHaveBeenNthCalledWith(2, '/discover');
  });

  it('ignores pointer focus, scroll-driven enters, and other origins', () => {
    const { prefetch, intent } = session();

    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'focus',
        now: 500,
        keyboard: false,
      })
    ).toBe(false);

    intent.noteScroll(1_000);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'pointerenter',
        now: 1_050,
        keyboard: false,
      })
    ).toBe(false);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'pointerenter',
        now: 1_200,
        keyboard: false,
      })
    ).toBe(true);

    expect(
      intent.request({
        href: 'https://example.com/discover',
        base: BASE,
        kind: 'pointerenter',
        now: 1_300,
        keyboard: false,
      })
    ).toBe(false);

    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/discover');
  });

  it('skips API routes and links that opted out of prefetch', () => {
    const { prefetch, intent } = session();

    expect(
      intent.request({
        href: '/api/profiles',
        base: BASE,
        kind: 'pointerenter',
        now: 1_000,
        keyboard: false,
      })
    ).toBe(false);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'pointerenter',
        now: 1_100,
        keyboard: false,
        prefetch: false,
      })
    ).toBe(false);
    expect(
      intent.request({
        href: '/discover',
        base: BASE,
        kind: 'touchstart',
        now: 1_200,
        keyboard: false,
      })
    ).toBe(true);

    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/discover');
  });

  it('reads a prefetch opt-out from the anchor, its props, or the parent fiber', () => {
    const attribute = {
      getAttribute: (name: string) => (name === 'prefetch' ? 'false' : null),
    };
    const data = {
      getAttribute: () => null,
      dataset: { prefetch: 'false' },
    };
    const props = {
      getAttribute: () => null,
      __reactProps$test: { prefetch: false },
    };
    const fiber = {
      getAttribute: () => null,
      __reactFiber$test: {
        memoizedProps: { href: '/writing' },
        return: { memoizedProps: { prefetch: false, href: '/writing' } },
      },
    };
    const open = { getAttribute: () => null };

    expect(anchorPrefetchDisabled(attribute)).toBe(true);
    expect(anchorPrefetchDisabled(data)).toBe(true);
    expect(anchorPrefetchDisabled(props)).toBe(true);
    expect(anchorPrefetchDisabled(fiber)).toBe(true);
    expect(anchorPrefetchDisabled(open)).toBe(false);
  });

  it('forgets seen links when the route changes and caps one route', () => {
    const { prefetch, intent } = session();
    const home = {
      base: BASE,
      current: '/home',
      kind: 'pointerenter' as const,
      keyboard: false,
    };

    expect(intent.request({ ...home, href: '/discover', now: 1 })).toBe(true);
    expect(intent.request({ ...home, href: '/discover', now: 2 })).toBe(false);
    expect(
      intent.request({
        ...home,
        current: '/discover',
        href: '/discover',
        now: 3,
      })
    ).toBe(false);
    expect(
      intent.request({
        ...home,
        current: '/discover',
        href: '/market',
        now: 4,
      })
    ).toBe(true);

    for (let index = 0; index < INTENT_PREFETCH_SEEN_CAP; index += 1) {
      intent.request({
        ...home,
        current: '/market',
        href: `/room/${index}`,
        now: 10 + index,
      });
    }
    expect(
      intent.request({
        ...home,
        current: '/market',
        href: '/room/again',
        now: 10_000,
      })
    ).toBe(true);

    expect(prefetch).toHaveBeenCalledWith('/market');
    expect(prefetch).toHaveBeenCalledWith('/room/again');
  });
});

describe('cold route skeletons', () => {
  it('renders the post thread skeleton and an inert reply dock', () => {
    const html = renderToStaticMarkup(
      createElement(PostThreadRouteLoading, { backHref: '/home' })
    );

    expect(html).toContain('post-card--detail');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading post');
    expect(html).toContain('inert=""');
  });

  it('renders a presentational Discover shell with the Moving tab and a back seat', () => {
    const html = renderToStaticMarkup(createElement(DiscoverLoading));

    expect(html).toContain('>Moving<');
    expect(html).not.toContain('>moving<');
    expect(html).not.toContain('>Trending<');
    expect(html).toContain('Loading Discover');
    expect(html).toContain('discover-trending-section');
    expect(html).toContain('portfolio-summon-back');
    expect(html).toContain('inert=""');
    expect(html).not.toContain('live Discover panel');
  });
});
