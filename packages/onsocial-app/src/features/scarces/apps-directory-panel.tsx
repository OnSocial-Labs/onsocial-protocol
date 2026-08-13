'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  OsIconAction,
  PlusIcon,
  SearchField,
  StarMovingFillIcon,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import {
  creatorAccessShort,
  fetchAppsDirectory,
  fetchStoreLiveListingCounts,
  mergeLiveListingCounts,
  type AppView,
} from '@/features/scarces/apps-data';
import {
  APPS_PAGE_SIZE,
  type AppsDirectorySort,
} from '@/features/scarces/apps-directory';
import { AppsDirectoryCategoryMenu } from '@/features/scarces/apps-directory-category-menu';
import { AppsDirectorySortMenu } from '@/features/scarces/apps-directory-sort-menu';
import {
  hubCategoryLabel,
  type HubCategoryFilter,
} from '@/features/scarces/hub-categories';
import { APP_APP_CREATE_PATH, appPath } from '@/lib/app-routes';
import {
  INDEXER_CATCH_UP_COPY,
  INDEXER_SOFT_RETRY_MS,
} from '@/lib/indexer-soft-retry';
import { fallbackLabel } from '@/lib/profile-display';

function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function storeMeta(app: AppView): string {
  const parts = [`@${fallbackLabel(app.ownerId)}`];
  const topicsLabel =
    app.categories.length > 0
      ? app.categories
          .map((category) => hubCategoryLabel(category) ?? category)
          .join(' · ')
      : hubCategoryLabel(app.category);
  if (topicsLabel) parts.push(topicsLabel);
  parts.push(creatorAccessShort(app.creatorAccess));
  if (app.liveListingCount && app.liveListingCount > 0) {
    parts.push(
      app.liveListingCount === 1
        ? '1 listed'
        : `${app.liveListingCount} listed`
    );
  }
  return parts.join(' · ');
}

export function AppsDirectoryPanel({ initial }: { initial: AppView[] }) {
  const { isConnected } = useAppWallet();
  const [apps, setApps] = useState<AppView[]>(initial);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<HubCategoryFilter>('all');
  const [sort, setSort] = useState<AppsDirectorySort>('recent');
  const [hideTest, setHideTest] = useState(true);
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>(
    initial.length === 0 ? 'loading' : 'ready'
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initial.length >= APPS_PAGE_SIZE);
  const [nextOffset, setNextOffset] = useState(initial.length);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [indexerCatchUp, setIndexerCatchUp] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toolbarHidden = useDockAutoHide(menuOpen);
  const listingCountsRef = useRef<Map<string, number> | null>(null);
  const requestIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(initial.length > 0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const softTimers: number[] = [];
    const requestId = ++requestIdRef.current;
    const cold = !hasLoadedOnceRef.current;
    if (cold) setStatus('loading');
    else setRefreshing(true);
    setError(null);
    setIndexerCatchUp(false);

    async function loadPage(opts?: { soft?: boolean }) {
      const [page, counts] = await Promise.all([
        fetchAppsDirectory({
          limit: APPS_PAGE_SIZE,
          query: debouncedQuery || undefined,
          category,
          sort,
          hideTest,
        }),
        listingCountsRef.current
          ? Promise.resolve(listingCountsRef.current)
          : fetchStoreLiveListingCounts(),
      ]);
      if (cancelled || requestId !== requestIdRef.current) return null;
      listingCountsRef.current = counts;
      setApps(mergeLiveListingCounts(page.apps, counts));
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
      hasLoadedOnceRef.current = true;
      setStatus('ready');
      if (!opts?.soft) setRefreshing(false);
      return page;
    }

    void loadPage()
      .then((page) => {
        if (cancelled || requestId !== requestIdRef.current || !page) return;
        if (page.apps.length > 0) {
          setIndexerCatchUp(false);
          return;
        }
        setIndexerCatchUp(true);
        INDEXER_SOFT_RETRY_MS.forEach((delay, index) => {
          softTimers.push(
            window.setTimeout(() => {
              void loadPage({ soft: true }).then((retryPage) => {
                if (cancelled || requestId !== requestIdRef.current) return;
                if (retryPage && retryPage.apps.length > 0) {
                  setIndexerCatchUp(false);
                } else if (index === INDEXER_SOFT_RETRY_MS.length - 1) {
                  setIndexerCatchUp(false);
                }
              });
            }, delay)
          );
        });
      })
      .catch(() => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError('Couldn’t load hubs.');
        setStatus('error');
        setIndexerCatchUp(false);
        if (!hasLoadedOnceRef.current) {
          setApps([]);
          setHasMore(false);
          setNextOffset(0);
        }
      })
      .finally(() => {
        if (!cancelled && requestId === requestIdRef.current) {
          setRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
      for (const timer of softTimers) window.clearTimeout(timer);
    };
  }, [debouncedQuery, category, sort, hideTest, retryKey]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchAppsDirectory({
        fromIndex: nextOffset,
        limit: APPS_PAGE_SIZE,
        query: debouncedQuery || undefined,
        category,
        sort,
        hideTest,
      });
      const counts = listingCountsRef.current ?? new Map();
      const next = mergeLiveListingCounts(page.apps, counts);
      setApps((prev) => {
        const seen = new Set(prev.map((row) => row.appId));
        return [...prev, ...next.filter((row) => !seen.has(row.appId))];
      });
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
    } catch {
      setError('Couldn’t load more hubs.');
    } finally {
      setLoadingMore(false);
    }
  }

  const searching = Boolean(debouncedQuery);
  const empty = status === 'ready' && apps.length === 0 && !error;
  const showSkeleton = status === 'loading' && apps.length === 0;
  const emptyCentered = searching || category === 'all';

  let emptyPrimary: string;
  if (searching) {
    emptyPrimary = `No hubs match “${debouncedQuery}”.`;
  } else if (category !== 'all') {
    emptyPrimary = `No ${hubCategoryLabel(category) ?? category} hubs right now.`;
  } else if (hideTest) {
    emptyPrimary = 'No hubs yet.';
  } else {
    emptyPrimary = 'No hubs yet. Be the first.';
  }

  return (
    <OsAppScreen
      title="Hubs"
      leading={null}
      actions={
        isConnected ? (
          <OsIconAction asChild ariaLabel="Open a hub">
            <Link href={APP_APP_CREATE_PATH} scroll={false}>
              <PlusIcon aria-hidden className="glass-sheet-close-icon" />
            </Link>
          </OsIconAction>
        ) : undefined
      }
      heading={
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder="Search hubs"
          clearAriaLabel="Clear search"
          ariaLabel="Search hubs"
          className="discover-nav-search-field os-app-screen-search"
          leadingIcon={
            <StarMovingFillIcon className="search-field-icon" aria-hidden />
          }
        />
      }
      toolbar={
        <div
          className={`os-app-chrome-rail market-listing-toolbar${
            toolbarHidden ? ' is-scroll-hidden' : ''
          }`}
        >
          <AppsDirectoryCategoryMenu
            category={category}
            onCategoryChange={setCategory}
            onOpenChange={setMenuOpen}
          />
          <AppsDirectorySortMenu
            sort={sort}
            onSortChange={setSort}
            onOpenChange={setMenuOpen}
          />
        </div>
      }
    >
      <div
        className={`apps-directory${refreshing ? ' is-refreshing' : ''}`}
        id="hubs-directory-results"
        aria-busy={refreshing || undefined}
      >
        {showSkeleton ? (
          <div className="market-section" aria-busy="true" aria-live="polite">
            <p className="sr-only">Loading hubs…</p>
            <MarketListSkeleton rows={5} />
          </div>
        ) : null}

        {status === 'error' && apps.length === 0 ? (
          <div className="standing-panel-empty-block is-centered">
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary" role="alert">
                {error ?? 'Couldn’t load hubs.'}
              </p>
            </div>
            <div className="standing-panel-empty-actions">
              <button
                type="button"
                className="standing-panel-empty-action"
                onClick={() => setRetryKey((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {empty ? (
          <div
            className={`standing-panel-empty-block${
              searching
                ? ' is-search'
                : emptyCentered
                  ? ' is-centered'
                  : ''
            }`}
          >
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">{emptyPrimary}</p>
              {indexerCatchUp && !searching ? (
                <p className="standing-panel-empty-secondary">
                  {INDEXER_CATCH_UP_COPY}
                </p>
              ) : null}
            </div>
            {searching ||
            (hideTest && !searching && category === 'all') ||
            (isConnected && !searching) ? (
              <div className="standing-panel-empty-actions">
                {searching ? (
                  <button
                    type="button"
                    className="standing-panel-empty-action"
                    onClick={() => setQuery('')}
                  >
                    Clear search
                  </button>
                ) : null}
                {hideTest && !searching && category === 'all' ? (
                  <button
                    type="button"
                    className="standing-panel-empty-action"
                    onClick={() => setHideTest(false)}
                  >
                    Show test hubs
                  </button>
                ) : null}
                {isConnected && !searching ? (
                  <Link
                    href={APP_APP_CREATE_PATH}
                    className="standing-panel-empty-action"
                  >
                    Open a hub
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!showSkeleton && apps.length > 0 ? (
          <>
            <ul className="market-listing-list apps-directory-list">
              {apps.map((app) => (
                <li key={app.appId}>
                  <Link
                    href={appPath(app.appId)}
                    scroll={false}
                    className="market-listing-row apps-directory-row"
                  >
                    <span
                      className={`market-listing-thumb apps-directory-logo${
                        app.mediaUrl ? ' has-media' : ''
                      }`}
                      aria-hidden
                    >
                      {app.mediaUrl ? (
                        <img src={app.mediaUrl} alt="" />
                      ) : (
                        <span className="apps-directory-logo-fallback">
                          {monogram(app.title)}
                        </span>
                      )}
                    </span>
                    <span className="market-listing-copy">
                      <span className="market-listing-head">
                        <span className="market-listing-title">
                          {app.title}
                        </span>
                        <span className="market-listing-price">
                          {app.commissionPct}%
                        </span>
                      </span>
                      <span className="market-listing-meta">
                        {storeMeta(app)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {hasMore ? (
              <div className="apps-directory-more">
                {loadingMore ? (
                  <MarketListSkeleton rows={2} />
                ) : (
                  <button
                    type="button"
                    className="apps-directory-more-btn"
                    onClick={() => void loadMore()}
                  >
                    Load more
                  </button>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
