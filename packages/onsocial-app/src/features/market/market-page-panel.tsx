'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MultiplyIcon,
  ShopFillIcon,
  StarMovingFillIcon,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  MarketHeadingActions,
  MarketSearchHeading,
} from '@/features/market/market-heading';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { MarketListingRow } from '@/features/market/market-listing-row';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import {
  listingFilterFromSort,
  type MarketListingFilter,
} from '@/features/market/market-listing-filter';
import { MarketListingToolbar } from '@/features/market/market-listing-toolbar';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import {
  EMPTY_MARKET_PAGE_QUERY,
  marketBrowseParamsKey,
  marketQueryPath,
  marketSeedParamsKey,
  type MarketPageData,
  type MarketPageQuery,
} from '@/lib/load-market-page';
import {
  auctionExpiresAtMs,
  collectionIdFromTokenId,
  fetchMarketListings,
  fetchMarketSales,
  fetchOwnedScarcesPage,
  excludeOwnedNativeListings,
  invalidateLiveListingsCache,
  isPrimaryThoughtListing,
  listingCreatorAccountId,
  marketListingRowKey,
  viewerOwnsRelatedEdition,
  type MarketListingItem,
  type MarketListingsPage,
  type MarketListingSort,
  type MarketSaleItem,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { invalidateOwnedVaultCache } from '@/features/market/owned-vault-cache';
import { MarketOfferRow } from '@/features/market/market-offer-row';
import { MarketOwnedRow } from '@/features/market/market-owned-row';
import { MarketSaleRow } from '@/features/market/market-sale-row';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import type { ScarceBidSuccessDetail } from '@/features/scarces/scarce-bid-form';
import {
  executeListingAction,
  type ListingActionItem,
} from '@/features/scarces/listing-actions';
import {
  ScarceBidSheet,
  type ScarceBidListing,
} from '@/features/scarces/scarce-bid-sheet';
import {
  ScarceBuySheet,
  type ScarceBuyListing,
} from '@/features/scarces/scarce-buy-sheet';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import {
  ScarceOfferSheet,
  type ScarceOfferListing,
} from '@/features/scarces/scarce-offer-sheet';
import {
  fetchMyOpenTokenOffers,
  fetchOfferSummariesByTokenIds,
  type MyOpenTokenOffer,
  type TokenOfferSummary,
} from '@/features/scarces/scarce-offers';
import { ScarceOffersSheet } from '@/features/scarces/scarce-offers-sheet';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';
import { accountIdsEqual } from '@/lib/account-match';
import { APP_HOME_PATH, appPath } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function listingMatchesQuery(item: MarketListingItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.title, item.creatorId, item.tokenId, item.listingId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

type LoadStatus = 'loading' | 'ready' | 'error';

/** Initial Recent sales rows; expand shows the rest of the fetched window. */
const RECENT_SALES_PREVIEW = 8;

/** Catalog page size for infinite scroll / Show more. */
const LISTINGS_PAGE_SIZE = 40;
/** Debounce before a search keystroke becomes an indexer query. */
const SEARCH_DEBOUNCE_MS = 300;
/** Mute last rows only if the live check is still in flight — skip flicker on fast hits. */
const CATALOG_REFRESH_MUTE_MS = 160;
/** Keep recent catalog pages so flipping back is instant. */
const CATALOG_CACHE_TTL_MS = 90_000;
const CATALOG_CACHE_MAX_ENTRIES = 12;

type MarketCatalogCacheEntry = {
  items: MarketListingItem[];
  nextOffset: number;
  hasMore: boolean;
  at: number;
};

/** Cache key omits retry — Retry always bypasses the map. */
function marketCatalogCacheKey(opts: {
  listingFilter: MarketListingFilter;
  listingSort: MarketListingSort;
  search: string;
  creatorFilter: string;
  appFilter: string;
  discoveryParamsKey: string;
}): string {
  return [
    opts.listingFilter,
    opts.listingSort,
    opts.search,
    opts.creatorFilter,
    opts.appFilter,
    opts.discoveryParamsKey,
  ].join('|');
}

/** Server catalog pages for the current filter / sort / search params. */
interface ListingsState {
  /** Params key the loaded pages belong to; null until the first page lands. */
  paramsKey: string | null;
  items: MarketListingItem[];
  nextOffset: number;
  hasMore: boolean;
  failed: boolean;
}

const EMPTY_LISTINGS: ListingsState = {
  paramsKey: null,
  items: [],
  nextOffset: 0,
  hasMore: false,
  failed: false,
};

/** Newest-first pages of wallet-owned scarces (RPC, capped). */
interface OwnedState {
  items: OwnedScarceItem[];
  nextFromEnd: number;
  hasMore: boolean;
  loaded: boolean;
}

const EMPTY_OWNED: OwnedState = {
  items: [],
  nextFromEnd: 0,
  hasMore: false,
  loaded: false,
};

function filterToKinds(
  filter: MarketListingFilter
): ('lazy' | 'native' | 'auction')[] | undefined {
  if (filter === 'auctions') return ['auction'];
  if (filter === 'fixed') return ['lazy', 'native'];
  return undefined;
}

function dedupeListings(items: MarketListingItem[]): MarketListingItem[] {
  const byKey = new Map<string, MarketListingItem>();
  for (const item of items) byKey.set(marketListingRowKey(item), item);
  return [...byKey.values()];
}

function catalogPageMatches(
  current: ListingsState,
  page: MarketListingsPage,
  paramsKey: string
): boolean {
  if (current.paramsKey !== paramsKey) return false;
  if (current.hasMore !== page.hasMore) return false;
  if (current.nextOffset !== page.nextOffset) return false;
  if (current.items.length !== page.items.length) return false;
  return current.items.every(
    (item, index) =>
      marketListingRowKey(item) === marketListingRowKey(page.items[index]!)
  );
}

function sourcePostCoords(
  path: string | undefined
): { author: string; postId: string } | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2] };
}

export function MarketPagePanel({
  seedQuery = EMPTY_MARKET_PAGE_QUERY,
  seedPromise = null,
}: {
  seedQuery?: MarketPageQuery;
  seedPromise?: Promise<MarketPageData | null> | null;
} = {}) {
  const { accountId: viewerAccountId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const router = useRouter();
  const seedKey = marketSeedParamsKey(seedQuery);
  const [query, setQuery] = useState<MarketPageQuery>(seedQuery);
  const creatorFilter = query.creator;
  const appFilter = query.app;
  const mediumFilter = query.kind;
  const facetMedium = normalizeDropFacetMedium(mediumFilter);
  const selectedFacets = query.facets;
  const audioFormatFilter = query.audioFormat;
  const urlSort = query.sort;
  const [retryKey, setRetryKey] = useState(0);
  const [listingsState, setListingsState] =
    useState<ListingsState>(EMPTY_LISTINGS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [sales, setSales] = useState<MarketSaleItem[] | null>(null);
  const [ownedState, setOwnedState] = useState<OwnedState>(EMPTY_OWNED);
  const [ownedLoadingMore, setOwnedLoadingMore] = useState(false);
  const [buyListing, setBuyListing] = useState<ScarceBuyListing | null>(null);
  const [bidListing, setBidListing] = useState<ScarceBidListing | null>(null);
  const [offerListing, setOfferListing] = useState<ScarceOfferListing | null>(
    null
  );
  const [sellItem, setSellItem] = useState<OwnedScarceItem | null>(null);
  const [offersItem, setOffersItem] = useState<OwnedScarceItem | null>(null);
  const [cancelRowKey, setCancelRowKey] = useState<string | null>(null);
  const [delistTokenId, setDelistTokenId] = useState<string | null>(null);
  const [settleTokenId, setSettleTokenId] = useState<string | null>(null);
  const [listingFilter, setListingFilter] = useState<MarketListingFilter>(() =>
    listingFilterFromSort(urlSort)
  );
  const [listingSort, setListingSort] = useState<MarketListingSort>(() => urlSort);
  const [listingQuery, setListingQuery] = useState('');
  const [salesExpanded, setSalesExpanded] = useState(false);
  useEffect(() => {
    setQuery(seedQuery);
    setListingSort((current) =>
      current === seedQuery.sort ? current : seedQuery.sort
    );
    if (seedQuery.sort === 'ending') {
      setListingFilter('auctions');
    }
  }, [seedKey, seedQuery]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [offerByToken, setOfferByToken] = useState<
    Map<string, TokenOfferSummary>
  >(() => new Map());
  const [myOffers, setMyOffers] = useState<MyOpenTokenOffer[]>([]);
  const [offersRevision, setOffersRevision] = useState(0);
  const listingsSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  /** Bumped on each first-page fetch so in-flight loadMore cannot append stale pages. */
  const listingsFetchGenRef = useRef(0);
  const catalogCacheRef = useRef<Map<string, MarketCatalogCacheEntry>>(
    new Map()
  );
  /** Last non-search catalog — restore instantly when the field X clears a miss. */
  const lastBrowseCatalogRef = useRef<Omit<
    MarketCatalogCacheEntry,
    'at'
  > | null>(null);
  const normalizedListingQuery = listingQuery.trim().toLowerCase();
  const searching = normalizedListingQuery.length > 0;

  // Debounced indexer search; client filter covers the typing gap below.
  // Clearing the field flushes immediately so browse listings do not wait.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const trimmed = listingQuery.trim();
    if (!trimmed) {
      setDebouncedQuery((current) => (current === '' ? current : ''));
      return;
    }
    const id = window.setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [listingQuery]);

  const writeCatalogCache = useCallback(
    (key: string, entry: Omit<MarketCatalogCacheEntry, 'at'>) => {
      const cache = catalogCacheRef.current;
      cache.delete(key);
      cache.set(key, { ...entry, at: Date.now() });
      while (cache.size > CATALOG_CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest == null) break;
        cache.delete(oldest);
      }
    },
    []
  );

  const replaceQuery = useCallback(
    (next: MarketPageQuery) => {
      setQuery(next);
      router.replace(marketQueryPath(next), { scroll: false });
    },
    [router]
  );

  const replaceSortInUrl = useCallback(
    (nextSort: MarketListingSort) => {
      replaceQuery({ ...query, sort: nextSort });
    },
    [query, replaceQuery]
  );

  const setFilter = useCallback(
    (next: MarketListingFilter) => {
      setListingFilter(next);
      if (next === 'fixed') {
        setListingSort((current) => {
          if (current !== 'ending') return current;
          replaceSortInUrl('newest');
          return 'newest';
        });
      }
    },
    [replaceSortInUrl]
  );

  // Ending soon is auction clocks only — keep the Auctions tab in sync.
  const setSort = useCallback(
    (next: MarketListingSort) => {
      setListingSort(next);
      if (next === 'ending') {
        setListingFilter('auctions');
      }
      replaceSortInUrl(next);
    },
    [replaceSortInUrl]
  );

  const discoveryParamsKey = `${mediumFilter}|${selectedFacets.join(',')}|${audioFormatFilter ?? ''}`;
  const listingsParamsKey = marketBrowseParamsKey({
    retryKey,
    listingFilter,
    sort: listingSort,
    search: debouncedQuery,
    creator: creatorFilter,
    app: appFilter,
    kind: mediumFilter,
    facets: selectedFacets,
    audioFormat: audioFormatFilter,
  });
  const catalogCacheKey = marketCatalogCacheKey({
    listingFilter,
    listingSort,
    search: debouncedQuery.toLowerCase(),
    creatorFilter,
    appFilter,
    discoveryParamsKey,
  });
  const browseListingsParamsKey = marketBrowseParamsKey({
    retryKey,
    listingFilter,
    sort: listingSort,
    search: '',
    creator: creatorFilter,
    app: appFilter,
    kind: mediumFilter,
    facets: selectedFacets,
    audioFormat: audioFormatFilter,
  });
  const browseCatalogCacheKey = marketCatalogCacheKey({
    listingFilter,
    listingSort,
    search: '',
    creatorFilter,
    appFilter,
    discoveryParamsKey,
  });

  const rememberBrowseCatalog = useCallback(
    (entry: Omit<MarketCatalogCacheEntry, 'at'>) => {
      lastBrowseCatalogRef.current = {
        items: entry.items,
        nextOffset: entry.nextOffset,
        hasMore: entry.hasMore,
      };
    },
    []
  );

  const handleListingQueryChange = useCallback(
    (next: string) => {
      setListingQuery(next);
      if (next.trim()) return;
      setDebouncedQuery('');
      const cached = catalogCacheRef.current.get(browseCatalogCacheKey);
      const snap =
        cached != null && Date.now() - cached.at < CATALOG_CACHE_TTL_MS
          ? cached
          : lastBrowseCatalogRef.current;
      if (!snap) return;
      setListingsState({
        paramsKey: browseListingsParamsKey,
        items: snap.items,
        nextOffset: snap.nextOffset,
        hasMore: snap.hasMore,
        failed: false,
      });
      setCatalogRefreshing(false);
    },
    [browseCatalogCacheKey, browseListingsParamsKey]
  );

  const clearNarrowFilter = useCallback(() => {
    replaceQuery({
      ...EMPTY_MARKET_PAGE_QUERY,
      sort: query.sort,
    });
  }, [query.sort, replaceQuery]);

  const setMediumFilter = useCallback(
    (next: MarketMediumFilter) => {
      replaceQuery({
        ...query,
        kind: next,
        facets: [],
        audioFormat: null,
      });
    },
    [query, replaceQuery]
  );

  const replaceDiscoveryParams = useCallback(
    (next: { facets?: string[]; audioFormat?: MarketAudioFormatFilter }) => {
      replaceQuery({
        ...query,
        facets: next.facets !== undefined ? next.facets : query.facets,
        audioFormat:
          next.audioFormat !== undefined ? next.audioFormat : query.audioFormat,
      });
    },
    [query, replaceQuery]
  );

  // First catalog page. Last rows stay up (muted if the check is slow);
  // live page replaces them. Skeleton only when we have nothing to show.
  useEffect(() => {
    const gen = ++listingsFetchGenRef.current;
    setLoadingMore(false);
    setLoadMoreFailed(false);

    const bypassCache = retryKey > 0;
    const cached = bypassCache
      ? undefined
      : catalogCacheRef.current.get(catalogCacheKey);
    const cacheFresh =
      cached != null && Date.now() - cached.at < CATALOG_CACHE_TTL_MS;
    const browseSnap = lastBrowseCatalogRef.current;

    let paintedRows = false;
    if (cacheFresh && cached) {
      if (!debouncedQuery) {
        rememberBrowseCatalog(cached);
      }
      setListingsState({
        paramsKey: listingsParamsKey,
        items: cached.items,
        nextOffset: cached.nextOffset,
        hasMore: cached.hasMore,
        failed: false,
      });
      paintedRows = cached.items.length > 0;
    } else if (!debouncedQuery && browseSnap && browseSnap.items.length > 0) {
      setListingsState((current) =>
        current.items.length > 0
          ? current
          : {
              paramsKey: listingsParamsKey,
              items: browseSnap.items,
              nextOffset: browseSnap.nextOffset,
              hasMore: browseSnap.hasMore,
              failed: false,
            }
      );
      paintedRows = true;
    }

    let cancelled = false;
    let muteTimer: number | null = null;
    const finishRefresh = () => {
      if (muteTimer != null) {
        window.clearTimeout(muteTimer);
        muteTimer = null;
      }
      setCatalogRefreshing(false);
    };

    if (paintedRows) {
      setCatalogRefreshing(false);
      muteTimer = window.setTimeout(() => {
        if (!cancelled) setCatalogRefreshing(true);
      }, CATALOG_REFRESH_MUTE_MS);
    } else {
      setCatalogRefreshing(true);
    }

    const applyPage = (page: MarketListingsPage) => {
      if (cancelled || gen !== listingsFetchGenRef.current) return;
      writeCatalogCache(catalogCacheKey, {
        items: page.items,
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
      });
      if (!debouncedQuery) {
        rememberBrowseCatalog({
          items: page.items,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
        });
      }
      setListingsState((current) => {
        if (catalogPageMatches(current, page, listingsParamsKey)) {
          return current.failed ? { ...current, failed: false } : current;
        }
        return {
          paramsKey: listingsParamsKey,
          items: page.items,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
          failed: false,
        };
      });
      finishRefresh();
    };

    const applyFail = () => {
      if (cancelled || gen !== listingsFetchGenRef.current) return;
      finishRefresh();
      if (cacheFresh && cached) return;
      setListingsState((current) => ({
        ...current,
        paramsKey: listingsParamsKey,
        failed: current.items.length === 0,
      }));
    };

    const runClientFetch = () => {
      const kinds =
        listingSort === 'ending'
          ? (['auction'] as const)
          : filterToKinds(listingFilter);
      return fetchMarketListings({
        limit: LISTINGS_PAGE_SIZE,
        ...(kinds ? { kinds: [...kinds] } : {}),
        ...(debouncedQuery ? { search: debouncedQuery } : {}),
        ...(creatorFilter ? { sellerId: creatorFilter } : {}),
        ...(appFilter ? { appId: appFilter } : {}),
        ...(mediumFilter !== 'all' ? { mediumKind: mediumFilter } : {}),
        ...(selectedFacets.length ? { facets: selectedFacets } : {}),
        ...(audioFormatFilter ? { audioFormat: audioFormatFilter } : {}),
        ...(mediumFilter === 'all' ? { excludePrimaryThoughts: true } : {}),
        sort: listingSort,
      }).then(applyPage, applyFail);
    };

    const useSeed = Boolean(seedPromise) && listingsParamsKey === seedKey;
    if (useSeed && seedPromise) {
      void seedPromise.then((data) => {
        if (cancelled || gen !== listingsFetchGenRef.current) return;
        if (data) {
          applyPage(data.listings);
          return;
        }
        void runClientFetch();
      }, () => {
        void runClientFetch();
      });
    } else {
      void runClientFetch();
    }

    return () => {
      cancelled = true;
      if (muteTimer != null) {
        window.clearTimeout(muteTimer);
      }
    };
  }, [
    listingsParamsKey,
    catalogCacheKey,
    listingFilter,
    listingSort,
    debouncedQuery,
    creatorFilter,
    appFilter,
    mediumFilter,
    selectedFacets,
    audioFormatFilter,
    retryKey,
    seedPromise,
    seedKey,
    writeCatalogCache,
    rememberBrowseCatalog,
  ]);

  const listingsReady = listingsState.paramsKey === listingsParamsKey;
  const listingsFailed = listingsReady && listingsState.failed;

  const loadMoreListings = useCallback(() => {
    if (!listingsReady || listingsState.failed) return;
    if (!listingsState.hasMore || loadingMore) return;
    const gen = listingsFetchGenRef.current;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    const kinds =
      listingSort === 'ending'
        ? (['auction'] as const)
        : filterToKinds(listingFilter);
    fetchMarketListings({
      limit: LISTINGS_PAGE_SIZE,
      offset: listingsState.nextOffset,
      ...(kinds ? { kinds: [...kinds] } : {}),
      ...(debouncedQuery ? { search: debouncedQuery } : {}),
      ...(creatorFilter ? { sellerId: creatorFilter } : {}),
      ...(appFilter ? { appId: appFilter } : {}),
      ...(mediumFilter !== 'all' ? { mediumKind: mediumFilter } : {}),
      ...(selectedFacets.length ? { facets: selectedFacets } : {}),
      ...(audioFormatFilter ? { audioFormat: audioFormatFilter } : {}),
      ...(mediumFilter === 'all' ? { excludePrimaryThoughts: true } : {}),
      sort: listingSort,
    })
      .then((page) => {
        if (gen !== listingsFetchGenRef.current) return;
        setLoadMoreFailed(false);
        setListingsState((current) => {
          if (current.paramsKey !== listingsParamsKey) return current;
          const items = dedupeListings([...current.items, ...page.items]);
          const next = {
            ...current,
            items,
            nextOffset: page.nextOffset,
            hasMore: page.hasMore,
          };
          writeCatalogCache(catalogCacheKey, {
            items: next.items,
            nextOffset: next.nextOffset,
            hasMore: next.hasMore,
          });
          return next;
        });
      })
      .catch(() => {
        if (gen !== listingsFetchGenRef.current) return;
        // Keep hasMore so Retry can page again; loaded rows stay usable.
        setLoadMoreFailed(true);
      })
      .finally(() => {
        if (gen === listingsFetchGenRef.current) {
          setLoadingMore(false);
        }
      });
  }, [
    listingsReady,
    listingsState.failed,
    listingsState.hasMore,
    listingsState.nextOffset,
    loadingMore,
    listingFilter,
    listingSort,
    debouncedQuery,
    creatorFilter,
    appFilter,
    mediumFilter,
    selectedFacets,
    audioFormatFilter,
    listingsParamsKey,
    catalogCacheKey,
    writeCatalogCache,
  ]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: listingsSentinelRef,
    enabled:
      listingsReady &&
      !listingsState.failed &&
      listingsState.hasMore &&
      !loadingMore &&
      !loadMoreFailed &&
      !catalogRefreshing,
    onIntersect: loadMoreListings,
    rootMargin: '240px 0px',
  });

  // Soft-fill creator faces when SSR/page load missed them (same as Drops).
  useEffect(() => {
    const missing = listingsState.items.filter((item) => {
      const id = listingCreatorAccountId(item);
      return (
        id &&
        item.creatorAvatarUrl === undefined &&
        item.creatorDisplayName === undefined
      );
    });
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { fetchCollectionCreatorFaces } = await import(
        '@/features/scarces/collection-creator-face'
      );
      const { createReadOnlyOnSocialClient } = await import(
        '@/lib/create-readonly-onsocial-client'
      );
      const faces = await fetchCollectionCreatorFaces(
        createReadOnlyOnSocialClient(),
        missing.map((item) => listingCreatorAccountId(item))
      );
      if (cancelled) return;
      setListingsState((current) => ({
        ...current,
        items: current.items.map((item) => {
          const face = faces.get(listingCreatorAccountId(item));
          if (!face) return item;
          if (
            item.creatorAvatarUrl !== undefined ||
            item.creatorDisplayName !== undefined
          ) {
            return item;
          }
          return {
            ...item,
            creatorAvatarUrl: face.avatarUrl,
            creatorDisplayName: face.displayName,
          };
        }),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [listingsState.items]);

  useEffect(() => {
    let cancelled = false;
    setSalesExpanded(false);

    const applySales = (rows: MarketSaleItem[]) => {
      if (!cancelled) setSales(rows);
    };
    const applyEmpty = () => {
      if (!cancelled) setSales([]);
    };

    // Seller / app browse hides Recent sales — don't fetch a list we never show.
    if (creatorFilter || appFilter) {
      applyEmpty();
      return () => {
        cancelled = true;
      };
    }

    // First paint: the page seed already includes sales for the open catalog.
    if (retryKey === 0 && seedPromise) {
      void seedPromise.then((data) => {
        if (cancelled) return;
        if (data) {
          applySales(data.sales);
          return;
        }
        fetchMarketSales().then(applySales, applyEmpty);
      }, applyEmpty);
    } else {
      fetchMarketSales().then(applySales, applyEmpty);
    }

    return () => {
      cancelled = true;
    };
  }, [retryKey, seedPromise, creatorFilter, appFilter]);

  // “Yours” loads independently so a slow RPC vault never blocks browse.
  useEffect(() => {
    let cancelled = false;
    setOwnedState(EMPTY_OWNED);
    if (!viewerAccountId) {
      setOwnedState({ ...EMPTY_OWNED, loaded: true });
      return;
    }
    fetchOwnedScarcesPage(viewerAccountId).then(
      (page) => {
        if (cancelled) return;
        setOwnedState({
          items: page.items,
          nextFromEnd: page.nextFromEnd,
          hasMore: page.hasMore,
          loaded: true,
        });
      },
      () => {
        if (!cancelled) setOwnedState({ ...EMPTY_OWNED, loaded: true });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [retryKey, viewerAccountId]);

  const loadMoreOwned = useCallback(() => {
    if (!viewerAccountId || !ownedState.hasMore || ownedLoadingMore) return;
    setOwnedLoadingMore(true);
    fetchOwnedScarcesPage(viewerAccountId, {
      fromEnd: ownedState.nextFromEnd,
    })
      .then((page) => {
        setOwnedState((current) => ({
          ...current,
          items: [...current.items, ...page.items],
          nextFromEnd: page.nextFromEnd,
          hasMore: page.hasMore,
        }));
      })
      .catch(() => {
        setOwnedState((current) => ({ ...current, hasMore: false }));
      })
      .finally(() => {
        setOwnedLoadingMore(false);
      });
  }, [
    viewerAccountId,
    ownedState.hasMore,
    ownedState.nextFromEnd,
    ownedLoadingMore,
  ]);

  const status: LoadStatus =
    listingsState.paramsKey === null
      ? 'loading'
      : listingsFailed && (sales?.length ?? 0) === 0
        ? 'error'
        : 'ready';
  const listings = listingsState.items;
  const owned = ownedState.items;
  const salesRows = sales ?? [];
  const ownedTokenIdSet = new Set(owned.map((item) => item.tokenId));
  // Default All = drops + secondary. Primary thought post-mints live under Thoughts.
  const browseListings = excludeOwnedNativeListings(
    mediumFilter === 'all'
      ? listings.filter((item) => !isPrimaryThoughtListing(item))
      : listings,
    ownedTokenIdSet
  );

  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    const tokenIds = [
      ...owned.map((item) => item.tokenId),
      ...listings.map((item) => item.tokenId?.trim() ?? '').filter(Boolean),
    ];
    void Promise.all([
      fetchOfferSummariesByTokenIds(tokenIds),
      viewerAccountId
        ? fetchMyOpenTokenOffers(viewerAccountId)
        : Promise.resolve([] as MyOpenTokenOffer[]),
    ]).then(([summaries, mine]) => {
      if (cancelled) return;
      setOfferByToken(summaries);
      setMyOffers(mine);
    });
    return () => {
      cancelled = true;
    };
  }, [retryKey, viewerAccountId, offersRevision, status, owned, listings]);

  // Server pages arrive filtered + sorted; the client passes only re-apply
  // the same rules so stale items behave while a params change is in flight.
  const typedListings =
    listingFilter === 'auctions'
      ? browseListings.filter((item) => item.kind === 'auction')
      : listingFilter === 'fixed'
        ? browseListings.filter((item) => item.kind !== 'auction')
        : browseListings;
  const filteredListings = searching
    ? typedListings.filter((item) =>
        listingMatchesQuery(item, normalizedListingQuery)
      )
    : typedListings;
  // Medium / facets / audioFormat are server-filtered via activeListings.
  // Thought primaries are stripped client-side when medium is All (above).
  const discoveryFilteredListings = filteredListings;

  const clientDiscoveryFilterActive =
    searching ||
    listingFilter !== 'all' ||
    mediumFilter !== 'all' ||
    (facetMedium != null &&
      (selectedFacets.length > 0 || Boolean(audioFormatFilter)));

  const hasLiveAuctionClocks =
    discoveryFilteredListings.some(
      (item) =>
        item.kind === 'auction' &&
        item.expiresAtNs != null &&
        Number.isFinite(item.expiresAtNs) &&
        item.expiresAtNs > 0
    ) ||
    owned.some(
      (item) =>
        item.listingKind === 'auction' &&
        item.expiresAtNs != null &&
        Number.isFinite(item.expiresAtNs) &&
        item.expiresAtNs > 0
    );

  useEffect(() => {
    if (!hasLiveAuctionClocks || status !== 'ready') return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [hasLiveAuctionClocks, status]);

  const handleBuy = useCallback(
    (item: MarketListingItem) => {
      const isOwn =
        Boolean(viewerAccountId) &&
        accountIdsEqual(viewerAccountId!, item.creatorId);
      const endsAtMs = auctionExpiresAtMs(item.expiresAtNs);
      const auctionEnded =
        item.kind === 'auction' && endsAtMs != null && endsAtMs <= Date.now();
      const alreadyOwns = viewerOwnsRelatedEdition(item, owned);
      const listingCollectionId =
        item.collectionId?.trim() ||
        (item.tokenId ? collectionIdFromTokenId(item.tokenId) : null) ||
        undefined;
      // Own live listings aren't buyable; ended own auctions open settle.
      if (isOwn && !auctionEnded) {
        return;
      }
      if (item.kind === 'auction') {
        const tokenId = item.tokenId?.trim();
        if (!tokenId) return;
        setBidListing({
          tokenId,
          title: item.title,
          ...(item.description ? { description: item.description } : {}),
          mediaUrl: item.mediaUrl,
          sellerId: item.creatorId,
          priceNear: item.priceNear,
          ...(item.sourcePostPath
            ? { sourcePostPath: item.sourcePostPath }
            : {}),
          ...(item.postHref ? { postHref: item.postHref } : {}),
          ...(item.playable ? { playable: item.playable } : {}),
          ...(item.playables?.length ? { playables: item.playables } : {}),
          ...(item.blockTimestamp > 0
            ? { listedAtMs: item.blockTimestamp }
            : {}),
        });
        return;
      }
      if (isOwn) return;
      if (item.kind === 'native' && item.tokenId) {
        setBuyListing({
          tokenId: item.tokenId,
          status: 'listed',
          priceNear: item.priceNear,
          title: item.title,
          ...(item.description ? { description: item.description } : {}),
          mediaUrl: item.mediaUrl,
          creatorId: item.creatorId,
          ...(listingCollectionId
            ? { collectionId: listingCollectionId }
            : {}),
          ...(item.artistId?.trim() ? { artistId: item.artistId.trim() } : {}),
          ...(item.cardBg ? { cardBg: item.cardBg } : {}),
          ...(item.sourcePostPath
            ? { sourcePostPath: item.sourcePostPath }
            : {}),
          ...(item.postHref ? { postHref: item.postHref } : {}),
          ...(item.playable ? { playable: item.playable } : {}),
          ...(item.playables?.length ? { playables: item.playables } : {}),
          ...(item.blockTimestamp > 0
            ? { listedAtMs: item.blockTimestamp }
            : {}),
          alreadyOwnsEdition: alreadyOwns,
        });
        return;
      }
      if (!item.listingId) return;
      setBuyListing({
        listingId: item.listingId,
        status: 'lazy_listing',
        priceNear: item.priceNear,
        title: item.title,
        ...(item.description ? { description: item.description } : {}),
        mediaUrl: item.mediaUrl,
        creatorId: item.creatorId,
        ...(listingCollectionId
          ? { collectionId: listingCollectionId }
          : {}),
        ...(item.artistId?.trim() ? { artistId: item.artistId.trim() } : {}),
        ...(item.cardBg ? { cardBg: item.cardBg } : {}),
        copies: item.copies,
        remaining: item.remaining,
        ...(item.sourcePostPath ? { sourcePostPath: item.sourcePostPath } : {}),
        ...(item.postHref ? { postHref: item.postHref } : {}),
        ...(item.playable ? { playable: item.playable } : {}),
        ...(item.playables?.length ? { playables: item.playables } : {}),
        ...(item.blockTimestamp > 0 ? { listedAtMs: item.blockTimestamp } : {}),
        alreadyOwnsEdition: alreadyOwns,
      });
    },
    [viewerAccountId, owned]
  );

  const handlePurchased = useCallback(() => {
    setBuyListing(null);
    if (viewerAccountId) invalidateOwnedVaultCache(viewerAccountId);
    setRetryKey((value) => value + 1);
  }, [viewerAccountId]);

  const handleBid = useCallback(
    (detail?: ScarceBidSuccessDetail) => {
      const listing = bidListing;
      setBidListing(null);
      if (
        detail?.settled &&
        detail.tokenId &&
        viewerAccountId &&
        listing?.tokenId === detail.tokenId
      ) {
        setListingsState((current) => ({
          ...current,
          items: current.items.filter((row) => row.tokenId !== detail.tokenId),
        }));
        setOwnedState((current) => {
          const alreadyOwned = current.items.some(
            (row) => row.tokenId === detail.tokenId
          );
          if (alreadyOwned) return current;
          return {
            ...current,
            items: [
              {
                tokenId: detail.tokenId!,
                title: listing.title?.trim() || 'Scarce',
                mediaUrl: listing.mediaUrl,
                ownerId: viewerAccountId,
                listingKind: null,
                listedPriceNear: null,
              },
              ...current.items,
            ],
          };
        });
      }
      setRetryKey((value) => value + 1);
    },
    [bidListing, viewerAccountId]
  );

  const handleOffered = useCallback(() => {
    setOfferListing(null);
    setOffersRevision((value) => value + 1);
  }, []);

  const handleListed = useCallback(() => {
    setSellItem(null);
    if (viewerAccountId) invalidateOwnedVaultCache(viewerAccountId);
    setRetryKey((value) => value + 1);
  }, [viewerAccountId]);

  const handleCancel = useCallback(
    async (item: MarketListingItem) => {
      const rowKey = marketListingRowKey(item);
      if (cancelRowKey) return;
      setCancelRowKey(rowKey);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(accountId, wallet);
        const response =
          item.kind === 'auction' && item.tokenId
            ? await client.scarces.auctions.cancel(item.tokenId)
            : item.kind === 'native' && item.tokenId
              ? await client.scarces.market.delist(item.tokenId)
              : item.listingId
                ? await client.scarces.lazy.cancel(item.listingId)
                : null;
        if (!response) return;

        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.cancelingScarceListing,
          successMessage: txToastSuccess.scarceListingCanceled,
          failureMessage: txToastError.cancelScarceListingFailed,
        });
        if (!confirmed) return;

        setListingsState((current) => ({
          ...current,
          items: current.items.filter(
            (row) => marketListingRowKey(row) !== rowKey
          ),
        }));
        setOwnedState((current) => ({
          ...current,
          items: current.items.map((row) =>
            item.tokenId && row.tokenId === item.tokenId
              ? { ...row, listingKind: null, listedPriceNear: null }
              : row
          ),
        }));

        invalidateLiveListingsCache(item.creatorId);
        invalidateOwnedVaultCache(item.creatorId);
        const coords = sourcePostCoords(item.sourcePostPath);
        if (coords && item.kind === 'lazy') {
          setScarceEmbedOverride(postScarceKey(coords.author, coords.postId), {
            status: 'none',
            events: [],
          });
        }
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.cancelScarceListingFailed,
        });
      } finally {
        setCancelRowKey(null);
      }
    },
    [cancelRowKey, getSigningWallet, setTxResult, trackTransaction]
  );

  const handleManageOwned = useCallback(
    async (item: OwnedScarceItem) => {
      if (delistTokenId || settleTokenId) return;
      if (item.listingKind === 'auction' && (item.bidCount ?? 0) > 0) {
        setTxResult({
          type: 'error',
          msg: 'This auction already has bids — wait for it to end, then complete the sale.',
        });
        return;
      }
      setDelistTokenId(item.tokenId);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(accountId, wallet);
        const response =
          item.listingKind === 'auction'
            ? await client.scarces.auctions.cancel(item.tokenId)
            : await client.scarces.market.delist(item.tokenId);
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.cancelingScarceListing,
          successMessage: txToastSuccess.scarceListingCanceled,
          failureMessage: txToastError.cancelScarceListingFailed,
        });
        if (!confirmed) return;
        if (viewerAccountId) invalidateOwnedVaultCache(viewerAccountId);
        setRetryKey((value) => value + 1);
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.cancelScarceListingFailed,
        });
      } finally {
        setDelistTokenId(null);
      }
    },
    [
      delistTokenId,
      getSigningWallet,
      setTxResult,
      settleTokenId,
      trackTransaction,
    ]
  );

  const handleSettleOwned = useCallback(
    async (item: OwnedScarceItem) => {
      if (settleTokenId || delistTokenId) return;
      const endsAtMs = auctionExpiresAtMs(item.expiresAtNs);
      if (
        item.listingKind !== 'auction' ||
        (item.bidCount ?? 0) <= 0 ||
        endsAtMs == null ||
        endsAtMs > Date.now()
      ) {
        setTxResult({
          type: 'error',
          msg: 'This auction isn’t ready to complete yet.',
        });
        return;
      }
      setSettleTokenId(item.tokenId);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const action: ListingActionItem = {
          id: `complete_sale:${item.tokenId}`,
          kind: 'complete_sale',
          title: item.title,
          tokenId: item.tokenId,
          sellerId: item.ownerId,
          priceNear: item.listedPriceNear ?? null,
          bidCount: item.bidCount ?? 0,
          expiresAtNs: item.expiresAtNs ?? null,
          ended: true,
        };
        const confirmed = await executeListingAction({
          item: action,
          accountId,
          wallet,
          trackTransaction,
        });
        if (!confirmed) return;
        setOwnedState((current) => ({
          ...current,
          items: current.items.map((row) =>
            row.tokenId === item.tokenId
              ? {
                  ...row,
                  listingKind: null,
                  listedPriceNear: null,
                  bidCount: undefined,
                  expiresAtNs: undefined,
                }
              : row
          ),
        }));
        setRetryKey((value) => value + 1);
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.settleScarceAuctionFailed,
        });
      } finally {
        setSettleTokenId(null);
      }
    },
    [
      delistTokenId,
      getSigningWallet,
      setTxResult,
      settleTokenId,
      trackTransaction,
    ]
  );

  const showEmptyBrowse =
    status === 'ready' &&
    listingsReady &&
    !listingsFailed &&
    !searching &&
    !creatorFilter &&
    !appFilter &&
    listingFilter === 'all' &&
    mediumFilter === 'all' &&
    browseListings.length === 0 &&
    owned.length === 0;
  const searchSettled =
    searching &&
    listingQuery.trim() === debouncedQuery &&
    listingsReady &&
    !catalogRefreshing &&
    !loadingMore;
  const showEmptySearch =
    status === 'ready' &&
    searchSettled &&
    !listingsFailed &&
    discoveryFilteredListings.length === 0 &&
    !listingsState.hasMore;
  const showEmptyFilter =
    status === 'ready' &&
    listingsReady &&
    !listingsFailed &&
    !showEmptyBrowse &&
    clientDiscoveryFilterActive &&
    !searching &&
    discoveryFilteredListings.length === 0 &&
    !listingsState.hasMore &&
    !loadingMore;
  const facetOrFormatActive =
    facetMedium != null &&
    (selectedFacets.length > 0 || Boolean(audioFormatFilter));
  const visibleSales =
    salesExpanded || salesRows.length <= RECENT_SALES_PREVIEW
      ? salesRows
      : salesRows.slice(0, RECENT_SALES_PREVIEW);
  const hiddenSalesCount = Math.max(0, salesRows.length - visibleSales.length);

  const showListSkeleton =
    listingsState.items.length === 0 &&
    !listingsFailed &&
    !searching &&
    (status === 'loading' || !listingsReady || catalogRefreshing);
  const showOwnedSection =
    Boolean(viewerAccountId) &&
    owned.length > 0 &&
    !searching &&
    !creatorFilter &&
    !appFilter;
  const showMyOffersSection =
    Boolean(viewerAccountId) &&
    myOffers.length > 0 &&
    !searching &&
    !creatorFilter &&
    !appFilter;
  const showSalesSection =
    salesRows.length > 0 && !searching && !creatorFilter && !appFilter;
  const creatorEmpty =
    Boolean(creatorFilter) &&
    status === 'ready' &&
    listingsReady &&
    !listingsFailed &&
    discoveryFilteredListings.length === 0;
  const appEmpty =
    Boolean(appFilter) &&
    status === 'ready' &&
    listingsReady &&
    !listingsFailed &&
    discoveryFilteredListings.length === 0;

  const titleForToken = useCallback(
    (tokenId: string): { title: string; mediaUrl?: string | null } => {
      const ownedHit = owned.find((row) => row.tokenId === tokenId);
      if (ownedHit) {
        return { title: ownedHit.title, mediaUrl: ownedHit.mediaUrl };
      }
      const listingHit = listings.find((row) => row.tokenId === tokenId);
      if (listingHit) {
        return { title: listingHit.title, mediaUrl: listingHit.mediaUrl };
      }
      return { title: `Scarce · ${tokenId}` };
    },
    [listings, owned]
  );

  return (
    <OsAppScreen
      title="Market"
      compactChrome
      scrollTuck="search"
      scrollTuckPinned={sortMenuOpen}
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
      glassChrome
      scrollRootRef={scrollRootRef}
      heading={
        <MarketSearchHeading
          listingQuery={listingQuery}
          onListingQueryChange={handleListingQueryChange}
        />
      }
      actions={<MarketHeadingActions />}
      toolbar={
        <MarketListingToolbar
          ready
          listingFilter={listingFilter}
          listingSort={listingSort}
          medium={mediumFilter}
          audioFormat={audioFormatFilter}
          selectedFacets={selectedFacets}
          facetMedium={facetMedium}
          onListingFilterChange={setFilter}
          onSortChange={setSort}
          onMediumChange={setMediumFilter}
          onAudioFormatChange={(format) =>
            replaceDiscoveryParams({ audioFormat: format })
          }
          onFacetsChange={(facets) => replaceDiscoveryParams({ facets })}
          onClear={() => setMediumFilter('all')}
          onMenuOpenChange={setSortMenuOpen}
        />
      }
    >
      <div className="market-page" data-market-panel>
        {creatorFilter ? (
          <div className="market-creator-filter">
            <Link
              href={portfolioPath(creatorFilter)}
              scroll={false}
              className="market-creator-filter-handle"
            >
              <ShopFillIcon
                className="market-creator-filter-icon"
                aria-hidden
              />
              From @{fallbackLabel(creatorFilter)}
            </Link>
            <button
              type="button"
              className="market-creator-filter-clear"
              onClick={clearNarrowFilter}
              aria-label="Clear creator filter"
            >
              <MultiplyIcon aria-hidden />
            </button>
          </div>
        ) : null}

        {appFilter ? (
          <div className="market-creator-filter">
            <Link
              href={appPath(appFilter)}
              scroll={false}
              className="market-creator-filter-handle"
            >
              <StarMovingFillIcon
                className="market-creator-filter-icon"
                aria-hidden
              />
              {appFilter}
            </Link>
            <button
              type="button"
              className="market-creator-filter-clear"
              onClick={clearNarrowFilter}
              aria-label="Clear hub filter"
            >
              <MultiplyIcon aria-hidden />
            </button>
          </div>
        ) : null}

        {showListSkeleton ? (
          <div className="market-section" aria-busy="true" aria-live="polite">
            <p className="sr-only">Loading listings…</p>
            <MarketListSkeleton rows={5} />
          </div>
        ) : null}
        {listingsFailed ? (
          <p className="market-page-status" role="alert">
            Couldn’t load listings.{' '}
            <button
              type="button"
              className="market-page-retry"
              onClick={() => setRetryKey((value) => value + 1)}
            >
              Retry
            </button>
          </p>
        ) : null}

        {showEmptyBrowse ? (
          <div className="market-page-empty">
            <p className="market-page-empty-copy">
              Nothing listed yet. List a scarce from a post, or sell one you own
              under Yours.
            </p>
            <Link className="app-soon-link" href={APP_HOME_PATH}>
              Back to Home
            </Link>
          </div>
        ) : null}

        {status === 'ready' &&
        listingsReady &&
        !listingsFailed &&
        !searching &&
        listingFilter === 'all' &&
        mediumFilter === 'all' &&
        browseListings.length === 0 &&
        salesRows.length > 0 &&
        !showEmptyBrowse ? (
          <p className="market-page-status">
            No active listings — recent sales below.
          </p>
        ) : null}

        {showEmptySearch ? (
          <p className="market-page-status">No matches.</p>
        ) : null}

        {showEmptyFilter ? (
          <p className="market-page-status">
            {facetOrFormatActive ? (
              <>
                No matches for these filters.{' '}
                <button
                  type="button"
                  className="market-page-retry"
                  onClick={() => setMediumFilter('all')}
                >
                  Clear filter
                </button>
              </>
            ) : mediumFilter !== 'all' ? (
              <>
                Nothing in{' '}
                {MARKET_MEDIUM_FILTERS.find((tab) => tab.id === mediumFilter)
                  ?.label ?? mediumFilter}{' '}
                right now.{' '}
                <button
                  type="button"
                  className="market-page-retry"
                  onClick={() => setMediumFilter('all')}
                >
                  Clear filter
                </button>
                {' · '}
                <button
                  type="button"
                  className="market-page-retry"
                  onClick={() => setFilter('all')}
                >
                  See All
                </button>
              </>
            ) : (
              <>
                Nothing in{' '}
                {listingFilter === 'auctions' ? 'Auctions' : 'Fixed'} right
                now.{' '}
                <button
                  type="button"
                  className="market-page-retry"
                  onClick={() => setFilter('all')}
                >
                  See All
                </button>
              </>
            )}
          </p>
        ) : null}

        {creatorEmpty ? (
          <p className="market-page-status">
            No live listings from @{fallbackLabel(creatorFilter)} right now.{' '}
            <button
              type="button"
              className="market-page-retry"
              onClick={clearNarrowFilter}
            >
              Clear filter
            </button>
          </p>
        ) : null}

        {appEmpty ? (
          <p className="market-page-status">
            No live listings in {appFilter} right now.{' '}
            <button
              type="button"
              className="market-page-retry"
              onClick={clearNarrowFilter}
            >
              Clear filter
            </button>
          </p>
        ) : null}

        <section
          id="market-listing-results"
          role="tabpanel"
          aria-labelledby={`market-listing-tab-${listingFilter}`}
          className={`market-section${
            catalogRefreshing ? ' drops-catalog--refreshing' : ''
          }`}
          hidden={discoveryFilteredListings.length === 0}
          aria-busy={catalogRefreshing || undefined}
        >
          <h2 id="market-new" className="sr-only">
            {listingFilter === 'auctions'
              ? 'Auctions'
              : listingFilter === 'fixed'
                ? 'Fixed price'
                : 'Listings'}
          </h2>
          {discoveryFilteredListings.length > 0 ? (
            <div className="market-listing-list" role="list">
              {discoveryFilteredListings.map((item) => {
                const rowKey = marketListingRowKey(item);
                const offerSummary = item.tokenId
                  ? offerByToken.get(item.tokenId)
                  : undefined;
                return (
                  <MarketListingRow
                    key={rowKey}
                    item={item}
                    nowMs={nowMs}
                    highestOfferNear={offerSummary?.highestAmountNear ?? null}
                    alreadyOwnsEdition={viewerOwnsRelatedEdition(item, owned)}
                    isOwnListing={(() => {
                      if (
                        !viewerAccountId ||
                        !accountIdsEqual(viewerAccountId, item.creatorId)
                      ) {
                        return false;
                      }
                      // Own ended auctions keep Bid/Settle; live own rows are Listed.
                      if (item.kind !== 'auction') return true;
                      const endsAtMs = auctionExpiresAtMs(item.expiresAtNs);
                      return endsAtMs == null || endsAtMs > Date.now();
                    })()}
                    cancelPending={cancelRowKey === rowKey}
                    onBuy={handleBuy}
                    onCancel={(row) => {
                      void handleCancel(row);
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </section>

        {clientDiscoveryFilterActive &&
        !searching &&
        listingsState.hasMore &&
        discoveryFilteredListings.length === 0 &&
        !showEmptyFilter ? (
          <p className="market-page-status">Looking for matches…</p>
        ) : null}

        {loadMoreFailed ? (
          <p className="market-page-status" role="alert">
            Couldn’t load more.{' '}
            <button
              type="button"
              className="market-page-retry"
              onClick={loadMoreListings}
            >
              Retry
            </button>
          </p>
        ) : null}

        {(discoveryFilteredListings.length > 0 ||
          (clientDiscoveryFilterActive && listingsState.hasMore)) &&
        listingsState.hasMore &&
        !loadMoreFailed &&
        !catalogRefreshing ? (
          <>
            {loadingMore ? <MarketListSkeleton rows={2} /> : null}
            <div
              ref={listingsSentinelRef}
              className="market-listing-sentinel"
              aria-hidden
            />
            <button
              type="button"
              className="market-sales-more"
              disabled={loadingMore}
              onClick={loadMoreListings}
            >
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
          </>
        ) : null}

        {showOwnedSection ? (
          <section className="market-section" aria-labelledby="market-yours">
            <h2 id="market-yours" className="market-section-title">
              Yours
            </h2>
            <div className="market-listing-list" role="list">
              {owned.map((item) => {
                const offerSummary = offerByToken.get(item.tokenId);
                return (
                  <MarketOwnedRow
                    key={item.tokenId}
                    item={item}
                    nowMs={nowMs}
                    highestOfferNear={offerSummary?.highestAmountNear ?? null}
                    offerCount={offerSummary?.offerCount ?? 0}
                    delistPending={delistTokenId === item.tokenId}
                    settlePending={settleTokenId === item.tokenId}
                    onSell={setSellItem}
                    onOffers={setOffersItem}
                    onSettle={(row) => {
                      void handleSettleOwned(row);
                    }}
                    onDelist={(row) => {
                      void handleManageOwned(row);
                    }}
                  />
                );
              })}
            </div>
            {ownedState.hasMore ? (
              <button
                type="button"
                className="market-sales-more"
                onClick={loadMoreOwned}
                disabled={ownedLoadingMore}
              >
                {ownedLoadingMore ? 'Loading…' : 'Show more'}
              </button>
            ) : null}
          </section>
        ) : null}

        {showMyOffersSection ? (
          <section
            className="market-section"
            aria-labelledby="market-my-offers"
          >
            <h2 id="market-my-offers" className="market-section-title">
              Your offers
            </h2>
            <div className="market-listing-list" role="list">
              {myOffers.map((offer) => {
                const meta = titleForToken(offer.tokenId);
                return (
                  <MarketOfferRow
                    key={`my-offer:${offer.tokenId}`}
                    tokenId={offer.tokenId}
                    title={meta.title}
                    mediaUrl={meta.mediaUrl}
                    amountNear={offer.amountNear}
                    onManage={() => {
                      const listingOwner =
                        listings.find((row) => row.tokenId === offer.tokenId)
                          ?.creatorId ?? '';
                      setOfferListing({
                        tokenId: offer.tokenId,
                        title: meta.title,
                        mediaUrl: meta.mediaUrl,
                        ownerId: listingOwner || viewerAccountId || '',
                        askNear: listings.find(
                          (row) => row.tokenId === offer.tokenId
                        )?.priceNear,
                      });
                    }}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {showSalesSection ? (
          <section className="market-section" aria-labelledby="market-sales">
            <h2 id="market-sales" className="market-section-title">
              Recent sales
            </h2>
            <ul className="market-sales-list">
              {visibleSales.map((sale, index) => (
                <MarketSaleRow
                  key={`${sale.listingId ?? sale.tokenId ?? 'sale'}:${sale.blockTimestamp}:${index}`}
                  sale={sale}
                />
              ))}
            </ul>
            {hiddenSalesCount > 0 ? (
              <button
                type="button"
                className="market-sales-more"
                onClick={() => setSalesExpanded(true)}
              >
                Show {hiddenSalesCount} more
              </button>
            ) : null}
            {salesExpanded && salesRows.length > RECENT_SALES_PREVIEW ? (
              <button
                type="button"
                className="market-sales-more"
                onClick={() => setSalesExpanded(false)}
              >
                Show less
              </button>
            ) : null}
          </section>
        ) : null}
      </div>

      <ScarceBuySheet
        open={buyListing != null}
        listing={buyListing}
        onOpenChange={(open) => {
          if (!open) setBuyListing(null);
        }}
        onPurchased={handlePurchased}
        onMakeOffer={
          buyListing?.status === 'listed' && buyListing.tokenId
            ? () => {
                const listing = buyListing;
                setBuyListing(null);
                setOfferListing({
                  tokenId: listing.tokenId!,
                  title: listing.title,
                  mediaUrl: listing.mediaUrl,
                  ownerId: listing.creatorId,
                  askNear: listing.priceNear,
                });
              }
            : undefined
        }
      />

      <ScarceBidSheet
        open={bidListing != null}
        listing={bidListing}
        onOpenChange={(open) => {
          if (!open) setBidListing(null);
        }}
        onBid={handleBid}
      />

      <ScarceOfferSheet
        open={offerListing != null}
        listing={offerListing}
        onOpenChange={(open) => {
          if (!open) setOfferListing(null);
        }}
        onOffered={handleOffered}
      />

      <ScarceSellSheet
        open={sellItem != null}
        item={sellItem}
        sellerAccountId={viewerAccountId}
        onOpenChange={(open) => {
          if (!open) setSellItem(null);
        }}
        onListed={handleListed}
      />

      <ScarceOffersSheet
        open={offersItem != null}
        item={offersItem}
        onOpenChange={(open) => {
          if (!open) setOffersItem(null);
        }}
        onAccepted={() => {
          setOffersItem(null);
          setOffersRevision((value) => value + 1);
          setRetryKey((value) => value + 1);
        }}
      />
    </OsAppScreen>
  );
}
