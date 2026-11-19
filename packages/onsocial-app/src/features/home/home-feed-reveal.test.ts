/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coldLoadReveal,
  HomeFeedReveal,
  nextColdLoadLoading,
  slowRefreshReveal,
} from '@/features/home/home-feed-reveal';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
}));

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
  });

  it('paints a ready list without a second skeleton', () => {
    const html = markup(false);
    expect(html).toContain('let’s try');
    expect(html).toContain('home-feed-reveal');
    expect(html).not.toContain('post-row-skeleton-list');
    expect(html).not.toContain('os-route-skeleton');
  });
});

function ColdLoadFrame({
  shown,
  refreshing,
}: {
  shown: boolean;
  refreshing: boolean;
}) {
  return createElement(
    HomeFeedReveal,
    {
      showSkeleton: !shown,
      skeleton: createElement(
        'div',
        { className: 'post-row-skeleton-list' },
        'skeleton'
      ),
    },
    shown
      ? createElement(
          'article',
          {
            className: `home-feed-list${refreshing ? ' is-refreshing' : ''}`,
          },
          'Hello'
        )
      : null
  );
}

describe('cold load reveal', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        media: '',
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  async function paint(shown: boolean, refreshing: boolean) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(ColdLoadFrame, { shown, refreshing }));
    });
  }

  it('clears loading once for an SSR hit, including a second pass', async () => {
    let loading = true;
    let clears = 0;
    const apply = () => {
      const decision = coldLoadReveal({
        serverPainted: true,
        settleStarted: false,
      });
      expect(decision.startSettle).toBe(false);
      if (decision.loading === 'clear' && loading) {
        loading = false;
        clears += 1;
      }
    };
    apply();
    apply();
    expect(loading).toBe(false);
    expect(clears).toBe(1);
    await paint(true, false);
    expect(host?.querySelector('.home-feed-list')?.textContent).toBe('Hello');
    expect(host?.querySelector('.post-row-skeleton-list')).toBeNull();
  });

  it('clears loading when an SSR miss adopts the page', async () => {
    let loading = true;
    let settleStarted = false;
    const apply = () => {
      const decision = coldLoadReveal({
        serverPainted: false,
        settleStarted,
      });
      const next = nextColdLoadLoading(loading, decision);
      if (next !== loading) loading = next;
      if (decision.startSettle) settleStarted = true;
      return decision;
    };
    const first = apply();
    expect(first).toEqual({ loading: 'hold', startSettle: true });
    expect(loading).toBe(false);

    const second = apply();
    expect(second).toEqual({ loading: 'leave', startSettle: false });
    expect(nextColdLoadLoading(false, second)).toBe(false);
    expect(loading).toBe(false);

    await paint(true, false);
    expect(host?.querySelector('.home-feed-list')?.textContent).toBe('Hello');
  });

  it('keeps the list up during a slow refresh and clears refreshing once', async () => {
    let loading = true;
    let clears = 0;
    let refreshing = false;
    let refreshClears = 0;
    const start = () => {
      const refresh = slowRefreshReveal();
      if (!refresh.loading && loading) {
        loading = false;
        clears += 1;
      }
      refreshing = refresh.refreshing;
    };
    const finish = () => {
      if (refreshing) refreshClears += 1;
      refreshing = false;
    };
    start();
    expect(loading).toBe(false);
    expect(clears).toBe(1);
    expect(refreshing).toBe(true);
    await paint(true, true);
    expect(host?.querySelector('.home-feed-list.is-refreshing')).not.toBeNull();
    finish();
    expect(refreshClears).toBe(1);
    start();
    expect(clears).toBe(1);
    await act(async () => {
      root?.render(
        createElement(ColdLoadFrame, { shown: true, refreshing: false })
      );
    });
    expect(host?.querySelector('.home-feed-list.is-refreshing')).toBeNull();
    expect(host?.querySelector('.home-feed-list')?.textContent).toBe('Hello');
  });
});
