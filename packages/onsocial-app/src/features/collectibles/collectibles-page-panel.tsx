'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesHeaderActions } from '@/features/collectibles/collectibles-header-actions';
import { CollectiblesHoldingRowMenu } from '@/features/collectibles/collectibles-holding-row-menu';
import { CollectiblesVaultLibrary } from '@/features/collectibles/collectibles-vault-library';
import {
  CollectiblesFilterToolbar,
  CollectiblesSearchHeading,
} from '@/features/collectibles/collectibles-page-chrome';
import {
  VAULT_OWNED_MAX_TOKENS,
  fetchOwnedScarcesAll,
  fetchOwnedScarcesPage,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import {
  collectionCreatorNameLine,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  invalidateOwnedVaultCache,
  peekOwnedVaultFaces,
  peekOwnedVaultPage,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import {
  rememberCollectiblesHeldKinds,
  resolveCollectiblesHeldKinds,
} from '@/lib/collectibles-held-kinds';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';
import { CollectiblesLibrarySkeleton } from '@/features/collectibles/collectibles-library-skeleton';
import { COLLECTIBLES_CONNECT_HINT } from '@/features/collectibles/collectibles-vault-voice';
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
import { VAULT_PAGE_CLASS } from '@/lib/os-chrome-page';
import { ListLoadError } from '@/components/panels/list-load-error';
import { OsEmptyAction } from '@/lib/os-empty-action';
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
  COLLECTIBLES_CREATOR_OTHER,
  COLLECTIBLES_LIBRARY_JUMP_MIN,
  filterHoldingsByMedium,
  groupHoldingsLibrary,
  holdingsMatchCreator,
  holdingsMatchQuery,
  holdingsMatchSeries,
  sortHoldingsLibrary,
  toPortfolioHoldingPeek,
  vaultInventoryCreators,
  vaultInventorySeries,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';

/** Debounce search URL writes so seed-key sync does not wipe in-progress typing. */
const SEARCH_URL_DEBOUNCE_MS = 200;

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface HoldingsState {
  items: PortfolioHoldingPeek[];
  owned: OwnedScarceItem[];
  nextFromEnd: number;
  hasMore: boolean;
  /** `${accountId}:${retryKey}` this payload belongs to. */
  loadKey: string | null;
  failed: boolean;
}

const EMPTY_HOLDINGS: HoldingsState = {
  items: [],
  owned: [],
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
    owned: items,
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
  seedHeldKinds = null,
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
  /** Last held kinds from the cookie — skeleton chrome before inventory. */
  seedHeldKinds?: MarketMediumFilter[] | null;
  /** @deprecated Use `shell="portfolio"` */
  embedded?: boolean;
  shell?: 'portfolio' | 'os';
} = {}) {
  const resolvedShell = embedded ? 'portfolio' : shell;
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const router = useRouter();
  const seedKey = collectiblesSeedParamsKey(seedQuery);
  const [pageQuery, setPageQuery] = useState<CollectiblesPageQuery>(seedQuery);
  const searchQuery = pageQuery.q;
  const mediumFilter = pageQuery.kind;
  const facetMedium = normalizeDropFacetMedium(mediumFilter);
  const selectedFacets = pageQuery.facets;
  const audioFormatFilter: MarketAudioFormatFilter = pageQuery.audioFormat;
  const creatorFilter = pageQuery.creator;
  const seriesFilter = pageQuery.series;
  const librarySort = pageQuery.sort;
  const urlDiscoveryActive =
    searchQuery.trim().length > 0 ||
    mediumFilter !== 'all' ||
    selectedFacets.length > 0 ||
    Boolean(audioFormatFilter) ||
    Boolean(creatorFilter) ||
    Boolean(seriesFilter);

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
  const [creatorFaces, setCreatorFaces] = useState<
    Map<string, CollectionCreatorFace>
  >(() => (ownerAccountId ? peekOwnedVaultFaces(ownerAccountId) : new Map()));
  const [sellItem, setSellItem] = useState<OwnedScarceItem | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
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

  const clearDiscovery = useCallback(() => {
    replacePageQuery({
      ...pageQuery,
      kind: 'all',
      facets: [],
      audioFormat: null,
      creator: null,
      series: null,
      sort: 'newest',
    });
  }, [replacePageQuery, pageQuery]);

  const replaceDiscoveryParams = useCallback(
    (next: {
      facets?: string[];
      audioFormat?: MarketAudioFormatFilter;
      creator?: string | null;
      series?: string | null;
    }) => {
      replacePageQuery({
        ...pageQuery,
        facets: next.facets !== undefined ? next.facets : selectedFacets,
        audioFormat:
          next.audioFormat !== undefined
            ? next.audioFormat
            : audioFormatFilter,
        creator: next.creator !== undefined ? next.creator : creatorFilter,
        series: next.series !== undefined ? next.series : seriesFilter,
      });
    },
    [
      replacePageQuery,
      pageQuery,
      selectedFacets,
      audioFormatFilter,
      creatorFilter,
      seriesFilter,
    ]
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
      hasMore: boolean,
      faces?: Map<string, CollectionCreatorFace>
    ) => {
      if (cancelled) return;
      if (faces && faces.size > 0) {
        setCreatorFaces((prev) => {
          const next = new Map(prev);
          for (const [id, face] of faces) next.set(id, face);
          return next;
        });
      }
      rememberCollectiblesHeldKinds(ownerAccountId, items);
      putOwnedVaultPage(
        ownerAccountId,
        {
          items,
          nextFromEnd,
          hasMore,
        },
        faces && faces.size > 0 ? Object.fromEntries(faces) : undefined
      );
      setHoldings(
        holdingsStateFromItems(items, nextFromEnd, hasMore, loadKey)
      );
    };

    const facesForItems = async (
      items: OwnedScarceItem[]
    ): Promise<Map<string, CollectionCreatorFace>> => {
      const ids = [
        ...new Set(
          items
            .map((item) => item.creatorId?.trim())
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (ids.length === 0) return new Map();
      const { fetchCollectionCreatorFaces } = await import(
        '@/features/scarces/collection-creator-face'
      );
      return fetchCollectionCreatorFaces(
        createReadOnlyOnSocialClient(),
        ids
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
          const seedFaces = new Map(
            Object.entries(data.creatorFaces ?? {})
          );
          const faces =
            seedFaces.size > 0
              ? seedFaces
              : await facesForItems(data.holdings.items);
          if (cancelled) return;
          applyPage(
            data.holdings.items,
            data.holdings.nextFromEnd,
            data.holdings.hasMore,
            faces
          );
          if (!urlDiscoveryActive || !data.holdings.hasMore) return;
        }
      }

      try {
        const page = urlDiscoveryActive
          ? await fetchOwnedScarcesAll(ownerAccountId, {
              maxTokens: VAULT_OWNED_MAX_TOKENS,
              bypassCache: true,
            })
          : await fetchOwnedScarcesPage(ownerAccountId);
        if (cancelled) return;
        const faces = await facesForItems(page.items);
        if (cancelled) return;
        applyPage(page.items, page.nextFromEnd, page.hasMore, faces);
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
          const ownedSeen = new Set(prev.owned.map((item) => item.tokenId));
          const nextItems = [...prev.items];
          const nextOwned = [...prev.owned];
          for (const row of page.items) {
            const peek = toPortfolioHoldingPeek(row);
            if (!seen.has(peek.tokenId)) {
              seen.add(peek.tokenId);
              nextItems.push(peek);
            }
            if (!ownedSeen.has(row.tokenId)) {
              ownedSeen.add(row.tokenId);
              nextOwned.push(row);
            }
          }
          return {
            ...prev,
            items: nextItems,
            owned: nextOwned,
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
    if (creatorFilter) {
      byKind = byKind.filter((item) =>
        holdingsMatchCreator(item, creatorFilter)
      );
    }
    if (seriesFilter) {
      byKind = byKind.filter((item) => holdingsMatchSeries(item, seriesFilter));
    }
    if (!trimmedSearch) return byKind;
    return byKind.filter((item) => holdingsMatchQuery(item, trimmedSearch));
  }, [
    vaultItems,
    mediumFilter,
    facetMedium,
    audioFormatFilter,
    selectedFacets,
    creatorFilter,
    seriesFilter,
    trimmedSearch,
  ]);

  const creatorIdsKey = useMemo(() => {
    const ids = [
      ...new Set(
        vaultItems
          .map((item) => item.creatorId?.trim())
          .filter((id): id is string => Boolean(id))
      ),
    ].sort();
    return ids.join('|');
  }, [vaultItems]);

  useEffect(() => {
    if (!creatorIdsKey) {
      setCreatorFaces(new Map());
      return;
    }
    const ids = creatorIdsKey.split('|');
    let cancelled = false;
    void (async () => {
      const missing = ids.filter((id) => !creatorFaces.has(id));
      if (missing.length === 0) return;
      const { fetchCollectionCreatorFaces } = await import(
        '@/features/scarces/collection-creator-face'
      );
      const faces = await fetchCollectionCreatorFaces(
        createReadOnlyOnSocialClient(),
        missing
      );
      if (cancelled) return;
      setCreatorFaces((prev) => {
        const next = new Map(prev);
        for (const [id, face] of faces) next.set(id, face);
        if (ownerAccountId) {
          const cached = peekOwnedVaultPage(ownerAccountId);
          if (cached) {
            putOwnedVaultPage(
              ownerAccountId,
              cached,
              Object.fromEntries(next)
            );
          }
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Face map is read for a missing-id skip; holdings apply writes it first.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- creatorIdsKey gates fetch
  }, [creatorIdsKey, ownerAccountId]);

  const displayNames = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const [id, face] of creatorFaces) {
      map.set(id, collectionCreatorNameLine(id, face.displayName));
    }
    return map;
  }, [creatorFaces]);

  const displayGroups = useMemo(
    () =>
      sortHoldingsLibrary(groupHoldingsLibrary(filtered), librarySort, displayNames),
    [filtered, librarySort, displayNames]
  );
  const inventorySource = useMemo(
    () => filterHoldingsByMedium(vaultItems, mediumFilter),
    [vaultItems, mediumFilter]
  );
  const vaultCreators = useMemo(() => {
    return vaultInventoryCreators(inventorySource).map((entry) => ({
      id: entry.id,
      label:
        entry.id === COLLECTIBLES_CREATOR_OTHER
          ? 'Other'
          : collectionCreatorNameLine(
              entry.id,
              creatorFaces.get(entry.id)?.displayName
            ),
    }));
  }, [inventorySource, creatorFaces]);
  const vaultSeries = useMemo(() => {
    return vaultInventorySeries(inventorySource).map((entry) => ({
      id: entry.id,
      label: entry.label,
    }));
  }, [inventorySource]);
  const showCreatorHeadings =
    displayGroups.length > 1 || Boolean(creatorFilter);
  const jumpCreators = useMemo(
    () =>
      displayGroups.length >= COLLECTIBLES_LIBRARY_JUMP_MIN
        ? displayGroups.map((group) => ({
            id: group.creatorKey,
            label: group.creatorId
              ? collectionCreatorNameLine(
                  group.creatorId,
                  creatorFaces.get(group.creatorId)?.displayName
                )
              : 'Other',
          }))
        : [],
    [displayGroups, creatorFaces]
  );
  const ownedByToken = useMemo(() => {
    const map = new Map<string, OwnedScarceItem>();
    for (const row of holdings.owned) {
      map.set(row.tokenId, row);
    }
    return map;
  }, [holdings.owned]);

  const refreshOwned = useCallback(() => {
    if (viewerAccountId) invalidateOwnedVaultCache(viewerAccountId);
    setRetryKey((n) => n + 1);
  }, [viewerAccountId]);

  const clientDiscoveryFilterActive =
    trimmedSearch.length > 0 ||
    mediumFilter !== 'all' ||
    (facetMedium != null &&
      (selectedFacets.length > 0 || Boolean(audioFormatFilter))) ||
    Boolean(creatorFilter) ||
    Boolean(seriesFilter);
  const facetOrFormatActive =
    (facetMedium != null &&
      (selectedFacets.length > 0 || Boolean(audioFormatFilter))) ||
    Boolean(creatorFilter) ||
    Boolean(seriesFilter);

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

  const portfolioBackHref =
    resolvedShell === 'portfolio' && pageAccountId
      ? portfolioPath(pageAccountId)
      : null;
  const dockBackHref = portfolioBackHref ?? APP_HOME_PATH;

  const body = (
    <div
      className={VAULT_PAGE_CLASS}
      data-collectibles-back={dockBackHref}
    >
      {showVaultSkeleton ? (
        <section
          className="market-section collectibles-library"
          aria-busy="true"
          aria-label="Collectibles"
        >
          <p className="sr-only">Loading collectibles…</p>
          <CollectiblesLibrarySkeleton />
        </section>
      ) : null}

      {showConnectPrompt ? (
        <div className="market-page-empty">
          <p className="market-page-empty-copy">{COLLECTIBLES_CONNECT_HINT}</p>
          <div className="collectibles-empty-actions">
            <OsEmptyAction href={APP_MARKET_PATH}>Browse Market</OsEmptyAction>
          </div>
        </div>
      ) : null}

      {ownerAccountId && status === 'error' && !usingOfflineLibrary ? (
        <ListLoadError
          message={
            isSelf
              ? 'Couldn’t load your collectibles.'
              : 'Couldn’t load collectibles.'
          }
          onRetry={() => setRetryKey((n) => n + 1)}
        />
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
              <OsEmptyAction href={APP_MARKET_PATH}>Browse Market</OsEmptyAction>
              <OsEmptyAction href={APP_DROP_CREATE_PATH}>
                Create a drop
              </OsEmptyAction>
            </div>
          ) : (
            <div className="collectibles-empty-actions">
              <OsEmptyAction href={APP_MARKET_PATH}>Browse Market</OsEmptyAction>
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
            <OsEmptyAction onClick={clearDiscovery}>Show all</OsEmptyAction>
          </div>
        </div>
      ) : null}

      {filterAwaitingLoad ? (
        <p className="market-page-status">Looking for matches…</p>
      ) : null}

      {filtered.length > 0 && (status === 'ready' || usingOfflineLibrary) ? (
        <CollectiblesVaultLibrary
          groups={displayGroups}
          ownedByToken={ownedByToken}
          showCreatorHeadings={showCreatorHeadings}
          selectedCreator={creatorFilter}
          creatorFaces={creatorFaces}
          onSelectCreator={(creatorKey) =>
            replaceDiscoveryParams({
              creator: creatorFilter === creatorKey ? null : creatorKey,
            })
          }
          renderOwnerMenu={
            isSelf
              ? (owned) => (
                  <CollectiblesHoldingRowMenu
                    item={owned}
                    onList={() => {
                      setSellItem(owned);
                      setSellOpen(true);
                    }}
                    onDelisted={refreshOwned}
                  />
                )
              : undefined
          }
        />
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

  return (
    <>
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
              heldKinds={resolveCollectiblesHeldKinds({
                items: vaultItems,
                selected: mediumFilter,
                accountId: ownerAccountId,
                seedHeldKinds,
              })}
              vaultCreators={vaultCreators}
              vaultSeries={vaultSeries}
              selectedCreator={creatorFilter}
              selectedSeries={seriesFilter}
              sort={librarySort}
              jumpCreators={jumpCreators}
              onSortChange={(sort) =>
                replacePageQuery({ ...pageQuery, sort })
              }
              onMediumChange={setMediumFilter}
              onAudioFormatChange={(format) =>
                replaceDiscoveryParams({ audioFormat: format })
              }
              onFacetsChange={(facets) => replaceDiscoveryParams({ facets })}
              onCreatorChange={(creator) => replaceDiscoveryParams({ creator })}
              onSeriesChange={(series) => replaceDiscoveryParams({ series })}
              onClear={clearDiscovery}
              onMenuOpenChange={setScrollTuckPinned}
            />
          ) : undefined
        }
      >
        {body}
      </OsAppScreen>
      {isSelf ? (
        <ScarceSellSheet
          open={sellOpen && sellItem != null}
          item={sellItem}
          sellerAccountId={viewerAccountId}
          onOpenChange={(open) => {
            setSellOpen(open);
            if (!open) setSellItem(null);
          }}
          onListed={() => {
            setSellOpen(false);
            setSellItem(null);
            refreshOwned();
          }}
        />
      ) : null}
    </>
  );
}
