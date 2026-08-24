'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { ContextualBack } from '@/components/app/contextual-back';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesHeaderActions } from '@/features/collectibles/collectibles-header-actions';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import {
  CollectiblesFilterToolbar,
  CollectiblesSearchHeading,
} from '@/features/collectibles/collectibles-page-chrome';
import {
  CollectiblesPanelChromeProvider,
  type CollectiblesPanelChromeContextValue,
} from '@/features/collectibles/collectibles-panel-context';
import {
  fetchOwnedScarcesPage,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { peekOwnedVaultPage } from '@/features/market/owned-vault-cache';
import {
  normalizeDropFacetMedium,
  normalizeDropFacets,
  parseAudioFormat,
} from '@/features/scarces/drop-facets';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import type { MarketAudioFormatFilter } from '@/features/market/market-facet-rail';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_COLLECTIBLES_PATH,
  APP_DROP_CREATE_PATH,
  APP_MARKET_PATH,
  COLLECTIBLES_SEARCH_PARAM,
  MARKET_KIND_PARAM,
  MARKET_FACETS_PARAM,
  MARKET_AUDIO_FORMAT_PARAM,
  marketFacetsParamValue,
  parseMarketFacetsParam,
} from '@/lib/app-routes';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  listOfflineAlbums,
  offlineAlbumToHoldingPeek,
} from '@/lib/collectibles-offline';
import { portfolioCollectiblesPath, portfolioPath } from '@/lib/overlay-routes';
import {
  filterHoldingsByMedium,
  groupHoldingsForRail,
  holdingsMatchQuery,
  toPortfolioHoldingPeek,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface HoldingsState {
  items: PortfolioHoldingPeek[];
  nextFromEnd: number;
  hasMore: boolean;
  /** `${accountId}:${retryKey}` this payload belongs to. */
  loadKey: string | null;
  failed: boolean;
}

const EMPTY_HOLDINGS: HoldingsState = {
  items: [],
  nextFromEnd: 0,
  hasMore: false,
  loadKey: null,
  failed: false,
};

function parseMediumFilter(raw: string | null): MarketMediumFilter {
  const value = raw?.trim().toLowerCase() ?? '';
  const known = MARKET_MEDIUM_FILTERS.find(
    (entry) => entry.id !== 'all' && entry.id === value
  );
  return known ? known.id : 'all';
}

function holdingsStateFromItems(
  items: OwnedScarceItem[],
  nextFromEnd: number,
  hasMore: boolean,
  loadKey: string
): HoldingsState {
  return {
    items: items.map(toPortfolioHoldingPeek),
    nextFromEnd,
    hasMore,
    loadKey,
    failed: false,
  };
}

export function CollectiblesPagePanel({
  /** Account whose holdings to show. Portfolio routes pass this; OS vault omits. */
  pageAccountId = null,
  initialAccountId = null,
  initialHoldings = null,
  /**
   * Portfolio PanelPage vault — merged search header + scroll-fold filters.
   * OS `/collectibles` uses `os` until connected, then redirects to portfolio.
   */
  shell = 'os' as 'portfolio' | 'os',
  embedded = false,
}: {
  pageAccountId?: string | null;
  initialAccountId?: string | null;
  initialHoldings?: {
    items: OwnedScarceItem[];
    nextFromEnd: number;
    hasMore: boolean;
  } | null;
  /** @deprecated Use `shell="portfolio"` */
  embedded?: boolean;
  shell?: 'portfolio' | 'os';
} = {}) {
  const resolvedShell = embedded ? 'portfolio' : shell;
  const { accountId: viewerAccountId, isConnected, connect } = useAppWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get(COLLECTIBLES_SEARCH_PARAM) ?? '';
  const mediumFilter = parseMediumFilter(searchParams.get(MARKET_KIND_PARAM));
  const facetMedium = normalizeDropFacetMedium(mediumFilter);
  const selectedFacets = facetMedium
    ? normalizeDropFacets(
        parseMarketFacetsParam(searchParams.get(MARKET_FACETS_PARAM)),
        facetMedium
      )
    : [];
  const audioFormatFilter: MarketAudioFormatFilter =
    facetMedium === 'audio'
      ? parseAudioFormat(searchParams.get(MARKET_AUDIO_FORMAT_PARAM))
      : null;

  const ownerAccountId = (pageAccountId ?? viewerAccountId)?.trim() || null;
  const isSelf =
    Boolean(ownerAccountId) &&
    Boolean(viewerAccountId) &&
    accountIdsEqual(ownerAccountId!, viewerAccountId!);
  const listBasePath = pageAccountId
    ? portfolioCollectiblesPath(pageAccountId)
    : APP_COLLECTIBLES_PATH;

  const [retryKey, setRetryKey] = useState(0);
  const [holdings, setHoldings] = useState<HoldingsState>(() => {
    const account = ownerAccountId ?? initialAccountId;
    if (!account) return EMPTY_HOLDINGS;
    const loadKey = `${account}:0`;
    if (
      initialHoldings &&
      initialAccountId &&
      initialAccountId === account
    ) {
      return holdingsStateFromItems(
        initialHoldings.items,
        initialHoldings.nextFromEnd,
        initialHoldings.hasMore,
        loadKey
      );
    }
    const cached = peekOwnedVaultPage(account);
    if (cached) {
      return holdingsStateFromItems(
        cached.items,
        cached.nextFromEnd,
        cached.hasMore,
        loadKey
      );
    }
    return EMPTY_HOLDINGS;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQueryState] = useState(urlSearch);
  const [offlineHoldings, setOfflineHoldings] = useState<
    PortfolioHoldingPeek[]
  >([]);
  const [offlineReady, setOfflineReady] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const loadKey = ownerAccountId ? `${ownerAccountId}:${retryKey}` : null;
  const trimmedSearch = searchQuery.trim();

  const replaceListParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${listBasePath}?${qs}` : listBasePath, {
        scroll: false,
      });
    },
    [router, searchParams, listBasePath]
  );

  const setSearchQuery = useCallback(
    (next: string) => {
      setSearchQueryState(next);
      const trimmed = next.trim();
      const current = (searchParams.get(COLLECTIBLES_SEARCH_PARAM) ?? '').trim();
      if (trimmed === current) return;
      replaceListParams((params) => {
        if (trimmed) params.set(COLLECTIBLES_SEARCH_PARAM, trimmed);
        else params.delete(COLLECTIBLES_SEARCH_PARAM);
      });
    },
    [replaceListParams, searchParams]
  );

  useEffect(() => {
    setSearchQueryState((prev) =>
      prev.trim() === urlSearch.trim() ? prev : urlSearch
    );
  }, [urlSearch]);

  const setMediumFilter = useCallback(
    (next: MarketMediumFilter) => {
      replaceListParams((params) => {
        if (next === 'all') {
          params.delete(MARKET_KIND_PARAM);
        } else {
          params.set(MARKET_KIND_PARAM, next);
        }
        params.delete(MARKET_FACETS_PARAM);
        params.delete(MARKET_AUDIO_FORMAT_PARAM);
      });
    },
    [replaceListParams]
  );

  const replaceDiscoveryParams = useCallback(
    (next: {
      facets?: string[];
      audioFormat?: MarketAudioFormatFilter;
    }) => {
      const facets =
        next.facets !== undefined ? next.facets : selectedFacets;
      const audioFormat =
        next.audioFormat !== undefined ? next.audioFormat : audioFormatFilter;
      replaceListParams((params) => {
        const facetsValue = marketFacetsParamValue(facets);
        if (facetsValue) params.set(MARKET_FACETS_PARAM, facetsValue);
        else params.delete(MARKET_FACETS_PARAM);
        if (audioFormat) params.set(MARKET_AUDIO_FORMAT_PARAM, audioFormat);
        else params.delete(MARKET_AUDIO_FORMAT_PARAM);
      });
    },
    [replaceListParams, selectedFacets, audioFormatFilter]
  );

  useEffect(() => {
    if (!ownerAccountId || !loadKey) {
      return;
    }

    let cancelled = false;
    void fetchOwnedScarcesPage(ownerAccountId)
      .then((page) => {
        if (cancelled) return;
        setHoldings({
          items: page.items.map(toPortfolioHoldingPeek),
          nextFromEnd: page.nextFromEnd,
          hasMore: page.hasMore,
          loadKey,
          failed: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setHoldings({
          ...EMPTY_HOLDINGS,
          loadKey,
          failed: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [ownerAccountId, loadKey]);

  useEffect(() => {
    if (!isSelf) {
      return;
    }
    let cancelled = false;
    void listOfflineAlbums()
      .then((albums) => {
        if (cancelled) return;
        setOfflineHoldings(albums.map(offlineAlbumToHoldingPeek));
        setOfflineReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOfflineHoldings([]);
        setOfflineReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey, isSelf]);

  const status: LoadStatus = !ownerAccountId
    ? 'idle'
    : holdings.loadKey !== loadKey
      ? 'loading'
      : holdings.failed
        ? 'error'
        : 'ready';

  const loadMore = useCallback(() => {
    if (!ownerAccountId || !holdings.hasMore || loadingMore) return;
    setLoadingMore(true);
    void fetchOwnedScarcesPage(ownerAccountId, {
      fromEnd: holdings.nextFromEnd,
    })
      .then((page) => {
        setHoldings((prev) => {
          const seen = new Set(prev.items.map((item) => item.tokenId));
          const nextItems = [...prev.items];
          for (const row of page.items) {
            const peek = toPortfolioHoldingPeek(row);
            if (seen.has(peek.tokenId)) continue;
            seen.add(peek.tokenId);
            nextItems.push(peek);
          }
          return {
            ...prev,
            items: nextItems,
            nextFromEnd: page.nextFromEnd,
            hasMore: page.hasMore,
          };
        });
      })
      .catch(() => {
        /* keep existing rows */
      })
      .finally(() => setLoadingMore(false));
  }, [ownerAccountId, holdings.hasMore, holdings.nextFromEnd, loadingMore]);

  const sameOwnerHoldings =
    Boolean(ownerAccountId) &&
    holdings.loadKey != null &&
    holdings.loadKey.startsWith(`${ownerAccountId}:`) &&
    holdings.items.length > 0;
  /** Offline library is owner-vault only — skip when browsing someone else. */
  const selfOfflineHoldings = isSelf ? offlineHoldings : [];
  const selfOfflineReady = isSelf ? offlineReady : true;
  const vaultItems = sameOwnerHoldings
    ? holdings.items
    : isSelf
      ? selfOfflineHoldings
      : [];
  const usingOfflineLibrary =
    isSelf && !sameOwnerHoldings && selfOfflineHoldings.length > 0;
  const showVaultSkeleton =
    (Boolean(ownerAccountId) &&
      status === 'loading' &&
      vaultItems.length === 0) ||
    (!pageAccountId && !selfOfflineReady && !viewerAccountId);

  const filtered = useMemo(() => {
    let byKind = filterHoldingsByMedium(vaultItems, mediumFilter);
    if (facetMedium === 'audio' && audioFormatFilter) {
      byKind = byKind.filter((item) => item.audioFormat === audioFormatFilter);
    }
    if (selectedFacets.length > 0) {
      byKind = byKind.filter((item) =>
        selectedFacets.some((facet) => item.facets?.includes(facet))
      );
    }
    if (!trimmedSearch) return byKind;
    return byKind.filter((item) => holdingsMatchQuery(item, trimmedSearch));
  }, [
    vaultItems,
    mediumFilter,
    facetMedium,
    audioFormatFilter,
    selectedFacets,
    trimmedSearch,
  ]);

  const displayRows = useMemo(
    () => groupHoldingsForRail(filtered),
    [filtered]
  );

  const clientDiscoveryFilterActive =
    trimmedSearch.length > 0 ||
    mediumFilter !== 'all' ||
    (facetMedium != null &&
      (selectedFacets.length > 0 || Boolean(audioFormatFilter)));
  const facetOrFormatActive =
    facetMedium != null &&
    (selectedFacets.length > 0 || Boolean(audioFormatFilter));

  /** OS vault entry with no wallet — portfolio routes always have pageAccountId. */
  const showConnectPrompt =
    !pageAccountId &&
    selfOfflineReady &&
    (!isConnected || !viewerAccountId) &&
    !usingOfflineLibrary;
  const hasVaultItems = vaultItems.length > 0;
  const showDiscoveryChrome = hasVaultItems && !showConnectPrompt;
  const showTabs = showDiscoveryChrome;
  const emptyVault =
    !usingOfflineLibrary &&
    status === 'ready' &&
    Boolean(ownerAccountId) &&
    holdings.items.length === 0;
  const emptySearch =
    vaultItems.length > 0 &&
    trimmedSearch.length > 0 &&
    filtered.length === 0 &&
    !holdings.hasMore &&
    !loadingMore;
  const emptyFilter =
    vaultItems.length > 0 &&
    !trimmedSearch &&
    clientDiscoveryFilterActive &&
    filtered.length === 0 &&
    !holdings.hasMore &&
    !loadingMore;
  const showOfflineOnly =
    usingOfflineLibrary &&
    (!viewerAccountId || status === 'error' || status === 'idle');
  const emptyFilterLabel =
    MARKET_MEDIUM_FILTERS.find((tab) => tab.id === mediumFilter)?.label ??
    'items';

  const filterAwaitingLoad =
    clientDiscoveryFilterActive &&
    filtered.length === 0 &&
    holdings.hasMore &&
    !emptyFilter &&
    !emptySearch &&
    vaultItems.length > 0 &&
    (status === 'ready' || usingOfflineLibrary);

  const showLoadMore =
    holdings.hasMore &&
    (status === 'ready' || usingOfflineLibrary) &&
    (filtered.length > 0 || !clientDiscoveryFilterActive || filterAwaitingLoad);

  const loadMoreLabel = loadingMore
    ? 'Loading…'
    : filterAwaitingLoad && filtered.length === 0
      ? 'Looking for matches…'
      : 'Show more';

  useEffect(() => {
    if (!clientDiscoveryFilterActive) return;
    if (status !== 'ready' && !usingOfflineLibrary) return;
    if (!holdings.hasMore || loadingMore) return;
    loadMore();
  }, [
    clientDiscoveryFilterActive,
    holdings.hasMore,
    holdings.items.length,
    loadMore,
    loadingMore,
    status,
    usingOfflineLibrary,
  ]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreSentinelRef,
    enabled: showLoadMore && !clientDiscoveryFilterActive,
    onIntersect: loadMore,
  });

  const chromeValue = useMemo<CollectiblesPanelChromeContextValue>(
    () => ({
      pageAccountId: ownerAccountId,
      scrollRootRef,
      searchQuery,
      setSearchQuery,
      showSearch: showDiscoveryChrome,
      showTabs,
      mediumFilter,
      setMediumFilter,
      facetMedium,
      selectedFacets,
      audioFormatFilter,
      replaceDiscoveryParams,
    }),
    [
      ownerAccountId,
      searchQuery,
      setSearchQuery,
      showDiscoveryChrome,
      showTabs,
      mediumFilter,
      setMediumFilter,
      facetMedium,
      selectedFacets,
      audioFormatFilter,
      replaceDiscoveryParams,
    ]
  );

  const body = (
    <div className="market-page collectibles-page">
      {showVaultSkeleton ? <MarketListSkeleton rows={6} /> : null}

      {showConnectPrompt ? (
        <div className="market-page-empty">
          <p className="market-page-empty-copy">
            Connect your wallet to open your Collectibles vault.
          </p>
          <div className="collectibles-empty-actions">
            <button
              type="button"
              className="page-drawer-section-action"
              onClick={() => void connect()}
            >
              Connect
            </button>
            <Link className="page-drawer-section-action" href={APP_MARKET_PATH}>
              Browse Market
            </Link>
          </div>
        </div>
      ) : null}

      {ownerAccountId && status === 'error' && !usingOfflineLibrary ? (
        <div className="market-page-status">
          <p>
            {isSelf
              ? 'Couldn’t load your collectibles.'
              : 'Couldn’t load collectibles.'}
          </p>
          <button
            type="button"
            className="market-page-retry"
            onClick={() => setRetryKey((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      ) : null}

      {showOfflineOnly ? (
        <p className="market-page-status">
          Downloaded music — available offline.
        </p>
      ) : null}

      {emptyVault ? (
        <div className="market-page-empty">
          <p className="market-page-empty-copy">
            {isSelf
              ? 'Nothing in your vault yet. Collect a scarce on Market, or release your own drop.'
              : 'Nothing held yet.'}
          </p>
          {isSelf ? (
            <div className="collectibles-empty-actions">
              <Link
                className="page-drawer-section-action"
                href={APP_MARKET_PATH}
              >
                Browse Market
              </Link>
              <Link
                className="page-drawer-section-action"
                href={APP_DROP_CREATE_PATH}
              >
                Create a drop
              </Link>
            </div>
          ) : (
            <Link className="page-drawer-section-action" href={APP_MARKET_PATH}>
              Browse Market
            </Link>
          )}
        </div>
      ) : null}

      {emptySearch ? (
        <div className="market-page-empty">
          <p className="market-page-empty-copy">
            No collectibles match “{trimmedSearch}”.
          </p>
          <button
            type="button"
            className="market-sales-more"
            onClick={() => setSearchQuery('')}
          >
            Clear search
          </button>
        </div>
      ) : null}

      {emptyFilter ? (
        <div className="market-page-empty">
          <p className="market-page-empty-copy">
            {facetOrFormatActive
              ? 'No matches for these filters.'
              : isSelf
                ? `No ${emptyFilterLabel.toLowerCase()} in your vault.`
                : `No ${emptyFilterLabel.toLowerCase()} held.`}
          </p>
          <button
            type="button"
            className="market-sales-more"
            onClick={() => setMediumFilter('all')}
          >
            Show all
          </button>
        </div>
      ) : null}

      {filterAwaitingLoad ? (
        <p className="market-page-status">Looking for matches…</p>
      ) : null}

      {filtered.length > 0 && (status === 'ready' || usingOfflineLibrary) ? (
        <section
          className="market-section"
          aria-labelledby="collectibles-results"
        >
          <div
            id="collectibles-results"
            className="market-listing-list"
            role="list"
          >
            {displayRows.map((item) => (
              <CollectiblesHoldingRow
                key={item.tokenId}
                item={item}
                editionCount={item.editionCount}
              />
            ))}
          </div>
        </section>
      ) : null}

      {showLoadMore ? (
        <>
          <button
            type="button"
            className="market-sales-more"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadMoreLabel}
          </button>
          <div ref={loadMoreSentinelRef} aria-hidden />
        </>
      ) : null}
    </div>
  );

  const portfolioBackHref =
    resolvedShell === 'portfolio' && pageAccountId
      ? portfolioPath(pageAccountId)
      : null;

  return (
    <CollectiblesPanelChromeProvider value={chromeValue}>
      <OsAppScreen
        title="Collectibles"
        leading={
          portfolioBackHref ? (
            <ContextualBack fallbackHref={portfolioBackHref} />
          ) : null
        }
        glassChrome
        scrollRootRef={scrollRootRef}
        actions={<CollectiblesHeaderActions pageAccountId={ownerAccountId} />}
        heading={
          showDiscoveryChrome ? <CollectiblesSearchHeading /> : undefined
        }
        toolbar={
          showDiscoveryChrome ? <CollectiblesFilterToolbar /> : undefined
        }
      >
        {body}
      </OsAppScreen>
    </CollectiblesPanelChromeProvider>
  );
}
