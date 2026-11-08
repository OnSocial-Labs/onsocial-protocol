'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommunityDiscoverRow } from '@/components/community-cards';
import { OsChromeListAlert } from '@/components/chrome/os-chrome-whisper';
import { ListLoadError } from '@/components/panels/list-load-error';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { DiscoverCommunityListSkeleton } from '@/features/discover/discover-loading-skeleton';
import { DiscoverTabLead } from '@/features/discover/discover-tab-lead';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import { SECONDARY_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useDiscoverChipLabel, useShellHomeMessage } from '@/lib/use-shell';
import { useTranslations } from 'next-intl';
import {
  fetchAppsDirectory,
  fetchHubsBrowsePage,
  type AppView,
  type HubsBrowseCursor,
} from '@/features/scarces/apps-data';
import { APPS_PAGE_SIZE } from '@/features/scarces/apps-directory';
import {
  countHubPrimaryCategories,
  hubCategoryLabel,
  hubDiscoverCategoryFilters,
  HUB_CATEGORY_CENSUS_LIMIT,
  type HubCategoryFilter,
} from '@/features/scarces/hub-categories';
import { APP_APP_CREATE_PATH, APP_APPS_PATH, appPath } from '@/lib/app-routes';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { fallbackLabel } from '@/lib/profile-display';

function hubPrimaryCategoryId(app: AppView): string | null {
  const fromList = app.categories[0]?.trim();
  if (fromList) return fromList;
  const single = app.category?.trim();
  return single || null;
}

/**
 * Discover → Hubs — the hub directory.
 * Browse leads with the last drop, mint, or sale, then hubs that have not moved.
 * Infinite scroll keeps loading until every hub has been listed.
 * A long list windows like Guilds so off-screen rows are not mounted.
 * Search still covers every hub. Category chips narrow both.
 * Drop rankings (Loved, Traded) live on Drops. My hubs / create live in the Hubs app.
 */
export function DiscoverHubsPanel() {
  const { query, scrollRootRef } = useDiscoverPanel();
  const t = useTranslations('shell');
  const chipLabel = useDiscoverChipLabel();
  const searchQuery = discoverPeopleSearchQuery(query);
  const [apps, setApps] = useState<AppView[] | null>(null);
  const [categoryFilter, setCategoryFilter] =
    useState<HubCategoryFilter>('all');
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(
    () => new Map()
  );
  const [pending, setPending] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const requestIdRef = useRef(0);
  const moreLoadingRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HubsBrowseCursor>({ phase: 'activity', offset: 0 });
  const searchOffsetRef = useRef(0);

  const browseOptions = useMemo(
    () => hubDiscoverCategoryFilters(categoryCounts),
    [categoryCounts]
  );
  const activeCategoryFilter = useMemo((): HubCategoryFilter => {
    if (
      categoryFilter !== 'all' &&
      !browseOptions.some((entry) => entry.id === categoryFilter)
    ) {
      return 'all';
    }
    return categoryFilter;
  }, [browseOptions, categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    void fetchAppsDirectory({
      limit: HUB_CATEGORY_CENSUS_LIMIT,
      hideTest: true,
      sort: 'recent',
      category: 'all',
    }).then((page) => {
      if (cancelled) return;
      setCategoryCounts(countHubPrimaryCategories(page.apps));
    });
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
        setLoadMoreError(null);
        setHasMore(false);
        setMoreLoading(false);
        moreLoadingRef.current = false;
      }
    });

    const timer = window.setTimeout(
      () => {
        const load = searchQuery
          ? fetchAppsDirectory({
              limit: APPS_PAGE_SIZE,
              query: searchQuery,
              category: activeCategoryFilter,
              hideTest: true,
              sort: 'recent',
            }).then((page) => ({
              apps: page.apps,
              hasMore: page.hasMore,
              searchOffset: page.nextOffset,
              cursor: null as HubsBrowseCursor | null,
            }))
          : fetchHubsBrowsePage({
              limit: APPS_PAGE_SIZE,
              category: activeCategoryFilter,
              hideTest: true,
              cursor: { phase: 'activity', offset: 0 },
            }).then((page) => ({
              apps: page.apps,
              hasMore: page.hasMore,
              searchOffset: 0,
              cursor: page.cursor,
            }));
        void load
          .then((page) => {
            if (cancelled || requestId !== requestIdRef.current) return;
            setApps(page.apps);
            setHasMore(page.hasMore);
            setPending(false);
            setError(null);
            if (page.cursor) cursorRef.current = page.cursor;
            searchOffsetRef.current = page.searchOffset;
          })
          .catch((cause) => {
            if (cancelled || requestId !== requestIdRef.current) return;
            setPending(false);
            setApps([]);
            setHasMore(false);
            setError(
              cause instanceof Error ? cause.message : 'Could not load hubs.'
            );
          });
      },
      searchQuery ? 220 : 0
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeCategoryFilter, reloadNonce, searchQuery]);

  const retry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (moreLoadingRef.current || !hasMore) return;
    const requestId = requestIdRef.current;
    moreLoadingRef.current = true;
    setMoreLoading(true);
    setLoadMoreError(null);
    const load = searchQuery
      ? fetchAppsDirectory({
          limit: APPS_PAGE_SIZE,
          fromIndex: searchOffsetRef.current,
          query: searchQuery,
          category: activeCategoryFilter,
          hideTest: true,
          sort: 'recent',
        }).then((page) => ({
          apps: page.apps,
          hasMore: page.hasMore,
          searchOffset: page.nextOffset,
          cursor: null as HubsBrowseCursor | null,
        }))
      : fetchHubsBrowsePage({
          limit: APPS_PAGE_SIZE,
          category: activeCategoryFilter,
          hideTest: true,
          cursor: cursorRef.current,
          excludeIds: (apps ?? []).map((app) => app.appId),
        }).then((page) => ({
          apps: page.apps,
          hasMore: page.hasMore,
          searchOffset: searchOffsetRef.current,
          cursor: page.cursor,
        }));
    void load
      .then((page) => {
        if (requestId !== requestIdRef.current) return;
        setApps((prev) => {
          const seen = new Set((prev ?? []).map((app) => app.appId));
          const next = [...(prev ?? [])];
          for (const app of page.apps) {
            if (seen.has(app.appId)) continue;
            seen.add(app.appId);
            next.push(app);
          }
          return next;
        });
        setHasMore(page.hasMore);
        if (page.cursor) cursorRef.current = page.cursor;
        searchOffsetRef.current = page.searchOffset;
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setLoadMoreError('Could not load more hubs.');
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        moreLoadingRef.current = false;
        setMoreLoading(false);
      });
  }, [activeCategoryFilter, apps, hasMore, searchQuery]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled: hasMore && !moreLoading && !pending && !loadMoreError && !error,
    onIntersect: loadMore,
  });

  const showSkeleton = apps == null && pending;
  const isSearchEmpty =
    Boolean(searchQuery) &&
    !pending &&
    !hasMore &&
    apps != null &&
    apps.length === 0;
  const isCategoryEmpty =
    activeCategoryFilter !== 'all' &&
    !searchQuery &&
    !pending &&
    !hasMore &&
    apps != null &&
    apps.length === 0;
  const categoryLabel = chipLabel(
    activeCategoryFilter,
    browseOptions.find((entry) => entry.id === activeCategoryFilter)?.label ??
      hubCategoryLabel(activeCategoryFilter) ??
      activeCategoryFilter
  );
  const filterChips = browseOptions.map((entry) => ({
    id: entry.id,
    label: chipLabel(entry.id, entry.label),
  }));
  const shownError = useShellHomeMessage(error ?? '');
  const shownLoadMoreError = useShellHomeMessage(loadMoreError ?? '');
  const hubKeys = useMemo(() => (apps ?? []).map((app) => app.appId), [apps]);
  const { windowed, start, end, topSpacer, bottomSpacer, registerRow } =
    useFeedWindow({
      keys: hubKeys,
      hostRef: listRef,
      anchorQuery: SECONDARY_ANCHOR_QUERY,
      estimate: 112,
    });

  return (
    <div
      id="discover-panel-hubs"
      role="tabpanel"
      aria-labelledby="discover-tab-hubs"
      className="standing-panel-body discover-hubs-panel"
    >
      <DiscoverTabLead
        links={[
          { href: APP_APPS_PATH, label: t('discover.myHubs') },
          { href: APP_APP_CREATE_PATH, label: t('discover.create') },
        ]}
      >
        {activeCategoryFilter !== 'all'
          ? t('discover.hubsIn', { topic: categoryLabel })
          : t('discover.creatorHubs')}
      </DiscoverTabLead>

      {filterChips.length > 1 ? (
        <OsChipRail
          variant="browse"
          ariaLabel={t('discover.browseHubs')}
          items={filterChips}
          value={activeCategoryFilter}
          onValueChange={(next) => setCategoryFilter(next as HubCategoryFilter)}
        />
      ) : null}

      {error ? (
        apps != null && apps.length > 0 ? (
          <OsChromeListAlert message={shownError} onRetry={retry} />
        ) : (
          <ListLoadError message={shownError} onRetry={retry} />
        )
      ) : null}

      {showSkeleton ? (
        <DiscoverCommunityListSkeleton label={t('discover.loadingHubs')} />
      ) : null}

      {!showSkeleton &&
      !pending &&
      !hasMore &&
      apps != null &&
      apps.length === 0 &&
      (!searchQuery || isSearchEmpty) ? (
        <div className="standing-panel-empty-block">
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">
              {isSearchEmpty
                ? t('discover.noMatches')
                : isCategoryEmpty
                  ? t('discover.noHubsCategory')
                  : t('discover.noHubs')}
            </p>
            {isSearchEmpty ? null : (
              <p className="standing-panel-empty-secondary">
                {isCategoryEmpty
                  ? t('discover.pickCategory')
                  : t('discover.openHubInApp')}
              </p>
            )}
          </div>
          {isSearchEmpty ? null : (
            <div className="standing-panel-empty-actions">
              {isCategoryEmpty ? (
                <OsEmptyAction onClick={() => setCategoryFilter('all')}>
                  {t('discover.showAllHubs')}
                </OsEmptyAction>
              ) : (
                <OsEmptyAction href={APP_APP_CREATE_PATH}>
                  {t('homeChrome.openHub')}
                </OsEmptyAction>
              )}
            </div>
          )}
        </div>
      ) : null}

      {!showSkeleton && apps != null && apps.length > 0 ? (
        <div
          ref={listRef}
          className="community-summary-card-grid apps-directory-list"
        >
          {windowed && topSpacer > 0 ? (
            <div
              style={{ height: topSpacer }}
              aria-hidden="true"
              data-feed-window-spacer="top"
            />
          ) : null}
          {apps.slice(start, end).map((app) => {
            const description = app.description?.trim() || null;
            const categoryId = hubPrimaryCategoryId(app);
            const category = categoryId
              ? chipLabel(
                  categoryId,
                  hubCategoryLabel(categoryId) ?? categoryId
                )
              : null;
            const access =
              app.creatorAccess === 'open'
                ? t('create.open')
                : app.creatorAccess === 'approval'
                  ? t('create.approval')
                  : t('create.invite');
            return (
              <div
                key={app.appId}
                ref={registerRow(app.appId)}
                data-secondary-key={app.appId}
              >
                <CommunityDiscoverRow
                  href={appPath(app.appId)}
                  seedId={app.appId}
                  bannerUrl={app.bannerUrl}
                  markUrl={app.mediaUrl}
                  markVariant="logo"
                  title={app.title}
                  description={description}
                  meta={
                    <>
                      <span className="community-summary-stat">
                        <span className="community-summary-stat-count">
                          {app.commissionPct}%
                        </span>
                        <span className="community-summary-stat-label">
                          {t('discover.fee')}
                        </span>
                      </span>
                      <span className="community-summary-stat">
                        <span className="community-summary-stat-label">
                          @{fallbackLabel(app.ownerId)}
                        </span>
                      </span>
                      {category ? (
                        <span className="guild-card-pill guild-card-pill--topic">
                          {category}
                        </span>
                      ) : null}
                      <span className="guild-card-pill">{access}</span>
                    </>
                  }
                />
              </div>
            );
          })}
          {windowed && bottomSpacer > 0 ? (
            <div
              style={{ height: bottomSpacer }}
              aria-hidden="true"
              data-feed-window-spacer="bottom"
            />
          ) : null}
        </div>
      ) : null}

      {loadMoreError ? (
        <OsChromeListAlert
          message={shownLoadMoreError}
          onRetry={() => void loadMore()}
        />
      ) : hasMore || moreLoading ? (
        <div className="dao-discover-load-more">
          <div
            ref={loadMoreRef}
            className="protocol-feed-sentinel"
            aria-hidden
          />
          {moreLoading ? (
            <DiscoverCommunityListSkeleton
              label={t('discover.loadingMoreHubs')}
              count={2}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
