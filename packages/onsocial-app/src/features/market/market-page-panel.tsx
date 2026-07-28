'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MultiplyIcon,
  PlusIcon,
  SearchField,
  ShopFillIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { MarketListingRow } from '@/features/market/market-listing-row';
import { MarketListingSortMenu } from '@/features/market/market-listing-sort-menu';
import {
  auctionExpiresAtMs,
  fetchMarketListings,
  fetchMarketSales,
  fetchOwnedScarcesPage,
  excludeOwnedNativeListings,
  formatMarketRelativeTime,
  invalidateLiveListingsCache,
  marketListingRowKey,
  type MarketListingItem,
  type MarketListingSort,
  type MarketSaleItem,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { MarketOwnedRow } from '@/features/market/market-owned-row';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
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
import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_APPS_PATH,
  APP_DROP_CREATE_PATH,
  APP_HOME_PATH,
  APP_MARKET_PATH,
  MARKET_CREATOR_PARAM,
  MARKET_APP_PARAM,
  MARKET_KIND_PARAM,
  appPath,
} from '@/lib/app-routes';
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
type ListingFilter = 'all' | 'fixed' | 'auctions';
type MediumFilter = 'all' | 'art' | 'book' | 'music';

const LISTING_FILTERS: { id: ListingFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'auctions', label: 'Auctions' },
];

const MEDIUM_FILTERS: { id: MediumFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'art', label: 'Art' },
  { id: 'book', label: 'Book' },
  { id: 'music', label: 'Music' },
];

function parseMediumFilter(raw: string | null): MediumFilter {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === 'art' || value === 'book' || value === 'music') return value;
  return 'all';
}

/** Initial Recent sales rows; expand shows the rest of the fetched window. */
const RECENT_SALES_PREVIEW = 8;

/** Catalog page size for infinite scroll. */
const LISTINGS_PAGE_SIZE = 40;
/** Debounce before a search keystroke becomes an indexer query. */
const SEARCH_DEBOUNCE_MS = 300;

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
  filter: ListingFilter
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

function sourcePostCoords(
  path: string | undefined
): { author: string; postId: string } | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2] };
}

export function MarketPagePanel() {
  const { accountId: viewerAccountId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const router = useRouter();
  const searchParams = useSearchParams();
  const creatorFilter =
    searchParams.get(MARKET_CREATOR_PARAM)?.trim().toLowerCase() ?? '';
  const appFilter = searchParams.get(MARKET_APP_PARAM)?.trim() ?? '';
  const mediumFilter = parseMediumFilter(searchParams.get(MARKET_KIND_PARAM));
  const [retryKey, setRetryKey] = useState(0);
  const [listingsState, setListingsState] =
    useState<ListingsState>(EMPTY_LISTINGS);
  const [loadingMore, setLoadingMore] = useState(false);
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
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [listingSort, setListingSort] = useState<MarketListingSort>('newest');
  const [listingQuery, setListingQuery] = useState('');
  const [salesExpanded, setSalesExpanded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [offerByToken, setOfferByToken] = useState<
    Map<string, TokenOfferSummary>
  >(() => new Map());
  const [myOffers, setMyOffers] = useState<MyOpenTokenOffer[]>([]);
  const [offersRevision, setOffersRevision] = useState(0);
  const toolbarHidden = useDockAutoHide(sortMenuOpen);
  const listingsSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const normalizedListingQuery = listingQuery.trim().toLowerCase();
  const searching = normalizedListingQuery.length > 0;

  // Debounced indexer search; client filter covers the typing gap below.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const trimmed = listingQuery.trim();
    const id = window.setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [listingQuery]);

  const setFilter = useCallback((next: ListingFilter) => {
    setListingFilter(next);
    if (next === 'fixed') {
      setListingSort((current) => (current === 'ending' ? 'newest' : current));
    }
  }, []);

  // Ending soon is auction clocks only — keep the Auctions tab in sync.
  const setSort = useCallback((next: MarketListingSort) => {
    setListingSort(next);
    if (next === 'ending') {
      setListingFilter('auctions');
    }
  }, []);

  const listingsParamsKey = `${retryKey}|${listingFilter}|${listingSort}|${debouncedQuery.toLowerCase()}|${creatorFilter}|${appFilter}`;

  const clearNarrowFilter = useCallback(() => {
    router.replace(APP_MARKET_PATH, { scroll: false });
  }, [router]);

  const setMediumFilter = useCallback(
    (next: MediumFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') {
        params.delete(MARKET_KIND_PARAM);
      } else {
        params.set(MARKET_KIND_PARAM, next);
      }
      const qs = params.toString();
      router.replace(qs ? `${APP_MARKET_PATH}?${qs}` : APP_MARKET_PATH, {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  // First catalog page; previous items stay rendered while params refine.
  useEffect(() => {
    let cancelled = false;
    // Ending sort always queries auctions, even mid-tab transition.
    const kinds =
      listingSort === 'ending'
        ? (['auction'] as const)
        : filterToKinds(listingFilter);
    fetchMarketListings({
      limit: LISTINGS_PAGE_SIZE,
      ...(kinds ? { kinds: [...kinds] } : {}),
      ...(debouncedQuery ? { search: debouncedQuery } : {}),
      ...(creatorFilter ? { sellerId: creatorFilter } : {}),
      ...(appFilter ? { appId: appFilter } : {}),
      sort: listingSort,
    }).then(
      (page) => {
        if (cancelled) return;
        setListingsState({
          paramsKey: listingsParamsKey,
          items: page.items,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
          failed: false,
        });
      },
      () => {
        if (cancelled) return;
        setListingsState({
          ...EMPTY_LISTINGS,
          paramsKey: listingsParamsKey,
          failed: true,
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    listingsParamsKey,
    listingFilter,
    listingSort,
    debouncedQuery,
    creatorFilter,
    appFilter,
  ]);

  const listingsReady = listingsState.paramsKey === listingsParamsKey;
  const listingsFailed = listingsReady && listingsState.failed;

  const loadMoreListings = useCallback(() => {
    if (!listingsReady || listingsState.failed) return;
    if (!listingsState.hasMore || loadingMore) return;
    setLoadingMore(true);
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
      sort: listingSort,
    })
      .then((page) => {
        setListingsState((current) =>
          current.paramsKey === listingsParamsKey
            ? {
                ...current,
                items: dedupeListings([...current.items, ...page.items]),
                nextOffset: page.nextOffset,
                hasMore: page.hasMore,
              }
            : current
        );
      })
      .catch(() => {
        // Stop paging quietly; the loaded pages stay usable.
        setListingsState((current) =>
          current.paramsKey === listingsParamsKey
            ? { ...current, hasMore: false }
            : current
        );
      })
      .finally(() => {
        setLoadingMore(false);
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
    listingsParamsKey,
  ]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: listingsSentinelRef,
    enabled:
      listingsReady &&
      !listingsState.failed &&
      listingsState.hasMore &&
      !loadingMore,
    onIntersect: loadMoreListings,
    rootMargin: '240px 0px',
  });

  useEffect(() => {
    let cancelled = false;
    setSalesExpanded(false);
    fetchMarketSales().then(
      (rows) => {
        if (!cancelled) setSales(rows);
      },
      () => {
        if (!cancelled) setSales([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

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
  const browseListings = excludeOwnedNativeListings(listings, ownedTokenIdSet);

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
  const mediumFilteredListings =
    mediumFilter === 'all'
      ? filteredListings
      : filteredListings.filter(
          (item) => (item.mediumKind ?? '').toLowerCase() === mediumFilter
        );

  const hasLiveAuctionClocks =
    mediumFilteredListings.some(
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
      // Own live listings aren't buyable; ended own auctions open settle.
      if (isOwn && !auctionEnded) {
        return;
      }
      if (item.kind === 'auction' && item.tokenId) {
        setBidListing({
          tokenId: item.tokenId,
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
          ...(item.cardBg ? { cardBg: item.cardBg } : {}),
          ...(item.sourcePostPath
            ? { sourcePostPath: item.sourcePostPath }
            : {}),
          ...(item.postHref ? { postHref: item.postHref } : {}),
          ...(item.playable ? { playable: item.playable } : {}),
          ...(item.blockTimestamp > 0
            ? { listedAtMs: item.blockTimestamp }
            : {}),
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
        ...(item.cardBg ? { cardBg: item.cardBg } : {}),
        copies: item.copies,
        remaining: item.remaining,
        ...(item.sourcePostPath ? { sourcePostPath: item.sourcePostPath } : {}),
        ...(item.postHref ? { postHref: item.postHref } : {}),
        ...(item.playable ? { playable: item.playable } : {}),
        ...(item.blockTimestamp > 0 ? { listedAtMs: item.blockTimestamp } : {}),
      });
    },
    [viewerAccountId]
  );

  const handlePurchased = useCallback(() => {
    setBuyListing(null);
    setRetryKey((value) => value + 1);
  }, []);

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
    setRetryKey((value) => value + 1);
  }, []);

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
  const showEmptyFilter =
    status === 'ready' &&
    listingsReady &&
    !listingsFailed &&
    !showEmptyBrowse &&
    (searching || listingFilter !== 'all' || mediumFilter !== 'all') &&
    mediumFilteredListings.length === 0;
  const visibleSales =
    salesExpanded || salesRows.length <= RECENT_SALES_PREVIEW
      ? salesRows
      : salesRows.slice(0, RECENT_SALES_PREVIEW);
  const hiddenSalesCount = Math.max(0, salesRows.length - visibleSales.length);

  const showListingToolbar = status !== 'error' && !showEmptyBrowse;
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
    mediumFilteredListings.length === 0;
  const appEmpty =
    Boolean(appFilter) &&
    status === 'ready' &&
    listingsReady &&
    !listingsFailed &&
    mediumFilteredListings.length === 0;

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
      leading={null}
      scrollRootRef={scrollRootRef}
      actions={
        <>
          <Link
            href={APP_APPS_PATH}
            className={osIconActionClassName}
            aria-label="Browse stores"
          >
            <ShopFillIcon aria-hidden />
          </Link>
          {viewerAccountId ? (
            <Link
              href={APP_DROP_CREATE_PATH}
              className={osIconActionClassName}
              aria-label="Start a drop"
            >
              <PlusIcon aria-hidden />
            </Link>
          ) : null}
        </>
      }
      heading={
        <SearchField
          value={listingQuery}
          onValueChange={setListingQuery}
          placeholder="Search listings"
          clearAriaLabel="Clear search"
          ariaLabel="Search Market listings"
          className="discover-nav-search-field os-app-screen-search"
          leadingIcon={
            <ShopFillIcon className="search-field-icon" aria-hidden />
          }
        />
      }
      toolbar={
        showListingToolbar ? (
          <div
            className={`os-app-chrome-rail market-listing-toolbar${
              toolbarHidden ? ' is-scroll-hidden' : ''
            }`}
          >
            <div className="market-listing-filter-stack">
              <div
                className="discover-tab-bar market-listing-filters"
                role="tablist"
                aria-label="Listing type"
              >
                <div className="discover-tab-bar-scroller">
                  {LISTING_FILTERS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`market-listing-tab-${tab.id}`}
                      aria-controls="market-listing-results"
                      aria-selected={listingFilter === tab.id}
                      className={
                        listingFilter === tab.id ? 'is-active' : undefined
                      }
                      onClick={() => setFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="discover-tab-bar market-listing-filters market-medium-filters"
                role="tablist"
                aria-label="Medium"
              >
                <div className="discover-tab-bar-scroller">
                  {MEDIUM_FILTERS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`market-medium-tab-${tab.id}`}
                      aria-controls="market-listing-results"
                      aria-selected={mediumFilter === tab.id}
                      className={
                        mediumFilter === tab.id ? 'is-active' : undefined
                      }
                      onClick={() => setMediumFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <MarketListingSortMenu
              sort={listingSort}
              onSortChange={setSort}
              endingDisabled={listingFilter === 'fixed'}
              onOpenChange={setSortMenuOpen}
            />
          </div>
        ) : undefined
      }
    >
      <div className="market-page">
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
              <ShopFillIcon
                className="market-creator-filter-icon"
                aria-hidden
              />
              {appFilter}
            </Link>
            <button
              type="button"
              className="market-creator-filter-clear"
              onClick={clearNarrowFilter}
              aria-label="Clear store filter"
            >
              <MultiplyIcon aria-hidden />
            </button>
          </div>
        ) : null}

        {creatorEmpty ? (
          <p className="market-page-status">
            No live listings from @{fallbackLabel(creatorFilter)} right now.
          </p>
        ) : null}

        {appEmpty ? (
          <p className="market-page-status">
            No live listings in {appFilter} right now.
          </p>
        ) : null}

        {status === 'loading' ? (
          <div className="market-section" aria-busy="true" aria-live="polite">
            <p className="sr-only">Loading listings…</p>
            <MarketListSkeleton rows={5} />
          </div>
        ) : null}
        {status === 'error' ? (
          <p className="market-page-status" role="alert">
            Couldn’t load Market.{' '}
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

        {showEmptyFilter ? (
          <p className="market-page-status">
            {searching
              ? `No listings match “${listingQuery.trim()}”.`
              : mediumFilter !== 'all'
                ? `Nothing in ${
                    MEDIUM_FILTERS.find((tab) => tab.id === mediumFilter)
                      ?.label ?? mediumFilter
                  } right now.`
                : `Nothing in ${
                    listingFilter === 'auctions' ? 'Auctions' : 'Fixed'
                  } right now.`}
          </p>
        ) : null}

        {mediumFilteredListings.length > 0 ? (
          <section
            id="market-listing-results"
            role="tabpanel"
            aria-labelledby={`market-listing-tab-${listingFilter}`}
            className="market-section"
          >
            <h2 id="market-new" className="sr-only">
              {listingFilter === 'auctions'
                ? 'Auctions'
                : listingFilter === 'fixed'
                  ? 'Fixed price'
                  : 'Listings'}
            </h2>
            <div className="market-listing-list" role="list">
              {mediumFilteredListings.map((item) => {
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
                    isOwnListing={
                      Boolean(viewerAccountId) &&
                      item.kind === 'lazy' &&
                      accountIdsEqual(viewerAccountId!, item.creatorId)
                    }
                    cancelPending={cancelRowKey === rowKey}
                    onBuy={handleBuy}
                    onCancel={(row) => {
                      void handleCancel(row);
                    }}
                  />
                );
              })}
            </div>
            {loadingMore ? <MarketListSkeleton rows={2} /> : null}
            {listingsState.hasMore ? (
              <div
                ref={listingsSentinelRef}
                className="market-listing-sentinel"
                aria-hidden
              />
            ) : null}
          </section>
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
                const priceLabel = Number.parseFloat(offer.amountNear);
                const priceNear = Number.isFinite(priceLabel)
                  ? priceLabel.toLocaleString('en-US', {
                      maximumFractionDigits: 4,
                    })
                  : offer.amountNear;
                return (
                  <div
                    key={`my-offer:${offer.tokenId}`}
                    className="market-listing-row"
                    role="listitem"
                  >
                    <div
                      className={`market-listing-thumb${meta.mediaUrl ? ' has-media' : ''}`}
                      aria-hidden
                    >
                      {meta.mediaUrl ? (
                        <img src={meta.mediaUrl} alt="" />
                      ) : (
                        <span className="market-listing-thumb-fallback" />
                      )}
                    </div>
                    <div className="market-listing-copy">
                      <div className="market-listing-head">
                        <p className="market-listing-title">{meta.title}</p>
                        <p className="market-listing-price">
                          Offer · {priceNear} NEAR
                        </p>
                      </div>
                      <p className="market-listing-meta">
                        <span className="market-listing-own">Open offer</span>
                      </p>
                    </div>
                    <OsSheetActions
                      layout="row-compact"
                      tone="frosted-primary"
                      borderless
                      className="market-listing-action"
                    >
                      <OsSheetAction
                        type="button"
                        variant="primary"
                        ready
                        onClick={() => {
                          const listingOwner =
                            listings.find(
                              (row) => row.tokenId === offer.tokenId
                            )?.creatorId ?? '';
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
                      >
                        Manage
                      </OsSheetAction>
                    </OsSheetActions>
                  </div>
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
              {visibleSales.map((sale, index) => {
                const seller =
                  sale.sellerId?.trim() || sale.creatorId?.trim() || '';
                const saleTime = formatMarketRelativeTime(sale.blockTimestamp);
                const title = sale.postHref ? (
                  <Link
                    href={sale.postHref}
                    scroll={false}
                    className="market-listing-title-link"
                  >
                    {sale.title}
                  </Link>
                ) : (
                  sale.title
                );
                return (
                  <li
                    key={`${sale.listingId ?? sale.tokenId ?? 'sale'}:${sale.blockTimestamp}:${index}`}
                    className="market-sale-row"
                  >
                    <div
                      className={`market-listing-thumb${
                        sale.mediaUrl ? ' has-media' : ''
                      }`}
                      aria-hidden
                    >
                      {sale.mediaUrl ? (
                        <img src={sale.mediaUrl} alt="" />
                      ) : (
                        <span className="market-listing-thumb-fallback" />
                      )}
                    </div>
                    <div className="market-listing-copy">
                      <div className="market-listing-head">
                        <p className="market-sale-title">{title}</p>
                        <p className="market-listing-price">
                          {sale.priceNear} NEAR
                        </p>
                      </div>
                      <p className="market-sale-meta">
                        {seller ? (
                          <Link
                            href={portfolioPath(seller)}
                            scroll={false}
                            className="market-listing-handle"
                          >
                            @{fallbackLabel(seller)}
                          </Link>
                        ) : (
                          'Sale'
                        )}
                        {saleTime ? ` · ${saleTime}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
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
