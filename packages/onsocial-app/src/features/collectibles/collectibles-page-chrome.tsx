'use client';

import { useCallback, useState } from 'react';
import { OsAppChromeToolbarRail, StarsCFillIcon } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsChipRail } from '@/components/os/os-chip-rail';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import {
  MarketFilterMenu,
  type VaultFilterChip,
} from '@/features/market/market-filter-menu';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';
import {
  COLLECTIBLES_LIBRARY_JUMP_MIN,
  type CollectiblesLibrarySort,
  vaultHeldKindFilters,
} from '@/lib/portfolio-holdings';

/** Search field with Collectibles icon — same heading slot as Market. */
export function CollectiblesSearchHeading({
  query = '',
  onQueryChange,
  interactive = true,
}: {
  query?: string;
  onQueryChange?: (value: string) => void;
  interactive?: boolean;
}) {
  return (
    <OsAppChromeNavSearch
      value={query}
      onValueChange={
        interactive && onQueryChange ? onQueryChange : () => undefined
      }
      placeholder="Search collectibles"
      clearAriaLabel="Clear search"
      ariaLabel="Search collectibles"
      idleClassName="discover-nav-search-field"
      leadingIcon={<StarsCFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}

/**
 * Kind rail + Filter drawer. Keep the live Filter menu mounted while the
 * library skeletons so an open drawer is not swapped for a dummy trigger.
 */
export function CollectiblesFilterToolbar({
  medium,
  audioFormat,
  selectedFacets,
  inert = false,
  ready = false,
  onMediumChange,
  onAudioFormatChange,
  onFacetsChange,
  onClear,
  onMenuOpenChange,
  vaultCreators = [],
  vaultSeries = [],
  selectedCreator = null,
  selectedSeries = null,
  onCreatorChange,
  onSeriesChange,
  sort = 'newest',
  onSortChange,
  jumpCreators = [],
  heldKinds,
}: {
  medium: MarketMediumFilter;
  audioFormat: MarketAudioFormatFilter;
  selectedFacets: string[];
  inert?: boolean;
  ready?: boolean;
  onMediumChange?: (medium: MarketMediumFilter) => void;
  onAudioFormatChange?: (format: MarketAudioFormatFilter) => void;
  onFacetsChange?: (facets: string[]) => void;
  onClear?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  vaultCreators?: VaultFilterChip[];
  vaultSeries?: VaultFilterChip[];
  selectedCreator?: string | null;
  selectedSeries?: string | null;
  onCreatorChange?: (creator: string | null) => void;
  onSeriesChange?: (series: string | null) => void;
  sort?: CollectiblesLibrarySort;
  onSortChange?: (sort: CollectiblesLibrarySort) => void;
  jumpCreators?: VaultFilterChip[];
  /** All + kinds in this vault. Omit → All + the active URL kind. */
  heldKinds?: MarketMediumFilter[];
}) {
  const allowKinds = new Set<MarketMediumFilter>(
    heldKinds && heldKinds.length > 0
      ? heldKinds
      : vaultHeldKindFilters([], medium)
  );
  allowKinds.add('all');
  allowKinds.add(medium);
  const kindRailItems = MARKET_MEDIUM_FILTERS.filter((tab) =>
    allowKinds.has(tab.id)
  ).map((tab) => ({
    id: tab.id,
    label: tab.label,
  }));
  const facetMedium = normalizeDropFacetMedium(medium);
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
      className="market-listing-toolbar collectibles-filter-toolbar"
      data-collectibles-ready={ready ? '' : undefined}
      data-collectibles-loading={inert ? '' : undefined}
      aria-hidden={shellInert || undefined}
      style={shellInert ? { pointerEvents: 'none' } : undefined}
    >
      <div className="market-listing-filter-stack">
        <OsChipRail
          className="market-listing-filters"
          ariaLabel="Collectible kind"
          value={medium}
          onValueChange={onMediumChange ?? (() => undefined)}
          disabled={shellInert}
          tabIdFor={(id) => `collectibles-kind-tab-${id}`}
          ariaControls="collectibles-results"
          items={kindRailItems}
        />
      </div>
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
        vaultCreators={vaultCreators}
        vaultSeries={vaultSeries}
        selectedCreator={selectedCreator}
        selectedSeries={selectedSeries}
        onCreatorChange={onCreatorChange}
        onSeriesChange={onSeriesChange}
        sort={sort}
        onSortChange={onSortChange}
        jumpCreators={
          jumpCreators.length >= COLLECTIBLES_LIBRARY_JUMP_MIN
            ? jumpCreators
            : []
        }
      />
    </OsAppChromeToolbarRail>
  );
}
