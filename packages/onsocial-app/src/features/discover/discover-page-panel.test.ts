import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';
import {
  PostThreadLayerProvider,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const tabState = vi.hoisted(() => ({
  tab: 'trending' as 'trending' | 'guilds',
}));
const probe = vi.hoisted(() => ({ mounts: 0 }));

vi.mock('@/lib/thread-first-page', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/lib/thread-first-page'
  );
  return { ...actual, warmThreadOpen: () => undefined };
});

vi.mock('next/dynamic', () => {
  const React = require('react') as typeof import('react');
  return {
    default: () =>
      function SheetPanelStub(props: {
        embedded?: boolean;
        onThreadPainted?: () => void;
      }) {
        return React.createElement(
          'button',
          {
            type: 'button',
            'data-embedded': props.embedded ? 'true' : 'false',
            onClick: () => props.onThreadPainted?.(),
          },
          'sheet-panel'
        );
      },
  };
});

vi.mock('@/hooks/use-viewer-dock-mood', () => ({
  useViewerDockMood: () => ({ moodId: null, style: undefined }),
}));

vi.mock('@onsocial/ui', async () => {
  const React = require('react') as typeof import('react');
  const actual = await vi.importActual<Record<string, unknown>>('@onsocial/ui');
  return {
    ...actual,
    OsPageSheet: ({
      children,
      header,
    }: {
      children: ReactNode;
      header?: ReactNode;
    }) => React.createElement('div', { 'data-sheet': 'page' }, header, children),
  };
});

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
      const [filter, setFilter] = React.useState('all');
      React.useEffect(() => {
        probe.mounts += 1;
      }, []);
      return React.createElement(
        'div',
        null,
        React.createElement('p', { 'data-guild-filter': filter }, filter),
        React.createElement(
          'button',
          { type: 'button', onClick: () => setFilter('music') },
          'Filter guilds'
        )
      );
    },
  };
});

function press(click: (() => void) | undefined) {
  if (!click) throw new Error('missing button');
  click();
}

function guildFilter(renderer: ReactTestRenderer): string {
  const node = renderer.root.findAllByType('p')[0];
  const value = node?.props['data-guild-filter'];
  return typeof value === 'string' ? value : '';
}

describe('DiscoverPagePanel tab settle', () => {
  beforeEach(() => {
    tabState.tab = 'trending';
    probe.mounts = 0;
  });

  it('keeps the guild filter when Moving is left and opened again', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(DiscoverPagePanel));
    });

    await act(async () => {
      press(renderer.root.findByType('button').props.onClick);
    });
    expect(guildFilter(renderer)).toBe('music');
    expect(probe.mounts).toBe(1);

    tabState.tab = 'guilds';
    await act(async () => {
      renderer.update(createElement(DiscoverPagePanel));
    });
    expect(guildFilter(renderer)).toBe('music');

    tabState.tab = 'trending';
    await act(async () => {
      renderer.update(createElement(DiscoverPagePanel));
    });
    expect(probe.mounts).toBe(1);

    tabState.tab = 'guilds';
    await act(async () => {
      renderer.update(createElement(DiscoverPagePanel));
    });
    expect(guildFilter(renderer)).toBe('music');
    expect(probe.mounts).toBe(1);
  });
});

function OpenSheet() {
  const layer = usePostThreadLayer();
  return createElement(
    'button',
    {
      type: 'button',
      onClick: () => layer.openPostThread({ href: '/@alice.near/posts/1' }),
    },
    'Open sheet'
  );
}

function buttonNamed(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll(
    (node) => node.type === 'button' && node.props.children === label
  )[0];
}

describe('in-app post sheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the thread off the route skeleton until the thread is painted', async () => {
    vi.stubGlobal('HTMLElement', class HTMLElement {});
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(PostThreadLayerProvider, null, createElement(OpenSheet))
      );
    });
    await act(async () => {
      press(buttonNamed(renderer, 'Open sheet')?.props.onClick);
    });

    const held = JSON.stringify(renderer.toJSON());
    expect(held).toContain('os-page-body-appear');
    expect(held).toContain('"data-embedded":"true"');
    expect(held).not.toContain('is-ready');
    expect(held).not.toContain('os-route-skeleton');

    await act(async () => {
      press(buttonNamed(renderer, 'sheet-panel')?.props.onClick);
    });
    const painted = JSON.stringify(renderer.toJSON());
    expect(painted).toContain('os-page-body-appear is-ready');
    expect(painted).not.toContain('os-route-skeleton');
  });
});
