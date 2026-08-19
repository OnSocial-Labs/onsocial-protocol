'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommunityDiscoverRow } from '@/components/community-cards';
import { ListLoadError } from '@/components/panels/list-load-error';
import { DiscoverBrowseChipRail } from '@/features/discover/discover-browse-chip-rail';
import { DiscoverCommunityHandoff } from '@/features/discover/discover-community-handoff';
import {
  fetchMostLovedScarcePeeks,
  fetchMostTradedScarcePeeks,
  type DiscoverScarcePeek,
} from '@/features/discover/discover-scarce-peeks';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import {
  creatorAccessShort,
  fetchAppsDirectory,
  type AppView,
} from '@/features/scarces/apps-data';
import { APPS_PAGE_SIZE } from '@/features/scarces/apps-directory';
import {
  countHubPrimaryCategories,
  hubCategoryLabel,
  hubDiscoverCategoryFilters,
  type HubCategoryFilter,
} from '@/features/scarces/hub-categories';
import {
  APP_APP_CREATE_PATH,
  APP_APPS_PATH,
  appPath,
  collectionPath,
  dropsPath,
} from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fallbackLabel } from '@/lib/profile-display';

const SCARCE_PEEK_LIMIT = 6;
/** Sample size for Discover category chip census (omit empty curated cats). */
const HUB_CATEGORY_CENSUS_LIMIT = 96;

function hubPrimaryCategory(app: AppView): string | null {
  if (app.categories.length > 0) {
    const raw = app.categories[0]!;
    return hubCategoryLabel(raw) ?? raw;
  }
  return hubCategoryLabel(app.category);
}

function ScarcePeekSection({
  heading,
  seeAllHref,
  rows,
}: {
  heading: string;
  seeAllHref: string;
  rows: DiscoverScarcePeek[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <div className="discover-trending-section-head">
        <h2 className="discover-trending-heading">{heading}</h2>
        <Link href={seeAllHref} className="discover-trending-see-all">
          See all
        </Link>
      </div>
      <ul className="discover-focus-rows">
        {rows.map((scarce) => (
          <li key={`${heading}-${scarce.collectionId}`}>
            <Link
              href={collectionPath(scarce.collectionId)}
              className="discover-focus-row"
            >
              <span className="discover-focus-row-label">
                {scarce.title?.trim() || scarce.collectionId}
              </span>
              {scarce.appId ? (
                <span className="discover-focus-row-meta">{scarce.appId}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Discover → Hubs — network find. My hubs / create live in the Hubs app.
 * Idle: Most traded · Most loved peeks, then hub catalog.
 * Browse chips: curated mint categories that actually have hubs.
 */
export function DiscoverHubsPanel() {
  const { query, clearSearch } = useDiscoverPanel();
  const searchQuery = discoverPeopleSearchQuery(query);
  const [apps, setApps] = useState<AppView[] | null>(null);
  const [categoryFilter, setCategoryFilter] =
    useState<HubCategoryFilter>('all');
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(
    () => new Map()
  );
  const [mostTraded, setMostTraded] = useState<DiscoverScarcePeek[] | null>(
    null
  );
  const [mostLoved, setMostLoved] = useState<DiscoverScarcePeek[] | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const requestIdRef = useRef(0);
  const showScarcePeeks = !searchQuery && categoryFilter === 'all';

  const browseOptions = useMemo(
    () => hubDiscoverCategoryFilters(categoryCounts),
    [categoryCounts]
  );

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
    if (
      categoryFilter !== 'all' &&
      !browseOptions.some((entry) => entry.id === categoryFilter)
    ) {
      setCategoryFilter('all');
    }
  }, [browseOptions, categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestIdRef.current;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
      }
    });

    const timer = window.setTimeout(() => {
      void fetchAppsDirectory({
        limit: APPS_PAGE_SIZE,
        query: searchQuery || undefined,
        category: categoryFilter,
        hideTest: true,
        sort: 'recent',
      })
        .then((page) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setApps(page.apps);
          setPending(false);
          setError(null);
        })
        .catch((cause) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setPending(false);
          setApps([]);
          setError(
            cause instanceof Error ? cause.message : 'Could not load hubs.'
          );
        });
    }, searchQuery ? 220 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [categoryFilter, reloadNonce, searchQuery]);

  useEffect(() => {
    if (!showScarcePeeks) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void fetchMostTradedScarcePeeks(client, SCARCE_PEEK_LIMIT).then((rows) => {
      if (!cancelled) setMostTraded(rows);
    });
    void fetchMostLovedScarcePeeks(client, SCARCE_PEEK_LIMIT).then((rows) => {
      if (!cancelled) setMostLoved(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadNonce, showScarcePeeks]);

  const retry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const showSkeleton = apps == null && pending;
  const isSearchEmpty =
    Boolean(searchQuery) && !pending && apps != null && apps.length === 0;
  const isCategoryEmpty =
    categoryFilter !== 'all' &&
    !searchQuery &&
    !pending &&
    apps != null &&
    apps.length === 0;
  const categoryLabel =
    browseOptions.find((entry) => entry.id === categoryFilter)?.label ??
    hubCategoryLabel(categoryFilter) ??
    categoryFilter;

  return (
    <div
      id="discover-panel-hubs"
      role="tabpanel"
      aria-labelledby="discover-tab-hubs"
      className="standing-panel-body discover-hubs-panel"
    >
      <div className="discover-community-toolbar">
        <p className="launcher-home-empty dao-discover-status">
          {searchQuery
            ? `Searching “${searchQuery}”`
            : categoryFilter !== 'all'
              ? `Hubs · ${categoryLabel}`
              : 'Creator hubs on this network'}
        </p>
        <DiscoverCommunityHandoff
          links={[
            { href: APP_APPS_PATH, label: 'My Hubs' },
            { href: APP_APP_CREATE_PATH, label: 'Create' },
          ]}
        />
      </div>

      <DiscoverBrowseChipRail
        ariaLabel="Browse hubs by category"
        options={browseOptions}
        value={categoryFilter}
        onChange={(next) => setCategoryFilter(next as HubCategoryFilter)}
      />

      {error ? <ListLoadError message={error} onRetry={retry} /> : null}

      {showScarcePeeks ? (
        <>
          {mostTraded === null ? (
            <p className="launcher-home-empty">Loading most traded…</p>
          ) : (
            <ScarcePeekSection
              heading="Most traded"
              seeAllHref={dropsPath({ sort: 'traded' })}
              rows={mostTraded}
            />
          )}
          {mostLoved === null ? (
            <p className="launcher-home-empty">Loading most loved…</p>
          ) : (
            <ScarcePeekSection
              heading="Most loved"
              seeAllHref={dropsPath({ sort: 'loved' })}
              rows={mostLoved}
            />
          )}
        </>
      ) : null}

      {showSkeleton ? (
        <p className="launcher-home-empty">Loading hubs…</p>
      ) : null}

      {!showSkeleton && apps != null && apps.length === 0 ? (
        <div className="standing-panel-empty-block">
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">
              {isSearchEmpty
                ? 'No hubs match that search.'
                : isCategoryEmpty
                  ? 'No hubs in this category yet.'
                  : 'No hubs listed yet.'}
            </p>
            <p className="standing-panel-empty-secondary">
              {isSearchEmpty
                ? 'Try another name or hub id.'
                : isCategoryEmpty
                  ? 'Pick All or another category.'
                  : 'Open a hub in the Hubs app.'}
            </p>
          </div>
          <div className="standing-panel-empty-actions">
            {isSearchEmpty ? (
              <button
                type="button"
                className="standing-panel-empty-action"
                onClick={clearSearch}
              >
                Clear search
              </button>
            ) : isCategoryEmpty ? (
              <button
                type="button"
                className="standing-panel-empty-action"
                onClick={() => setCategoryFilter('all')}
              >
                Show all hubs
              </button>
            ) : (
              <Link
                className="standing-panel-empty-action"
                href={APP_APP_CREATE_PATH}
                scroll={false}
              >
                Open a hub
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {!showSkeleton && apps != null && apps.length > 0 ? (
        <>
          {showScarcePeeks ? (
            <h2 className="discover-trending-heading launcher-home-heading">
              Hubs
            </h2>
          ) : null}
          <div className="community-summary-card-grid apps-directory-list">
            {apps.map((app) => {
              const description = app.description?.trim() || null;
              const category = hubPrimaryCategory(app);
              return (
                <CommunityDiscoverRow
                  key={app.appId}
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
                          fee
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
                      <span className="guild-card-pill">
                        {creatorAccessShort(app.creatorAccess)}
                      </span>
                    </>
                  }
                />
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
