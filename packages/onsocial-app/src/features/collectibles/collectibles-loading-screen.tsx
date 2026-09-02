import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesHeaderActions } from '@/features/collectibles/collectibles-header-actions';
import {
  CollectiblesFilterToolbar,
  CollectiblesSearchHeading,
} from '@/features/collectibles/collectibles-page-chrome';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  EMPTY_COLLECTIBLES_PAGE_QUERY,
  collectiblesToolbarFromQuery,
  type CollectiblesPageQuery,
} from '@/lib/load-collectibles-page';

/** Full vault shell for route `loading.tsx` — same chrome geometry as ready. */
export function CollectiblesLoadingScreen({
  query = EMPTY_COLLECTIBLES_PAGE_QUERY,
}: {
  query?: CollectiblesPageQuery;
} = {}) {
  const toolbar = collectiblesToolbarFromQuery(query);

  return (
    <OsAppScreen
      title="Collectibles"
      compactChrome
      scrollTuck="search"
      dockBack
      leading={null}
      glassChrome
      backFallbackHref={APP_HOME_PATH}
      heading={<CollectiblesSearchHeading query={toolbar.q} interactive={false} />}
      actions={<CollectiblesHeaderActions />}
      toolbar={
        <CollectiblesFilterToolbar
          inert
          medium={toolbar.kind}
          audioFormat={toolbar.audioFormat}
          selectedFacets={toolbar.facets}
        />
      }
    >
      <div className="market-page collectibles-page" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading collectibles…</p>
        <div className="market-section">
          <MarketListSkeleton rows={6} />
        </div>
      </div>
    </OsAppScreen>
  );
}
