'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PlusIcon,
  SearchField,
  ShopFillIcon,
  StarsCFillIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import { fetchOwnedScarcesPage } from '@/features/market/market-listings';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import {
  APP_COLLECTIBLES_PATH,
  APP_DROP_CREATE_PATH,
  APP_MARKET_PATH,
  MARKET_KIND_PARAM,
} from '@/lib/app-routes';
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

export function CollectiblesPagePanel() {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mediumFilter = parseMediumFilter(searchParams.get(MARKET_KIND_PARAM));
  const [retryKey, setRetryKey] = useState(0);
  const [holdings, setHoldings] = useState<HoldingsState>(EMPTY_HOLDINGS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
      const qs = params.toString();
      router.replace(
        qs ? `${APP_COLLECTIBLES_PATH}?${qs}` : APP_COLLECTIBLES_PATH,
        { scroll: false }
      );
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (!viewerAccountId || !loadKey) {
      return;
    }

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

  const filtered = useMemo(() => {
    const byKind = filterHoldingsByMedium(holdings.items, mediumFilter);
    if (!trimmedSearch) return byKind;
    return byKind.filter((item) => holdingsMatchQuery(item, trimmedSearch));
  }, [holdings.items, mediumFilter, trimmedSearch]);

  const showTabs = isConnected && Boolean(viewerAccountId);
  const emptyVault =
    status === 'ready' &&
    Boolean(viewerAccountId) &&
    holdings.items.length === 0;
  const emptySearch =
    status === 'ready' &&
    Boolean(viewerAccountId) &&
    holdings.items.length > 0 &&
    trimmedSearch.length > 0 &&
    filtered.length === 0;
  const emptyFilter =
    status === 'ready' &&
    Boolean(viewerAccountId) &&
    holdings.items.length > 0 &&
    !trimmedSearch &&
    filtered.length === 0;
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
          <Link
            href={APP_MARKET_PATH}
            className={osIconActionClassName}
            aria-label="Browse Market"
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
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="market-page collectibles-page">
        {!isConnected || !viewerAccountId ? (
          <div className="market-page-empty">
            <p className="market-page-empty-copy">
              Connect your wallet to open your Collectibles vault.
            </p>
            <Link className="page-drawer-section-action" href={APP_MARKET_PATH}>
              Browse Market
            </Link>
          </div>
        ) : null}

        {viewerAccountId && status === 'loading' ? (
          <MarketListSkeleton rows={6} />
        ) : null}

        {viewerAccountId && status === 'error' ? (
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
              No {emptyFilterLabel.toLowerCase()} in your vault.
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

        {viewerAccountId && status === 'ready' && filtered.length > 0 ? (
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
            {holdings.hasMore ? (
              <button
                type="button"
                className="market-sales-more"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? 'Loading…' : 'Show more'}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
