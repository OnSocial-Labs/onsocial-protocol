'use client';

import { useSearchParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { MARKET_INDEX_PAGE_CLASS } from '@/lib/os-chrome-page';
import { MarketSearchHeading } from '@/features/market/market-heading';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { MarketListingToolbar } from '@/features/market/market-listing-toolbar';
import {
  marketCreatorBackHref,
  marketCreatorScreenTitle,
  marketCreatorShop,
} from '@/features/market/market-creator-view';
import {
  marketToolbarFromQuery,
  parseMarketPageQueryFromSearch,
} from '@/lib/load-market-page';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';
import { useCatalogDockBack } from '@/hooks/use-catalog-dock-back';

/** Full Market shell for route `loading.tsx` — same chrome geometry as ready. */
export function MarketLoadingScreen() {
  const searchParams = useSearchParams();
  const query = parseMarketPageQueryFromSearch(
    searchParams.size > 0 ? `?${searchParams.toString()}` : ''
  );
  const toolbar = marketToolbarFromQuery(query);
  const facetMedium = normalizeDropFacetMedium(toolbar.kind);
  const shopMode = marketCreatorShop(query.creator);
  const marketLeaveHref = shopMode
    ? marketCreatorBackHref()
    : APP_HOME_PATH;
  const onDockBack = useCatalogDockBack(marketLeaveHref);
  const creatorId = query.creator?.trim() ?? '';

  return (
    <OsAppScreen
      title={
        shopMode
          ? marketCreatorScreenTitle({ creatorId })
          : 'Market'
      }
      compactChrome
      scrollTuck="search"
      dockBack
      leading={null}
      onDockBack={onDockBack}
      backFallbackHref={marketLeaveHref}
      glassChrome
      heading={<MarketSearchHeading interactive={false} />}
      toolbar={
        <MarketListingToolbar
          inert
          listingFilter={toolbar.listingFilter}
          listingSort={toolbar.listingSort}
          medium={toolbar.kind}
          audioFormat={toolbar.audioFormat}
          selectedFacets={toolbar.facets}
          facetMedium={facetMedium}
          hideListingTypes={shopMode}
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
          <MarketListSkeleton rows={5} />
        </div>
      </div>
    </OsAppScreen>
  );
}
