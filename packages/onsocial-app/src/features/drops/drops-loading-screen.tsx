import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  DropsLoadingActions,
  DropsSearchHeading,
} from '@/features/drops/drops-heading';
import { DropsListingToolbar } from '@/features/drops/drops-listing-toolbar';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { APP_MARKET_PATH } from '@/lib/app-routes';
import {
  EMPTY_DROPS_PAGE_QUERY,
  dropsToolbarFromQuery,
  type DropsPageQuery,
} from '@/lib/load-drops-page';

/** Full Drops shell for route `loading.tsx` — same chrome geometry as ready. */
export function DropsLoadingScreen({
  query = EMPTY_DROPS_PAGE_QUERY,
}: {
  query?: DropsPageQuery;
} = {}) {
  const toolbar = dropsToolbarFromQuery(query);

  return (
    <OsAppScreen
      title="Drops"
      compactChrome
      scrollTuck="search"
      dockBack
      leading={null}
      glassChrome
      backFallbackHref={APP_MARKET_PATH}
      heading={<DropsSearchHeading interactive={false} />}
      actions={<DropsLoadingActions />}
      toolbar={
        <DropsListingToolbar
          inert
          sort={toolbar.sort}
          medium={toolbar.kind}
          audioFormat={toolbar.audioFormat}
        />
      }
    >
      <div className="drops-screen-body">
        <div aria-hidden className="os-chrome-glass" />
        <div
          className="market-page-body drops-page-body"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="sr-only">Loading drops…</p>
          <div className="market-section">
            <MarketListSkeleton rows={6} />
          </div>
        </div>
      </div>
    </OsAppScreen>
  );
}
