// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import type { DropDiscoveryItem } from '@/features/drops/drops-data';
import type {
  MarketListingItem,
  MarketListingsPage,
  MarketSaleItem,
} from '@/features/market/market-listings';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import type { StandingAccountSummary } from '@/lib/profile-social-standings';
import { seedCollectionViewFromPeek } from '@/features/scarces/collection-page-view';
import type { CollectiblesNowPlayingSession } from '@/contexts/collectibles-now-playing-context';

const gates = vi.hoisted(() => {
  const dropsWaiters: Array<
    (page: { items: DropDiscoveryItem[]; hasMore: boolean }) => void
  > = [];
  const marketListWaiters: Array<(page: MarketListingsPage) => void> = [];
  const marketSalesWaiters: Array<(rows: MarketSaleItem[]) => void> = [];
  const activityWaiters: Array<(rows: Array<Record<string, unknown>>) => void> =
    [];
  const feedWaiters: Array<
    (page: {
      items: PostRow[];
      nextBeforeBlockHeight?: number;
      nextBeforeEventKey?: string;
    }) => void
  > = [];
  const observers: Array<{
    fire: () => void;
  }> = [];
  return {
    dropsWaiters,
    marketListWaiters,
    marketSalesWaiters,
    activityWaiters,
    feedWaiters,
    observers,
    nowPlaying: {
      current: null as { session: CollectiblesNowPlayingSession } | null,
    },
    loves: {
      fanCount: 0,
      fanIds: [] as string[],
    },
    standing: {
      accounts: [] as StandingAccountSummary[],
      showListSkeleton: false,
      isLoadingMore: false,
      showLoadMoreSentinel: true,
    },
    discover: {
      accounts: [] as ProfileListAccount[],
      showListSkeleton: false,
      isLoadingMore: false,
      showLoadMoreSentinel: true,
    },
  };
});

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
  }) => createElement('a', { href, ...props }, children),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/drops',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    setTxResult: vi.fn(),
    trackTransaction: vi.fn(async () => ({ ok: true })),
  }),
}));

vi.mock('@/contexts/collectibles-now-playing-context', () => ({
  useCollectiblesNowPlayingOptional: () => gates.nowPlaying.current,
}));

vi.mock('@/hooks/use-scarce-drop-loves', () => ({
  useScarceDropLoves: () => ({
    loveCount: gates.loves.fanCount,
    fanCount: gates.loves.fanCount,
    fanIds: gates.loves.fanIds,
    fansLoading: false,
    viewerLoved: false,
    pending: false,
    toggleLove: async () => {},
  }),
}));

vi.mock('@/hooks/use-scarce-collection-saves', () => ({
  useScarceCollectionSaves: () => ({
    viewerSaved: () => false,
    isSavePending: () => false,
    toggleSave: async () => {},
  }),
}));

vi.mock('@/lib/app-near-rpc', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/app-near-rpc')>(
      '@/lib/app-near-rpc'
    );
  return {
    ...actual,
    viewNearContract: () => new Promise(() => {}),
  };
});

vi.mock('@/lib/create-readonly-onsocial-client', () => {
  const asyncMethod = () => async () => [];
  const bag = () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'then') return undefined;
          return asyncMethod();
        },
      }
    );
  return {
    createReadOnlyOnSocialClient: () => ({
      query: new Proxy(
        {
          scarces: new Proxy(
            {
              collection: () =>
                new Promise((resolve) => {
                  gates.activityWaiters.push(resolve);
                }),
              collectionCurrent: async () => null,
            },
            {
              get: (target, prop) => {
                if (prop === 'then') return undefined;
                if (prop in target) return target[prop as keyof typeof target];
                return asyncMethod();
              },
            }
          ),
          feed: {
            recent: () =>
              new Promise((resolve) => {
                gates.feedWaiters.push(resolve);
              }),
          },
        },
        {
          get: (target, prop) => {
            if (prop === 'then') return undefined;
            if (prop in target) return target[prop as keyof typeof target];
            return bag();
          },
        }
      ),
    }),
  };
});

vi.mock('@/features/drops/drops-data', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/drops/drops-data')
  >('@/features/drops/drops-data');
  return {
    ...actual,
    fetchDropsPage: () =>
      new Promise((resolve) => {
        gates.dropsWaiters.push(resolve);
      }),
  };
});

vi.mock('@/features/market/market-listings', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/market/market-listings')
  >('@/features/market/market-listings');
  return {
    ...actual,
    fetchMarketListings: () =>
      new Promise((resolve) => {
        gates.marketListWaiters.push(resolve);
      }),
    fetchMarketSales: () =>
      new Promise((resolve) => {
        gates.marketSalesWaiters.push(resolve);
      }),
  };
});

vi.mock('@/features/home/use-personal-composer', () => ({
  usePersonalComposer: () => ({
    openPost: vi.fn(),
    openReply: vi.fn(),
    openFullReply: vi.fn(),
    openQuote: vi.fn(),
    openRepost: vi.fn(),
    openUndoRepost: vi.fn(),
    sheet: null,
    isOpen: false,
  }),
}));

vi.mock('@/components/panels/standing-panel-context', () => ({
  useStandingPanel: () => ({
    kind: 'standing',
    query: '',
    searchSettled: true,
    viewerAccountId: 'ada.near',
    isConnected: true,
    filteredAccounts: gates.standing.accounts,
    mergedPendingIds: new Set<string>(),
    loadError: null,
    actionError: null,
    emptyState: { primary: 'No one yet.', secondary: null },
    clearSearch: vi.fn(),
    showListSkeleton: gates.standing.showListSkeleton,
    isListRefreshing: false,
    isLoadingMore: gates.standing.isLoadingMore,
    relationshipSynced: true,
    showLoadMoreSentinel: gates.standing.showLoadMoreSentinel,
    loadMoreRef: { current: null },
    footerSummary: null,
    listKey: 'standing',
    retryLoad: vi.fn(),
    handleUpdateStanding: vi.fn(),
    accountId: 'ada.near',
  }),
}));

vi.mock('@/features/discover/discover-panel-context', () => ({
  useDiscoverPanel: () => ({
    listAccounts: gates.discover.accounts,
    viewerAccountId: 'ada.near',
    isConnected: true,
    loadError: null,
    actionError: null,
    emptyState: {
      primary: 'No one yet.',
      secondary: null,
      showClearSearch: false,
    },
    isSearchEmpty: false,
    searchSettled: true,
    tab: 'profiles',
    setTab: vi.fn(),
    topicFilterPrefix: '',
    query: '',
    face: 'all',
    industry: '',
    craft: '',
    faceCounts: null,
    showListSkeleton: gates.discover.showListSkeleton,
    isListRefreshing: false,
    isLoadingMore: gates.discover.isLoadingMore,
    relationshipSynced: true,
    showLoadMoreSentinel: gates.discover.showLoadMoreSentinel,
    loadMoreRef: { current: null },
    footerSummary: null,
    listKey: 'discover',
    clearSearch: vi.fn(),
    retryLoad: vi.fn(),
    isStandingPendingForTarget: () => false,
    handleUpdateStanding: vi.fn(),
    initialTrending: null,
  }),
}));

vi.mock('@/features/discover/discover-recommended-peek', () => ({
  DiscoverRecommendedPeek: () =>
    createElement('div', { 'data-discover-peek': '' }, 'peek'),
}));

vi.mock('@/features/discover/discover-tab-lead', () => ({
  DiscoverTabLead: ({ children }: { children?: ReactNode }) =>
    createElement('div', null, children),
}));

vi.mock('@/features/discover/discover-face-filter-rail', () => ({
  DiscoverFaceFilterRail: () => null,
}));

vi.mock('@/features/discover/discover-trending-panel', () => ({
  DiscoverTrendingPanel: () => null,
}));

vi.mock('@/features/discover/discover-daos-panel', () => ({
  DiscoverDaosPanel: () => null,
}));

vi.mock('@/features/discover/discover-guilds-panel', () => ({
  DiscoverGuildsPanel: () => null,
}));

vi.mock('@/features/discover/discover-hubs-panel', () => ({
  DiscoverHubsPanel: () => null,
}));

vi.mock('@/features/discover/discover-focus-list-panel', () => ({
  DiscoverFocusListPanel: () => null,
}));

vi.mock('@/features/discover/discover-catalog-results', () => ({
  DiscoverCatalogResults: () => null,
}));

import { CollectionPagePanel } from '@/features/scarces/collection-page-panel';
import { DropsPagePanel } from '@/features/drops/drops-page-panel';
import { EventsPagePanel } from '@/features/events/events-page-panel';
import { MarketPagePanel } from '@/features/market/market-page-panel';
import { ProfileFeedClient } from '@/features/home/profile-feed-client';
import { StandingPanelContent } from '@/components/panels/standing-panel-content';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import { ProfileSocialListRow } from '@/components/panels/profile-social-list-row';
import { PageContentDrawerProvider } from '@/contexts/page-content-drawer-context';

function dropItem(id: string, title: string, kind = 'art'): DropDiscoveryItem {
  const view = seedCollectionViewFromPeek({
    collectionId: id,
    title,
    kind,
    coverUrl: 'https://example.test/cover.jpg',
    creatorId: 'alice.near',
  })!;
  return {
    collectionId: id,
    creatorId: 'alice.near',
    title,
    mediaUrl: view.mediaUrl,
    priceNear: '1',
    mintedCount: 1,
    remaining: 4,
    totalSupply: 5,
    startTimeMs: null,
    endTimeMs: null,
    status: 'live',
    hasAllowlist: false,
    mediumKind: kind,
    hasPlayable: false,
    trackCount: null,
    description: null,
    createdAtMs: 1_700_000_000_000,
    creatorDisplayName: 'Alice',
    fanCount: 0,
    view,
  };
}

function pastEvent(id: string, title: string): DropDiscoveryItem {
  const item = dropItem(id, title, 'ticket');
  return {
    ...item,
    view: item.view ? { ...item.view, eventEndsAtMs: 1, kind: 'ticket' } : null,
  };
}

function listing(id: string, title: string): MarketListingItem {
  return {
    kind: 'lazy',
    listingId: id,
    creatorId: 'alice.near',
    title,
    priceNear: '1',
    blockTimestamp: 1_700_000_000,
  };
}

function sale(id: string, title: string): MarketSaleItem {
  return {
    tokenId: id,
    title,
    priceNear: '1',
    blockTimestamp: 1_700_000_000,
    sellerId: 'alice.near',
  };
}

function post(id: string, text: string, parent = true): PostRow {
  return {
    accountId: 'bob.near',
    postId: id,
    blockHeight: 10,
    blockTimestamp: 1_700_000_000,
    value: JSON.stringify({ text }),
    parentPath: parent ? 'ada.near/post/root' : '',
    refType: parent ? '' : 'repost',
    refPath: parent ? '' : 'ada.near/post/root',
  } as PostRow;
}

function person(id: string, name: string): StandingAccountSummary {
  return {
    accountId: id,
    name,
    bio: `${name} bio`,
    avatarUrl: null,
    standingCount: 1,
    standingWithCount: 1,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    viewerStanding: false,
    theyStandWithViewer: false,
  };
}

function profileAccount(id: string, name: string): ProfileListAccount {
  return {
    accountId: id,
    name,
    bio: `${name} bio`,
    avatarUrl: null,
    standingCount: 1,
    standingWithCount: 1,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    viewerStanding: false,
    theyStandWithViewer: false,
    targetEndorsedViewer: false,
    viewerEndorsed: false,
    offerCount: 0,
    rowHydrated: true,
  };
}

function audioSession(): CollectiblesNowPlayingSession {
  return {
    collectionId: 'night-drive',
    title: 'Night Drive',
    poster: 'https://example.test/poster.jpg',
    tracks: [
      { url: 'ipfs://track-a', mime: 'audio/mpeg', title: 'One' },
      { url: 'ipfs://track-b', mime: 'audio/mpeg', title: 'Two' },
    ],
  };
}

class Mount {
  root: Root;
  host: HTMLDivElement;

  constructor(node: ReactNode) {
    this.host = document.createElement('div');
    document.body.appendChild(this.host);
    this.root = createRoot(this.host);
    act(() => {
      this.root.render(node);
    });
  }

  update(node: ReactNode) {
    act(() => {
      this.root.render(node);
    });
  }

  unmount() {
    act(() => {
      this.root.unmount();
    });
    this.host.remove();
  }
}

function resetGates() {
  gates.dropsWaiters.length = 0;
  gates.marketListWaiters.length = 0;
  gates.marketSalesWaiters.length = 0;
  gates.activityWaiters.length = 0;
  gates.feedWaiters.length = 0;
  gates.observers.length = 0;
  gates.nowPlaying.current = null;
  gates.loves.fanCount = 0;
  gates.loves.fanIds = [];
  gates.standing.accounts = [];
  gates.standing.showListSkeleton = false;
  gates.standing.isLoadingMore = false;
  gates.standing.showLoadMoreSentinel = true;
  gates.discover.accounts = [];
  gates.discover.showListSkeleton = false;
  gates.discover.isLoadingMore = false;
  gates.discover.showLoadMoreSentinel = true;
}

describe('skeleton batch D', () => {
  beforeEach(() => {
    resetGates();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private cb: IntersectionObserverCallback) {}
        observe() {
          const cb = this.cb;
          gates.observers.push({
            fire: () => {
              act(() => {
                cb(
                  [{ isIntersecting: true } as IntersectionObserverEntry],
                  this as unknown as IntersectionObserver
                );
              });
            },
          });
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
        root = null;
        rootMargin = '';
        thresholds = [];
      }
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('matches an in-hand audio seed on the collection skeleton and leaves an unknown medium on the default', () => {
    const view = new Mount(
      createElement(CollectionPagePanel, {
        collectionId: 'night-drive',
        initial: null,
        embedded: true,
      })
    );
    const skeleton = view.host.querySelector('[data-collection-page-skeleton]');
    expect(
      skeleton?.querySelector('.collection-skeleton-activity-list')
    ).toBeTruthy();
    expect(
      skeleton?.querySelector('.collection-skeleton-track-list')
    ).toBeNull();
    expect(skeleton?.querySelector('.collection-cover')?.className).toContain(
      'is-immersive'
    );

    gates.nowPlaying.current = { session: audioSession() };
    view.update(
      createElement(CollectionPagePanel, {
        collectionId: 'night-drive',
        initial: null,
        embedded: true,
      })
    );
    const audio = view.host.querySelector('[data-collection-page-skeleton]');
    expect(
      audio?.querySelector('.collection-skeleton-track-list')
    ).toBeTruthy();
    expect(
      audio?.querySelector('.collection-skeleton-activity-list')
    ).toBeNull();
    const cover = audio?.querySelector('.collection-cover');
    expect(cover?.className).toContain('is-square');
    expect(cover?.className).toContain('is-immersive');
    view.unmount();
  });

  it('keeps a 0-mint drop activity band collapsed until mint rows load', async () => {
    gates.nowPlaying.current = { session: audioSession() };
    const view = new Mount(
      createElement(CollectionPagePanel, {
        collectionId: 'night-drive',
        initial: null,
        embedded: true,
      })
    );
    expect(view.host.querySelector('.collection-activity')).toBeNull();
    expect(
      view.host.querySelector('.collection-skeleton-activity-list')
    ).toBeNull();

    expect(gates.activityWaiters.length).toBeGreaterThan(0);
    await act(async () => {
      gates.activityWaiters.shift()?.([
        {
          operation: 'purchase',
          blockTimestamp: 1_700_000_000_000,
          buyerId: 'ada.near',
          tokenId: 'night-drive:1',
          price: '1000000000000000000000000',
        },
      ]);
    });
    expect(view.host.querySelector('.collection-activity')).toBeTruthy();
    expect(view.host.textContent).toContain('Minted');
    view.unmount();
  });

  it('omits the drops market footer on the cold skeleton, including the server first paint', () => {
    const ssr = renderToStaticMarkup(createElement(DropsPagePanel));
    expect(ssr).toContain('market-listing-list--skeleton');
    expect(ssr).not.toContain('Looking for secondary listings?');
    expect(ssr).not.toContain('Open Market');

    const view = new Mount(createElement(DropsPagePanel));
    expect(
      view.host.querySelector('.market-listing-list--skeleton')
    ).toBeTruthy();
    expect(view.host.textContent).not.toContain(
      'Looking for secondary listings?'
    );
    view.unmount();
  });

  it('fades the first drops catalog in once and keeps that wrapper when another page appends', async () => {
    const view = new Mount(createElement(DropsPagePanel));
    expect(view.host.querySelector('.os-page-body-appear')).toBeNull();
    await act(async () => {
      gates.dropsWaiters.shift()?.({
        items: [dropItem('drop-a', 'First drop')],
        hasMore: true,
      });
    });
    const wrapper = view.host.querySelector('.os-page-body-appear');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toContain('First drop');
    expect(wrapper?.querySelector('.standing-panel-sentinel')).toBeNull();
    expect(wrapper?.querySelector('.list-append-pending')).toBeNull();

    const observer = gates.observers.at(-1);
    expect(observer).toBeTruthy();
    observer?.fire();
    await act(async () => {
      gates.dropsWaiters.shift()?.({
        items: [dropItem('drop-b', 'Second drop')],
        hasMore: false,
      });
    });
    expect(view.host.querySelector('.os-page-body-appear')).toBe(wrapper);
    expect(view.host.textContent).toContain('Second drop');
    expect(wrapper?.classList.contains('is-ready')).toBe(true);
    view.unmount();
  });

  it('fades the first events list, including Past, and does not remount when a page appends', async () => {
    const view = new Mount(
      createElement(EventsPagePanel, { initialNowMs: Date.now() })
    );
    expect(view.host.querySelector('.os-page-body-appear')).toBeNull();
    await act(async () => {
      gates.dropsWaiters.shift()?.({
        items: [pastEvent('show-a', 'Earlier show')],
        hasMore: true,
      });
    });
    const wrapper = view.host.querySelector('.os-page-body-appear');
    expect(wrapper?.textContent).toContain('Past');
    expect(wrapper?.textContent).toContain('Earlier show');
    gates.observers.at(-1)?.fire();
    await act(async () => {
      gates.dropsWaiters.shift()?.({
        items: [pastEvent('show-b', 'Older show')],
        hasMore: false,
      });
    });
    expect(view.host.querySelector('.os-page-body-appear')).toBe(wrapper);
    expect(view.host.textContent).toContain('Older show');
    view.unmount();
  });

  it('fades the first market body and keeps the wrapper across Show more and an append', async () => {
    const view = new Mount(createElement(MarketPagePanel));
    expect(view.host.querySelector('.os-page-body-appear')).toBeNull();
    await act(async () => {
      gates.marketListWaiters.shift()?.({
        items: [listing('ll-1', 'Listed print')],
        nextOffset: 1,
        hasMore: true,
      });
      gates.marketSalesWaiters.shift()?.(
        Array.from({ length: 9 }, (_, index) =>
          sale(`sale-${index}`, `Sale ${index}`)
        )
      );
    });
    const wrapper = view.host.querySelector('.os-page-body-appear');
    expect(wrapper?.textContent).toContain('Listed print');
    expect(wrapper?.textContent).toContain('Recent sales');
    const more = Array.from(view.host.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('more')
    );
    expect(more).toBeTruthy();
    act(() => {
      more?.click();
    });
    expect(view.host.querySelector('.os-page-body-appear')).toBe(wrapper);
    expect(view.host.textContent).toContain('Sale 8');

    gates.observers.at(-1)?.fire();
    await act(async () => {
      gates.marketListWaiters.shift()?.({
        items: [listing('ll-2', 'Second listing')],
        nextOffset: 2,
        hasMore: false,
      });
    });
    expect(view.host.querySelector('.os-page-body-appear')).toBe(wrapper);
    expect(view.host.textContent).toContain('Second listing');
    view.unmount();
  });

  it('fades drawer replies and reposts on the first data mount and leaves the sentinel outside', async () => {
    const replies = new Mount(
      createElement(
        PageContentDrawerProvider,
        null,
        createElement(ProfileFeedClient, {
          accountId: 'bob.near',
          tab: 'replies',
          posts: [],
        })
      )
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      replies.host.querySelector('.post-row-skeleton-list, .home-feed-list')
    ).toBeTruthy();
    await act(async () => {
      gates.feedWaiters.shift()?.({
        items: [post('reply-1', 'A reply')],
        nextBeforeBlockHeight: 9,
        nextBeforeEventKey: 'reply-1',
      });
    });
    const wrapper = replies.host.querySelector('.os-page-body-appear');
    expect(wrapper?.textContent).toContain('A reply');
    expect(wrapper?.querySelector('.home-feed-sentinel')).toBeNull();
    expect(replies.host.querySelector('.home-feed-sentinel')).toBeTruthy();
    expect(wrapper?.querySelector('.list-append-pending')).toBeNull();

    gates.observers.at(-1)?.fire();
    await act(async () => {
      gates.feedWaiters.shift()?.({
        items: [post('reply-2', 'Older reply')],
      });
    });
    expect(replies.host.querySelector('.os-page-body-appear')).toBe(wrapper);
    expect(replies.host.textContent).toContain('Older reply');
    replies.unmount();

    const reposts = new Mount(
      createElement(
        PageContentDrawerProvider,
        null,
        createElement(ProfileFeedClient, {
          accountId: 'bob.near',
          tab: 'reposts',
          posts: [],
        })
      )
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      gates.feedWaiters.shift()?.({
        items: [post('repost-1', 'A repost', false)],
        nextBeforeBlockHeight: 8,
        nextBeforeEventKey: 'repost-1',
      });
    });
    const repostWrap = reposts.host.querySelector('.os-page-body-appear');
    expect(repostWrap?.textContent).toContain('A repost');
    expect(repostWrap?.querySelector('.home-feed-sentinel')).toBeNull();
    reposts.unmount();
  });

  it('fades the first standing list and keeps the wrapper when another account appends', () => {
    gates.standing.showListSkeleton = true;
    const view = new Mount(createElement(StandingPanelContent));
    expect(view.host.querySelector('.os-page-body-appear')).toBeNull();
    gates.standing.showListSkeleton = false;
    gates.standing.accounts = [person('bob.near', 'Bob')];
    view.update(createElement(StandingPanelContent));
    const wrapper = view.host.querySelector('.os-page-body-appear');
    expect(wrapper?.textContent).toContain('Bob');
    expect(view.host.querySelector('.standing-panel-sentinel')).toBeTruthy();
    gates.standing.accounts = [
      person('bob.near', 'Bob'),
      person('cara.near', 'Cara'),
    ];
    gates.standing.isLoadingMore = true;
    view.update(createElement(StandingPanelContent));
    expect(view.host.querySelector('.os-page-body-appear')).toBe(wrapper);
    expect(view.host.textContent).toContain('Cara');
    expect(wrapper?.querySelector('.standing-panel-sentinel')).toBeTruthy();
    view.unmount();
  });

  it('fades the discover list without wrapping the peek, and keeps the wrapper on append', () => {
    gates.discover.showListSkeleton = true;
    const view = new Mount(createElement(DiscoverPanelContent));
    expect(view.host.querySelector('[data-discover-peek]')).toBeTruthy();
    expect(view.host.querySelector('.os-page-body-appear')).toBeNull();
    gates.discover.showListSkeleton = false;
    gates.discover.accounts = [profileAccount('bob.near', 'Bob')];
    view.update(createElement(DiscoverPanelContent));
    const wrapper = view.host.querySelector('.os-page-body-appear');
    expect(wrapper?.textContent).toContain('Bob');
    expect(
      view.host
        .querySelector('[data-discover-peek]')
        ?.closest('.os-page-body-appear')
    ).toBeNull();
    gates.discover.accounts = [
      profileAccount('bob.near', 'Bob'),
      profileAccount('cara.near', 'Cara'),
    ];
    gates.discover.isLoadingMore = true;
    view.update(createElement(DiscoverPanelContent));
    expect(view.host.querySelector('.os-page-body-appear')).toBe(wrapper);
    expect(view.host.textContent).toContain('Cara');
    view.unmount();
  });

  it('fades newly resolved discover signals and leaves person rosters and the name bare', () => {
    const account: ProfileListAccount = {
      ...profileAccount('bob.near', 'Bob'),
      theyStandWithViewer: true,
      bio: 'Writes essays',
    };
    const row = (loading: boolean, density: 'ledger' | 'person' = 'ledger') =>
      createElement(ProfileSocialListRow, {
        account,
        density,
        showSolidarityBadge: true,
        viewerAccountId: 'ada.near',
        canUpdateStanding: true,
        viewerRelationshipLoading: loading,
        onUpdateStanding: () => {},
      });

    const ledger = new Mount(row(true));
    expect(ledger.host.textContent).toContain('Bob');
    expect(ledger.host.textContent).toContain('Writes essays');
    expect(ledger.host.textContent).not.toContain('Stands with you');
    ledger.update(row(false));
    const signal = Array.from(ledger.host.querySelectorAll('span')).find(
      (node) => node.textContent === 'Stands with you'
    );
    expect(signal?.closest('.os-page-body-appear')).toBeTruthy();
    const name = Array.from(ledger.host.querySelectorAll('span')).find(
      (node) => node.textContent === 'Bob'
    );
    expect(name?.closest('.os-page-body-appear')).toBeNull();
    const bio = ledger.host.querySelector('.standing-row-bio');
    expect(bio?.textContent).toContain('Writes essays');
    expect(bio?.closest('.os-page-body-appear')).toBeNull();
    expect(
      ledger.host
        .querySelector('.standing-row-name')
        ?.closest('.os-page-body-appear')
    ).toBeNull();
    ledger.unmount();

    const fans = new Mount(row(false, 'person'));
    expect(fans.host.textContent).toContain('Bob');
    expect(fans.host.querySelector('.os-page-body-appear')).toBeNull();
    expect(fans.host.textContent).not.toContain('Stands with you');
    fans.unmount();

    const stands = new Mount(row(false, 'person'));
    expect(stands.host.querySelector('.os-page-body-appear')).toBeNull();
    stands.unmount();
  });

  it('fades the collection facepile the first time fans appear', () => {
    const initial = seedCollectionViewFromPeek({
      collectionId: 'quiet-print',
      title: 'Quiet Print',
      kind: 'art',
      coverUrl: 'https://example.test/art.jpg',
      creatorId: 'alice.near',
    });
    const view = new Mount(
      createElement(CollectionPagePanel, {
        collectionId: 'quiet-print',
        initial,
        embedded: true,
      })
    );
    expect(
      view.host.querySelector('.collection-drop-fans-facepile')
    ).toBeNull();
    gates.loves.fanCount = 3;
    gates.loves.fanIds = ['ada.near', 'bob.near', 'cara.near'];
    view.update(
      createElement(CollectionPagePanel, {
        collectionId: 'quiet-print',
        initial,
        embedded: true,
      })
    );
    const pile = view.host.querySelector('.collection-drop-fans-facepile');
    expect(pile).toBeTruthy();
    expect(pile?.closest('.os-page-body-appear')).toBeTruthy();
    view.unmount();
  });
});
