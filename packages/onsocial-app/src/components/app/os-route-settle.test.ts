import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  OsRouteSettle,
  routeSettleCovers,
} from '@/components/app/os-route-settle';
import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';

const tabState = vi.hoisted(() => ({
  tab: 'trending' as 'trending' | 'guilds',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, prefetch: () => undefined }),
  usePathname: () => '/discover',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/app/os-app-screen', () => ({
  OsAppScreen: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/discover/discover-panel', () => ({
  DiscoverPanelRoot: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/discover/discover-screen-chrome', () => ({
  DiscoverHeaderTabs: () => null,
  DiscoverNavSearch: () => null,
}));

vi.mock('@/features/discover/discover-panel-context', () => ({
  useDiscoverPanel: () => ({
    tab: tabState.tab,
    initialTrending: { posts: [{ id: 'painted' }] },
    setTab: () => undefined,
  }),
}));

vi.mock('@/features/discover/discover-panel-content', () => {
  const React = require('react') as typeof import('react');
  return {
    DiscoverPanelContent: function DiscoverPanelContent() {
      return React.createElement(
        'p',
        { 'data-guild-filter': 'music' },
        'music'
      );
    },
  };
});

function settleMarkup(ready?: boolean) {
  const painted = createElement('p', null, 'Painted thread');
  const skeleton = createElement('div', { className: 'cover-probe' }, 'cover');
  const Settle = OsRouteSettle as (props: {
    ready?: boolean;
    skeleton: ReactNode;
  }) => ReactNode;
  return renderToStaticMarkup(
    createElement(Settle, { ready, skeleton }, painted)
  );
}

describe('routeSettleCovers', () => {
  it('stays off for a hard load of the document path, including the loading-shell swap', () => {
    expect(routeSettleCovers(null, '/discover', false)).toBe(false);
    expect(routeSettleCovers('/discover', '/discover', false)).toBe(false);
    expect(
      routeSettleCovers('/@alice.near/posts/1', '/@alice.near/posts/1', false)
    ).toBe(false);
  });

  it('covers a client navigation, including a return to the document path', () => {
    expect(routeSettleCovers('/home', '/discover', false)).toBe(true);
    expect(routeSettleCovers('/home', '/@alice.near/posts/1', false)).toBe(
      true
    );
    expect(routeSettleCovers('/discover', '/discover', true)).toBe(true);
  });
});

describe('Discover tab settle', () => {
  it('keeps the panel inside OsRouteSettle when the tab leaves Moving', () => {
    tabState.tab = 'trending';
    const moving = renderToStaticMarkup(createElement(DiscoverPagePanel));
    tabState.tab = 'guilds';
    const guilds = renderToStaticMarkup(createElement(DiscoverPagePanel));

    for (const html of [moving, guilds]) {
      const wrapper = html.indexOf('os-route-settle');
      const filter = html.indexOf('data-guild-filter="music"');
      expect(wrapper).toBeGreaterThan(-1);
      expect(filter).toBeGreaterThan(wrapper);
    }
  });
});

describe('OsRouteSettle server paint', () => {
  it('does not cover server-rendered discover content before hydration', () => {
    const html = settleMarkup(undefined);

    expect(html).toContain('Painted thread');
    expect(html).not.toContain('os-route-skeleton');
    expect(html).not.toContain('cover-probe');
  });

  it('does not cover a server-rendered post when reduced motion would show the thread', () => {
    const html = settleMarkup(false);

    expect(html).toContain('Painted thread');
    expect(html).toContain('os-page-body-appear');
    expect(html).not.toContain('is-ready');
    expect(html).not.toContain('os-route-skeleton');
    expect(html).not.toContain('cover-probe');
  });
});
