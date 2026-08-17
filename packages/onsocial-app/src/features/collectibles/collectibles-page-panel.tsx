'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  OsIconAction,
  PlusIcon,
  SearchField,
  ShopFillIcon,
  StarsCFillIcon,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  MarketFacetRail,
  type MarketAudioFormatFilter,
} from '@/features/market/market-facet-rail';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
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
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import {
  APP_COLLECTIBLES_PATH,
  APP_DROP_CREATE_PATH,
  APP_MARKET_PATH,
  MARKET_KIND_PARAM,
  MARKET_FACETS_PARAM,
  MARKET_AUDIO_FORMAT_PARAM,
  marketFacetsParamValue,
  parseMarketFacetsParam,
} from '@/lib/app-routes';
import {
  listOfflineAlbums,
  offlineAlbumToHoldingPeek,
} from '@/lib/collectibles-offline';
import {
  filterHoldingsByMedium,
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
  initialAccountId = null,
  initialHoldings = null,
}: {
  initialAccountId?: string | null;
  initialHoldings?: {
    items: OwnedScarceItem[];
    nextFromEnd: number;
    hasMore: boolean;
  } | null;
} = {}) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [retryKey, setRetryKey] = useState(0);
  const [holdings, setHoldings] = useState<HoldingsState>(() => {
    const account = viewerAccountId ?? initialAccountId;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [offlineHoldings, setOfflineHoldings] = useState<
    PortfolioHoldingPeek[]
  >([]);
  const [offlineReady, setOfflineReady] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  /** Same chrome scroll-hide motion as Market filter rail. */
  const toolbarHidden = useDockAutoHide(false);

  const loadKey = viewerAccountId ? `${viewerAccountId}:${retryKey}` : null;
  const trimmedSearch = searchQuery.trim();

  const setMediumFilter = useCallback(
    (next: MarketMediumFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') {
        params.delete(MARKET_KIND_PARAM);
      } else {
        params.set(MARKET_KIND_PARAM, next);
      }
      params.delete(MARKET_FACETS_PARAM);
      params.delete(MARKET_AUDIO_FORMAT_PARAM);
      const qs = params.toString();
      router.replace(
        qs ? `${APP_COLLECTIBLES_PATH}?${qs}` : APP_COLLECTIBLES_PATH,
        { scroll: false }
      );
    },
    [router, searchParams]
  );

  const replaceDiscoveryParams = useCallback(
    (next: {
      facets?: string[];
      audioFormat?: MarketAudioFormatFilter;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const facets =
        next.facets !== undefined ? next.facets : selectedFacets;
      const audioFormat =
        next.audioFormat !== undefined ? next.audioFormat : audioFormatFilter;
      const facetsValue = marketFacetsParamValue(facets);
      if (facetsValue) params.set(MARKET_FACETS_PARAM, facetsValue);
      else params.delete(MARKET_FACETS_PARAM);
      if (audioFormat) params.set(MARKET_AUDIO_FORMAT_PARAM, audioFormat);
      else params.delete(MARKET_AUDIO_FORMAT_PARAM);
      const qs = params.toString();
      router.replace(
        qs ? `${APP_COLLECTIBLES_PATH}?${qs}` : APP_COLLECTIBLES_PATH,
        { scroll: false }
      );
    },
    [router, searchParams, selectedFacets, audioFormatFilter]
  );

  useEffect(() => {
    if (!viewerAccountId || !loadKey) {
      return;
    }

    // Other-wallet rows are ignored at render (`sameWalletHoldings`); this
    // effect only fetches. Soft retry keeps same-wallet items until replace.
    let cancelled = false;
    void fetchOwnedScarcesPage(viewerAccountId)
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
  }, [viewerAccountId, loadKey]);

  useEffect(() => {
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
  }, [retryKey]);

  const status: LoadStatus = !viewerAccountId
    ? 'idle'
    : holdings.loadKey !== loadKey
      ? 'loading'
      : holdings.failed
        ? 'error'
        : 'ready';

  const loadMore = useCallback(() => {
    if (!viewerAccountId || !holdings.hasMore || loadingMore) return;
    setLoadingMore(true);
    void fetchOwnedScarcesPage(viewerAccountId, {
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
  }, [viewerAccountId, holdings.hasMore, holdings.nextFromEnd, loadingMore]);

  // Same-wallet soft refresh keeps RPC rows; otherwise offline / skeleton.
  const sameWalletHoldings =
    Boolean(viewerAccountId) &&
    holdings.loadKey != null &&
    holdings.loadKey.startsWith(`${viewerAccountId}:`) &&
    holdings.items.length > 0;
  const vaultItems = sameWalletHoldings ? holdings.items : offlineHoldings;
  const usingOfflineLibrary =
    !sameWalletHoldings && offlineHoldings.length > 0;
  const showVaultSkeleton =
    (!offlineReady && !viewerAccountId) ||
    (Boolean(viewerAccountId) &&
      status === 'loading' &&
      vaultItems.length === 0);

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

  /** Client-only discovery filters applied on already-fetched pages. */
  const clientDiscoveryFilterActive =
    trimmedSearch.length > 0 ||
    mediumFilter !== 'all' ||
    (facetMedium != null &&
      (selectedFacets.length > 0 || Boolean(audioFormatFilter)));
  const facetOrFormatActive =
    facetMedium != null &&
    (selectedFacets.length > 0 || Boolean(audioFormatFilter));

  // No auto load-more storm under client filters — user scrolls / taps More.

  const showTabs =
    (isConnected && Boolean(viewerAccountId)) || usingOfflineLibrary;
  const emptyVault =
    !usingOfflineLibrary &&
    status === 'ready' &&
    Boolean(viewerAccountId) &&
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

  return (
    <OsAppScreen
      title="Collectibles"
      leading={null}
      glassChrome
      scrollRootRef={scrollRootRef}
      actions={
        <>
          <OsIconAction asChild ariaLabel="Browse Market">
            <Link href={APP_MARKET_PATH} scroll={false}>
              <ShopFillIcon aria-hidden className="glass-sheet-close-icon" />
            </Link>
          </OsIconAction>
          {viewerAccountId ? (
            <OsIconAction asChild ariaLabel="Start a drop">
              <Link href={APP_DROP_CREATE_PATH} scroll={false}>
                <PlusIcon aria-hidden className="glass-sheet-close-icon" />
              </Link>
            </OsIconAction>
          ) : null}
        </>
      }
      heading={
        <SearchField
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search collectibles"
          clearAriaLabel="Clear search"
          ariaLabel="Search collectibles"
          className="discover-nav-search-field os-app-screen-search"
          leadingIcon={
            <StarsCFillIcon className="search-field-icon" aria-hidden />
          }
        />
      }
      toolbar={
        showTabs ? (
          <div
            className={`os-app-chrome-rail market-listing-toolbar${
              toolbarHidden ? ' is-scroll-hidden' : ''
            }`}
          >
            <div className="market-listing-filter-stack">
              <div
                className="discover-tab-bar market-listing-filters"
                role="tablist"
                aria-label="Collectible kind"
              >
                <div className="discover-tab-bar-scroller">
                  {MARKET_MEDIUM_FILTERS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`collectibles-kind-tab-${tab.id}`}
                      aria-controls="collectibles-results"
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
              {facetMedium ? (
                <MarketFacetRail
                  medium={facetMedium}
                  audioFormat={audioFormatFilter}
                  selectedFacets={selectedFacets}
                  onAudioFormatChange={(format) =>
                    replaceDiscoveryParams({ audioFormat: format })
                  }
                  onFacetsChange={(facets) =>
                    replaceDiscoveryParams({ facets })
                  }
                />
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="market-page collectibles-page">
        {showVaultSkeleton ? <MarketListSkeleton rows={6} /> : null}

        {offlineReady &&
        (!isConnected || !viewerAccountId) &&
        !usingOfflineLibrary ? (
          <div className="market-page-empty">
            <p className="market-page-empty-copy">
              Connect your wallet to open your Collectibles vault.
            </p>
            <Link className="page-drawer-section-action" href={APP_MARKET_PATH}>
              Browse Market
            </Link>
          </div>
        ) : null}

        {viewerAccountId && status === 'error' && !usingOfflineLibrary ? (
          <div className="market-page-status">
            <p>Couldn’t load your collectibles.</p>
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
              Nothing in your vault yet. Collect a scarce on Market, or release
              your own drop.
            </p>
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
                : `No ${emptyFilterLabel.toLowerCase()} in your vault.`}
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

        {filtered.length > 0 &&
        (status === 'ready' || usingOfflineLibrary) ? (
          <section
            className="market-section"
            aria-labelledby="collectibles-results"
          >
            <div
              id="collectibles-results"
              className="market-listing-list"
              role="list"
            >
              {filtered.map((item) => (
                <CollectiblesHoldingRow key={item.tokenId} item={item} />
              ))}
            </div>
          </section>
        ) : null}

        {clientDiscoveryFilterActive &&
        holdings.hasMore &&
        filtered.length === 0 &&
        !emptyFilter &&
        !emptySearch ? (
          <p className="market-page-status">Looking for matches…</p>
        ) : null}

        {(filtered.length > 0 ||
          (clientDiscoveryFilterActive && holdings.hasMore)) &&
        holdings.hasMore &&
        (status === 'ready' || usingOfflineLibrary) ? (
          <button
            type="button"
            className="market-sales-more"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? 'Loading…' : 'Show more'}
          </button>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
