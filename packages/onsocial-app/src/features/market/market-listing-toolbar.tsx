'use client';

import { useCallback, useState } from 'react';
import { OsAppChromeToolbarRail } from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import { MarketFilterMenu } from '@/features/market/market-filter-menu';
import {
  MARKET_LISTING_FILTERS,
  type MarketListingFilter,
} from '@/features/market/market-listing-filter';
import { MarketListingSortMenu } from '@/features/market/market-listing-sort-menu';
import type { MarketListingSort } from '@/features/market/market-listings';
import type { MarketMediumFilter } from '@/features/market/market-medium';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';

/**
 * Listing-type + Filter + Sort rail. Keep live menus mounted while listings
 * skeleton — swapping them for dummy buttons unmounts an open Filter drawer
 * (Podcast tab) the moment the catalog reloads.
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
  hideListingTypes = false,
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
  /** Creator shop — listing-type chips are browse chrome, not a shop door. */
  hideListingTypes?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const shellInert = inert && !menuOpen;
  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      onMenuOpenChange?.(open);
    },
    [onMenuOpenChange]
  );

  return (
    <OsAppChromeToolbarRail
      className="market-listing-toolbar"
      data-market-ready={ready ? '' : undefined}
      data-market-loading={inert ? '' : undefined}
      aria-hidden={shellInert || undefined}
      style={shellInert ? { pointerEvents: 'none' } : undefined}
    >
      {hideListingTypes ? null : (
        <div className="standing-view-menu market-listing-filter-stack">
          <OsChipRail
            className="market-listing-filters"
            ariaLabel="Listing type"
            value={listingFilter}
            onValueChange={onListingFilterChange ?? (() => undefined)}
            disabled={shellInert}
            tabIdFor={(id) => `market-listing-tab-${id}`}
            ariaControls="market-listing-results"
            items={MARKET_LISTING_FILTERS.map((tab) => ({
              id: tab.id,
              label: tab.label,
            }))}
          />
        </div>
      )}
      <MarketFilterMenu
        medium={medium}
        onMediumChange={onMediumChange ?? (() => undefined)}
        facetMedium={facetMedium}
        audioFormat={audioFormat}
        selectedFacets={selectedFacets}
        onAudioFormatChange={onAudioFormatChange ?? (() => undefined)}
        onFacetsChange={onFacetsChange ?? (() => undefined)}
        onClear={onClear ?? (() => undefined)}
        onOpenChange={handleMenuOpenChange}
        disabled={shellInert}
      />
      <MarketListingSortMenu
        sort={listingSort}
        onSortChange={onSortChange ?? (() => undefined)}
        endingDisabled={listingFilter === 'fixed'}
        onOpenChange={handleMenuOpenChange}
      />
    </OsAppChromeToolbarRail>
  );
}
