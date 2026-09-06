'use client';

import {
  ChevronDownIcon,
  OsAppChromeToolbarRail,
  StarsCFillIcon,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
} from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsChipRail } from '@/components/os/os-chip-rail';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import {
  MarketFilterMenu,
  marketFilterTriggerLabel,
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
 * Kind rail + Filter drawer. Live menus on the ready panel; inert clone on
 * the loading shell so chrome height does not jump.
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
}) {
  const facetMedium = normalizeDropFacetMedium(medium);
  const creatorLabel =
    selectedCreator &&
    (vaultCreators.find((entry) => entry.id === selectedCreator)?.label ??
      selectedCreator);
  const seriesLabel =
    selectedSeries &&
    (vaultSeries.find((entry) => entry.id === selectedSeries)?.label ??
      selectedSeries);
  const filterLabel = marketFilterTriggerLabel({
    medium,
    audioFormat,
    selectedFacets,
    facetMedium,
    creatorLabel: creatorLabel || null,
    seriesLabel: seriesLabel || null,
    sort,
  });

  return (
    <OsAppChromeToolbarRail
      className="market-listing-toolbar collectibles-filter-toolbar"
      data-collectibles-ready={ready ? '' : undefined}
      data-collectibles-loading={inert ? '' : undefined}
      aria-hidden={inert || undefined}
      style={inert ? { pointerEvents: 'none' } : undefined}
    >
      <div className="market-listing-filter-stack">
        <OsChipRail
          className="market-listing-filters"
          ariaLabel="Collectible kind"
          value={medium}
          onValueChange={onMediumChange ?? (() => undefined)}
          disabled={inert}
          tabIdFor={(id) => `collectibles-kind-tab-${id}`}
          ariaControls="collectibles-results"
          items={MARKET_MEDIUM_FILTERS.map((tab) => ({
            id: tab.id,
            label: tab.label,
          }))}
        />
      </div>
      {inert ? (
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
      ) : (
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
      )}
    </OsAppChromeToolbarRail>
  );
}
