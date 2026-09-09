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
import type { MarketMediumFilter } from '@/features/market/market-medium';
import { peekOwnedVaultPage } from '@/features/market/owned-vault-cache';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { VAULT_PAGE_CLASS } from '@/lib/os-chrome-page';
import { normalizeAccountRoute } from '@/lib/account-route';
import { resolveCollectiblesHeldKinds } from '@/lib/collectibles-held-kinds';
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

function documentCookieSnapshot() {
  return document.cookie;
}

function routeAccountId(accountId: unknown): string {
  return typeof accountId === 'string'
    ? normalizeAccountRoute(accountId) ?? ''
    : '';
}

/**
 * Full vault shell for route `loading.tsx` and the connected OS hop.
 * Server loading passes URL query + last held kinds so hard refresh matches ready.
 */
export function CollectiblesLoadingScreen({
  pageAccountId: pageAccountIdProp,
  query: queryProp,
  heldKinds: heldKindsProp,
}: {
  pageAccountId?: string | null;
  query?: CollectiblesPageQuery;
  heldKinds?: MarketMediumFilter[] | null;
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
  const cookieSource = useSyncExternalStore(
    subscribeNoop,
    documentCookieSnapshot,
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
  const cachedItems = pageAccountId
    ? (peekOwnedVaultPage(pageAccountId)?.items ?? [])
    : [];
  const heldKinds = resolveCollectiblesHeldKinds({
    items: cachedItems,
    selected: toolbar.kind,
    accountId: pageAccountId,
    seedHeldKinds: heldKindsProp,
    cookieSource,
  });
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
          heldKinds={heldKinds}
        />
      }
    >
      <div
        className={VAULT_PAGE_CLASS}
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
