'use client';

import {
  ChevronDownIcon,
  OsAppChromeToolbarRail,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
} from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import { MarketFilterMenu, marketFilterTriggerLabel } from '@/features/market/market-filter-menu';
import {
  MARKET_LISTING_FILTERS,
  listingFilterFromSort,
  type MarketListingFilter,
} from '@/features/market/market-listing-filter';
import { MarketListingSortMenu } from '@/features/market/market-listing-sort-menu';
import type { MarketListingSort } from '@/features/market/market-listings';
import type { MarketMediumFilter } from '@/features/market/market-medium';
import type { MarketPageQuery } from '@/lib/load-market-page';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';

const SORT_LABELS: Record<MarketListingSort, string> = {
  newest: 'Newest',
  'price-asc': 'Price ↑',
  'price-desc': 'Price ↓',
  ending: 'Ending soon',
};

export function marketToolbarFromQuery(query: MarketPageQuery): {
  listingFilter: MarketListingFilter;
  listingSort: MarketListingSort;
  medium: MarketMediumFilter;
  audioFormat: MarketAudioFormatFilter;
  selectedFacets: string[];
  facetMedium: ReturnType<typeof normalizeDropFacetMedium>;
} {
  return {
    listingFilter: listingFilterFromSort(query.sort),
    listingSort: query.sort,
    medium: query.kind,
    audioFormat: query.audioFormat,
    selectedFacets: query.facets,
    facetMedium: normalizeDropFacetMedium(query.kind),
  };
}

/**
 * Listing-type + Filter + Sort rail. Live menus on the ready panel; inert
 * clone on the loading shell so chrome height does not jump.
 */
export function MarketListingToolbar({
  listingFilter,
  listingSort,
  medium,
  audioFormat,
  selectedFacets,
  facetMedium,
  inert = false,
  ready = false,
  onListingFilterChange,
  onSortChange,
  onMediumChange,
  onAudioFormatChange,
  onFacetsChange,
  onClear,
  onMenuOpenChange,
}: {
  listingFilter: MarketListingFilter;
  listingSort: MarketListingSort;
  medium: MarketMediumFilter;
  audioFormat: MarketAudioFormatFilter;
  selectedFacets: string[];
  facetMedium: ReturnType<typeof normalizeDropFacetMedium>;
  inert?: boolean;
  ready?: boolean;
  onListingFilterChange?: (filter: MarketListingFilter) => void;
  onSortChange?: (sort: MarketListingSort) => void;
  onMediumChange?: (medium: MarketMediumFilter) => void;
  onAudioFormatChange?: (format: MarketAudioFormatFilter) => void;
  onFacetsChange?: (facets: string[]) => void;
  onClear?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const filterLabel = marketFilterTriggerLabel({
    medium,
    audioFormat,
    selectedFacets,
    facetMedium,
  });

  return (
    <OsAppChromeToolbarRail
      className="market-listing-toolbar"
      data-market-ready={ready ? '' : undefined}
      data-market-loading={inert ? '' : undefined}
      aria-hidden={inert || undefined}
      style={inert ? { pointerEvents: 'none' } : undefined}
    >
      <div className="market-listing-filter-stack">
        <OsChipRail
          className="market-listing-filters"
          ariaLabel="Listing type"
          value={listingFilter}
          onValueChange={onListingFilterChange ?? (() => undefined)}
          disabled={inert}
          tabIdFor={(id) => `market-listing-tab-${id}`}
          ariaControls="market-listing-results"
          items={MARKET_LISTING_FILTERS.map((tab) => ({
            id: tab.id,
            label: tab.label,
          }))}
        />
      </div>
      {inert ? (
        <>
          <div className="standing-view-menu market-listing-sort-menu">
            <button
              type="button"
              className={osFloatingPanelTriggerClassName}
              disabled
              aria-haspopup="dialog"
              aria-expanded={false}
              aria-label={`Open filter menu, ${filterLabel}`}
            >
              <span className={osFloatingPanelTriggerLabelClassName}>
                {filterLabel}
              </span>
              <span className={osFloatingPanelTriggerMetaClassName}>
                <ChevronDownIcon
                  className={osFloatingPanelTriggerChevronClassName}
                  aria-hidden
                />
              </span>
            </button>
          </div>
          <div className="standing-view-menu market-listing-sort-menu">
            <button
              type="button"
              className={osFloatingPanelTriggerClassName}
              disabled
              aria-haspopup="dialog"
              aria-expanded={false}
              aria-label="Open sort menu"
            >
              <span className={osFloatingPanelTriggerLabelClassName}>
                {SORT_LABELS[listingSort]}
              </span>
              <span className={osFloatingPanelTriggerMetaClassName}>
                <ChevronDownIcon
                  className={osFloatingPanelTriggerChevronClassName}
                  aria-hidden
                />
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          <MarketFilterMenu
            medium={medium}
            onMediumChange={onMediumChange ?? (() => undefined)}
            facetMedium={facetMedium}
            audioFormat={audioFormat}
            selectedFacets={selectedFacets}
            onAudioFormatChange={onAudioFormatChange ?? (() => undefined)}
            onFacetsChange={onFacetsChange ?? (() => undefined)}
            onClear={onClear ?? (() => undefined)}
            onOpenChange={onMenuOpenChange}
          />
          <MarketListingSortMenu
            sort={listingSort}
            onSortChange={onSortChange ?? (() => undefined)}
            endingDisabled={listingFilter === 'fixed'}
            onOpenChange={onMenuOpenChange}
          />
        </>
      )}
    </OsAppChromeToolbarRail>
  );
}
