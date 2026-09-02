'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesHeaderActions } from '@/features/collectibles/collectibles-header-actions';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import {
  CollectiblesFilterToolbar,
  CollectiblesSearchHeading,
} from '@/features/collectibles/collectibles-page-chrome';
import {
  OWNED_MAX_TOKENS,
  fetchOwnedScarcesPage,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import {
  peekOwnedVaultPage,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_DROP_CREATE_PATH,
  APP_HOME_PATH,
  APP_MARKET_PATH,
} from '@/lib/app-routes';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  listOfflineAlbums,
  offlineAlbumToHoldingPeek,
} from '@/lib/collectibles-offline';
import {
  EMPTY_COLLECTIBLES_PAGE_QUERY,
  collectiblesQueryPath,
  collectiblesSeedParamsKey,
  type CollectiblesPageData,
  type CollectiblesPageQuery,
} from '@/lib/load-collectibles-page';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  filterHoldingsByMedium,
  groupHoldingsForRail,
  holdingsMatchQuery,
  toPortfolioHoldingPeek,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';

/** Debounce search URL writes so seed-key sync does not wipe in-progress typing. */
const SEARCH_URL_DEBOUNCE_MS = 200;

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
  seedQuery = EMPTY_COLLECTIBLES_PAGE_QUERY,
  seedPromise = null,
  /**
   * Portfolio PanelPage vault — merged search header + scroll-fold filters.
   * OS `/collectibles` uses `os` until connected, then redirects to portfolio.
   */
  shell = 'os' as 'portfolio' | 'os',
  embedded = false,
}: {
  pageAccountId?: string | null;
  seedQuery?: CollectiblesPageQuery;
  seedPromise?: Promise<CollectiblesPageData> | null;
  /** @deprecated Use `shell="portfolio"` */
  embedded?: boolean;
  shell?: 'portfolio' | 'os';
} = {}) {
  const resolvedShell = embedded ? 'portfolio' : shell;
  const { accountId: viewerAccountId, isConnected, connect } = useAppWallet();
  const router = useRouter();
  const seedKey = collectiblesSeedParamsKey(seedQuery);
  const [pageQuery, setPageQuery] = useState<CollectiblesPageQuery>(seedQuery);
  const searchQuery = pageQuery.q;
  const mediumFilter = pageQuery.kind;
  const facetMedium = normalizeDropFacetMedium(mediumFilter);
  const selectedFacets = pageQuery.facets;
  const audioFormatFilter: MarketAudioFormatFilter = pageQuery.audioFormat;
  const urlDiscoveryActive =
    searchQuery.trim().length > 0 ||
    mediumFilter !== 'all' ||
    selectedFacets.length > 0 ||
    Boolean(audioFormatFilter);

  const ownerAccountId = (pageAccountId ?? viewerAccountId)?.trim() || null;
  const isSelf =
    Boolean(ownerAccountId) &&
    Boolean(viewerAccountId) &&
    accountIdsEqual(ownerAccountId!, viewerAccountId!);

  const [retryKey, setRetryKey] = useState(0);
  const [holdings, setHoldings] = useState<HoldingsState>(() => {
    const account = ownerAccountId;
    if (!account) return EMPTY_HOLDINGS;
    const loadKey = `${account}:0`;
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
  const [offlineHoldings, setOfflineHoldings] = useState<
    PortfolioHoldingPeek[]
  >([]);
  const [offlineReady, setOfflineReady] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrollTuckPinned, setScrollTuckPinned] = useState(false);
  const holdingsRef = useRef(holdings);
  const pageQueryRef = useRef(pageQuery);
  const searchReplaceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    holdingsRef.current = holdings;
  });
  useEffect(() => {
    pageQueryRef.current = pageQuery;
  });

  const loadKey = ownerAccountId ? `${ownerAccountId}:${retryKey}` : null;
  const trimmedSearch = searchQuery.trim();
  const [settledSearch, setSettledSearch] = useState(trimmedSearch);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSettledSearch(trimmedSearch);
    }, SEARCH_URL_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [trimmedSearch]);

  useEffect(() => {
    setPageQuery(seedQuery);
    // Key-only: a new seedQuery object with the same URL must not wipe an
    // optimistic kind / search hop before router.replace lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedKey gates URL sync
  }, [seedKey]);

  const replacePageQuery = useCallback(
    (next: CollectiblesPageQuery) => {
      if (searchReplaceTimerRef.current != null) {
        window.clearTimeout(searchReplaceTimerRef.current);
        searchReplaceTimerRef.current = null;
      }
      pageQueryRef.current = next;
      setPageQuery(next);
      router.replace(collectiblesQueryPath(pageAccountId, next), {
        scroll: false,
      });
    },
    [router, pageAccountId]
  );

  const setSearchQuery = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      setPageQuery((prev) => {
        if (prev.q === trimmed) return prev;
        const updated = { ...prev, q: trimmed };
        pageQueryRef.current = updated;
        return updated;
      });
      if (searchReplaceTimerRef.current != null) {
        window.clearTimeout(searchReplaceTimerRef.current);
      }
      searchReplaceTimerRef.current = window.setTimeout(() => {
        searchReplaceTimerRef.current = null;
        router.replace(
          collectiblesQueryPath(pageAccountId, pageQueryRef.current),
          { scroll: false }
        );
      }, SEARCH_URL_DEBOUNCE_MS);
    },
    [router, pageAccountId]
  );

  useEffect(() => {
    return () => {
      if (searchReplaceTimerRef.current != null) {
        window.clearTimeout(searchReplaceTimerRef.current);
      }
    };
  }, []);

  const setMediumFilter = useCallback(
    (next: MarketMediumFilter) => {
      replacePageQuery({
        ...pageQuery,
        kind: next,
        facets: [],
        audioFormat: null,
      });
    },
    [replacePageQuery, pageQuery]
  );

  const replaceDiscoveryParams = useCallback(
    (next: {
      facets?: string[];
      audioFormat?: MarketAudioFormatFilter;
    }) => {
      replacePageQuery({
        ...pageQuery,
        facets: next.facets !== undefined ? next.facets : selectedFacets,
        audioFormat:
          next.audioFormat !== undefined
            ? next.audioFormat
            : audioFormatFilter,
      });
    },
    [replacePageQuery, pageQuery, selectedFacets, audioFormatFilter]
  );

  useEffect(() => {
    if (!ownerAccountId || !loadKey) {
      return;
    }

    const current = holdingsRef.current;
    const sameKeyReady =
      current.loadKey === loadKey &&
      !current.failed &&
      current.items.length > 0;
    // Client-side filter is enough once this owner's vault is fully in memory.
    if (sameKeyReady && (!urlDiscoveryActive || !current.hasMore)) {
      return;
    }

    let cancelled = false;
    const applyPage = (
      items: OwnedScarceItem[],
      nextFromEnd: number,
      hasMore: boolean
    ) => {
      if (cancelled) return;
      setHoldings(
        holdingsStateFromItems(items, nextFromEnd, hasMore, loadKey)
      );
    };

    void (async () => {
      if (seedPromise && retryKey === 0) {
        const data = await seedPromise;
        if (cancelled) return;
        if (
          data.holdings &&
          data.holdings.items.length > 0 &&
          data.accountId &&
          data.accountId === ownerAccountId
        ) {
          putOwnedVaultPage(ownerAccountId, data.holdings);
          applyPage(
            data.holdings.items,
            data.holdings.nextFromEnd,
            data.holdings.hasMore
          );
          if (!urlDiscoveryActive || !data.holdings.hasMore) return;
        }
      }

      try {
        const page = await fetchOwnedScarcesPage(ownerAccountId, {
          pageSize: urlDiscoveryActive ? OWNED_MAX_TOKENS : undefined,
          bypassCache: urlDiscoveryActive,
        });
        if (cancelled) return;
        applyPage(page.items, page.nextFromEnd, page.hasMore);
      } catch {
        if (cancelled) return;
        setHoldings((prev) => {
          if (
            prev.items.length > 0 &&
            prev.loadKey?.startsWith(`${ownerAccountId}:`)
          ) {
            return prev;
          }
          return {
            ...EMPTY_HOLDINGS,
            loadKey,
            failed: true,
          };
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerAccountId, loadKey, urlDiscoveryActive, seedPromise, retryKey]);

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
  }, [
    ownerAccountId,
    holdings.hasMore,
    holdings.nextFromEnd,
    loadingMore,
    setHoldings,
    setLoadingMore,
  ]);

  const sameOwnerHoldings =
    Boolean(ownerAccountId) &&
    holdings.loadKey != null &&
    holdings.loadKey.startsWith(`${ownerAccountId}:`) &&
    holdings.items.length > 0;
  /** Offline library is owner-vault only — skip when browsing someone else. */
  const selfOfflineHoldings = useMemo(
    () => (isSelf ? offlineHoldings : []),
    [isSelf, offlineHoldings]
  );
  const selfOfflineReady = isSelf ? offlineReady : true;
  const vaultItems = useMemo(
    () =>
      sameOwnerHoldings
        ? holdings.items
        : isSelf
          ? selfOfflineHoldings
          : [],
    [sameOwnerHoldings, holdings.items, isSelf, selfOfflineHoldings]
  );
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
  const emptyVault =
    !usingOfflineLibrary &&
    status === 'ready' &&
    Boolean(ownerAccountId) &&
    holdings.items.length === 0;
  const showDiscoveryChrome =
    !showConnectPrompt &&
    !emptyVault &&
    (hasVaultItems || Boolean(pageAccountId) || urlDiscoveryActive);
  const emptySearch =
    vaultItems.length > 0 &&
    trimmedSearch.length > 0 &&
    settledSearch === trimmedSearch &&
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

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreSentinelRef,
    enabled: showLoadMore && !clientDiscoveryFilterActive,
    onIntersect: loadMore,
  });

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
            <div className="collectibles-empty-actions">
              <Link
                className="page-drawer-section-action"
                href={APP_MARKET_PATH}
              >
                Browse Market
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {emptySearch ? (
        <p className="market-page-status">No matches.</p>
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
          <div className="collectibles-empty-actions">
            <button
              type="button"
              className="page-drawer-section-action"
              onClick={() => setMediumFilter('all')}
            >
              Show all
            </button>
          </div>
        </div>
      ) : null}

      {filterAwaitingLoad ? (
        <p className="market-page-status">Looking for matches…</p>
      ) : null}

      {filtered.length > 0 && (status === 'ready' || usingOfflineLibrary) ? (
        <section className="market-section" aria-label="Collectibles">
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
  const dockBackHref = portfolioBackHref ?? APP_HOME_PATH;

  return (
    <OsAppScreen
      title="Collectibles"
      compactChrome
      scrollTuck="search"
      scrollTuckPinned={scrollTuckPinned}
      dockBack
      leading={null}
      backFallbackHref={dockBackHref}
      glassChrome
      scrollRootRef={scrollRootRef}
      actions={<CollectiblesHeaderActions pageAccountId={ownerAccountId} />}
      heading={
        showDiscoveryChrome ? (
          <CollectiblesSearchHeading
            query={searchQuery}
            onQueryChange={setSearchQuery}
          />
        ) : undefined
      }
      toolbar={
        showDiscoveryChrome ? (
          <CollectiblesFilterToolbar
            ready
            medium={mediumFilter}
            audioFormat={audioFormatFilter}
            selectedFacets={selectedFacets}
            onMediumChange={setMediumFilter}
            onAudioFormatChange={(format) =>
              replaceDiscoveryParams({ audioFormat: format })
            }
            onFacetsChange={(facets) => replaceDiscoveryParams({ facets })}
            onClear={() => setMediumFilter('all')}
            onMenuOpenChange={setScrollTuckPinned}
          />
        ) : undefined
      }
    >
      {body}
    </OsAppScreen>
  );
}
