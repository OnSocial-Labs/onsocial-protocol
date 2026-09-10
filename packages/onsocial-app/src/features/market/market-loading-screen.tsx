import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { MARKET_INDEX_PAGE_CLASS } from '@/lib/os-chrome-page';
import {
  MarketLoadingActions,
  MarketSearchHeading,
} from '@/features/market/market-heading';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { MarketListingToolbar } from '@/features/market/market-listing-toolbar';
import {
  EMPTY_MARKET_PAGE_QUERY,
  marketToolbarFromQuery,
  type MarketPageQuery,
} from '@/lib/load-market-page';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';

/** Full Market shell for route `loading.tsx` — same chrome geometry as ready. */
export function MarketLoadingScreen({
  query = EMPTY_MARKET_PAGE_QUERY,
}: {
  query?: MarketPageQuery;
} = {}) {
  const toolbar = marketToolbarFromQuery(query);
  const facetMedium = normalizeDropFacetMedium(toolbar.kind);

  return (
    <OsAppScreen
      title="Market"
      compactChrome
      scrollTuck="search"
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
      glassChrome
      heading={<MarketSearchHeading interactive={false} />}
      actions={<MarketLoadingActions />}
      toolbar={
        <MarketListingToolbar
          inert
          listingFilter={toolbar.listingFilter}
          listingSort={toolbar.listingSort}
          medium={toolbar.kind}
          audioFormat={toolbar.audioFormat}
          selectedFacets={toolbar.facets}
          facetMedium={facetMedium}
          hideListingTypes={Boolean(query.creator)}
        />
      }
    >
      <div
        className={MARKET_INDEX_PAGE_CLASS}
        aria-busy="true"
        aria-live="polite"
      >
        <p className="sr-only">Loading listings…</p>
        <div className="market-section">
          <MarketListSkeleton rows={6} />
        </div>
      </div>
    </OsAppScreen>
  );
}
