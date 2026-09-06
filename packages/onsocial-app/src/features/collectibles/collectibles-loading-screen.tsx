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
import { normalizeAccountRoute } from '@/lib/account-route';
import {
  COLLECTIBLES_HELD_KINDS_COOKIE,
  cookieValueFromCookieSource,
  parseCollectiblesHeldKindsCookie,
} from '@/lib/collectibles-held-kinds';
import {
  EMPTY_COLLECTIBLES_PAGE_QUERY,
  collectiblesAccountIdFromPathname,
  collectiblesToolbarFromQuery,
  parseCollectiblesPageQueryFromSearch,
  type CollectiblesPageQuery,
} from '@/lib/load-collectibles-page';
import { portfolioPath } from '@/lib/overlay-routes';
import { vaultHeldKindFilters } from '@/lib/portfolio-holdings';

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

function heldKindsFromVaultCache(
  accountId: string,
  selected: MarketMediumFilter
): MarketMediumFilter[] {
  const page = peekOwnedVaultPage(accountId);
  if (!page) return vaultHeldKindFilters([], selected);
  return vaultHeldKindFilters(page.items, selected);
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
  const cachedKinds = pageAccountId
    ? heldKindsFromVaultCache(pageAccountId, toolbar.kind)
    : vaultHeldKindFilters([], toolbar.kind);
  const cookieKinds = pageAccountId
    ? parseCollectiblesHeldKindsCookie(
        cookieValueFromCookieSource(
          cookieSource,
          COLLECTIBLES_HELD_KINDS_COOKIE
        ),
        pageAccountId
      )
    : null;
  const rememberedKinds =
    heldKindsProp && heldKindsProp.length > 0
      ? heldKindsProp
      : cookieKinds && cookieKinds.length > 0
        ? cookieKinds
        : null;
  const heldKinds =
    rememberedKinds && rememberedKinds.length > 0
      ? vaultHeldKindFilters(
          rememberedKinds
            .filter((id) => id !== 'all')
            .map((mediumKind) => ({ mediumKind })),
          toolbar.kind
        )
      : cachedKinds;
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
