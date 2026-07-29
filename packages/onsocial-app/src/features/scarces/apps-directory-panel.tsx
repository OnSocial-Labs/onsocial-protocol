'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  PlusIcon,
  SearchField,
  StarMovingFillIcon,
  osIconActionClassName,
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
import { fallbackLabel } from '@/lib/profile-display';

function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function storeMeta(app: AppView): string {
  const parts = [`@${fallbackLabel(app.ownerId)}`];
  const category = hubCategoryLabel(app.category);
  if (category) parts.push(category);
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
    const requestId = ++requestIdRef.current;
    const cold = !hasLoadedOnceRef.current;
    if (cold) setStatus('loading');
    else setRefreshing(true);
    setError(null);

    void (async () => {
      try {
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
        if (cancelled || requestId !== requestIdRef.current) return;
        listingCountsRef.current = counts;
        setApps(mergeLiveListingCounts(page.apps, counts));
        setHasMore(page.hasMore);
        setNextOffset(page.nextOffset);
        hasLoadedOnceRef.current = true;
        setStatus('ready');
      } catch {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError('Couldn’t load hubs.');
        setStatus('error');
        if (!hasLoadedOnceRef.current) {
          setApps([]);
          setHasMore(false);
          setNextOffset(0);
        }
      } finally {
        if (!cancelled && requestId === requestIdRef.current) {
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
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

  return (
    <OsAppScreen
      title="Hubs"
      leading={null}
      actions={
        isConnected ? (
          <Link
            href={APP_APP_CREATE_PATH}
            className={osIconActionClassName}
            aria-label="Open a hub"
          >
            <PlusIcon aria-hidden />
          </Link>
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
        className="apps-directory"
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
          <p className="market-page-status" role="alert">
            {error ?? 'Couldn’t load hubs.'}{' '}
            <button
              type="button"
              className="market-page-retry"
              onClick={() => setRetryKey((value) => value + 1)}
            >
              Retry
            </button>
          </p>
        ) : null}

        {empty ? (
          <div className="market-page-empty">
            <p className="market-page-empty-copy">
              {searching
                ? `No hubs match “${debouncedQuery}”.`
                : category !== 'all'
                  ? `No ${
                      hubCategoryLabel(category) ?? category
                    } hubs right now.`
                  : hideTest
                    ? 'No hubs yet.'
                    : 'No hubs yet. Be the first.'}
            </p>
            {hideTest && !searching && category === 'all' ? (
              <button
                type="button"
                className="market-page-retry"
                onClick={() => setHideTest(false)}
              >
                Show test hubs
              </button>
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
