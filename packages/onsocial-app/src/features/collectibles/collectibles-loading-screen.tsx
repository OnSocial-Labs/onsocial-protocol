'use client';

import { useParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesHeaderActions } from '@/features/collectibles/collectibles-header-actions';
import { CollectiblesLibrarySkeleton } from '@/features/collectibles/collectibles-library-skeleton';
import {
  CollectiblesFilterToolbar,
  CollectiblesSearchHeading,
} from '@/features/collectibles/collectibles-page-chrome';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { normalizeAccountRoute } from '@/lib/account-route';
import {
  EMPTY_COLLECTIBLES_PAGE_QUERY,
  collectiblesAccountIdFromPathname,
  collectiblesToolbarFromQuery,
  parseCollectiblesPageQueryFromSearch,
  type CollectiblesPageQuery,
} from '@/lib/load-collectibles-page';
import { portfolioPath } from '@/lib/overlay-routes';

function subscribeNoop() {
  return () => undefined;
}

function locationSearchSnapshot() {
  return window.location.search;
}

function locationPathnameSnapshot() {
  return window.location.pathname;
}

function emptySnapshot() {
  return '';
}

function routeAccountId(accountId: unknown): string {
  return typeof accountId === 'string'
    ? normalizeAccountRoute(accountId) ?? ''
    : '';
}

/**
 * Full vault shell for route `loading.tsx` and the connected OS hop.
 * Reads the URL on the client so `?kind=` / `?sort=` chrome matches ready.
 */
export function CollectiblesLoadingScreen({
  pageAccountId: pageAccountIdProp,
  query: queryProp,
}: {
  pageAccountId?: string | null;
  query?: CollectiblesPageQuery;
} = {}) {
  const params = useParams();
  const locationSearch = useSyncExternalStore(
    subscribeNoop,
    locationSearchSnapshot,
    emptySnapshot
  );
  const locationPathname = useSyncExternalStore(
    subscribeNoop,
    locationPathnameSnapshot,
    emptySnapshot
  );
  const pageAccountId =
    pageAccountIdProp?.trim() ||
    routeAccountId(params.accountId) ||
    collectiblesAccountIdFromPathname(locationPathname) ||
    '';
  const query =
    queryProp ??
    (locationSearch
      ? parseCollectiblesPageQueryFromSearch(locationSearch)
      : EMPTY_COLLECTIBLES_PAGE_QUERY);
  const toolbar = collectiblesToolbarFromQuery(query);
  const backHref = pageAccountId ? portfolioPath(pageAccountId) : APP_HOME_PATH;

  return (
    <OsAppScreen
      title="Collectibles"
      compactChrome
      scrollTuck="search"
      dockBack
      leading={null}
      glassChrome
      backFallbackHref={backHref}
      heading={<CollectiblesSearchHeading query={toolbar.q} interactive={false} />}
      actions={<CollectiblesHeaderActions pageAccountId={pageAccountId || null} />}
      toolbar={
        <CollectiblesFilterToolbar
          inert
          medium={toolbar.kind}
          audioFormat={toolbar.audioFormat}
          selectedFacets={toolbar.facets}
          selectedCreator={toolbar.creator}
          selectedSeries={toolbar.series}
          sort={toolbar.sort}
        />
      }
    >
      <div
        className="market-page collectibles-page"
        aria-busy="true"
        aria-live="polite"
        data-collectibles-loading-screen
        data-collectibles-back={backHref}
      >
        <p className="sr-only">Loading collectibles…</p>
        <section className="market-section collectibles-library">
          <CollectiblesLibrarySkeleton />
        </section>
      </div>
    </OsAppScreen>
  );
}
