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
import type { DropAudioFormatFilter, DropsSort } from '@/features/drops/drops-data';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import {
  MarketFilterMenu,
  marketFilterTriggerLabel,
} from '@/features/market/market-filter-menu';
import type { MarketMediumFilter } from '@/features/market/market-medium';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';

export const DROPS_BASE_SORTS: ReadonlyArray<{ id: DropsSort; label: string }> =
  [
    { id: 'live', label: 'Live' },
    { id: 'closing', label: 'Closing' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'new', label: 'New' },
    { id: 'loved', label: 'Loved' },
    { id: 'traded', label: 'Traded' },
    { id: 'finished', label: 'Finished' },
  ];

/**
 * Sort rail + Filter. Live menus on the ready panel; inert clone on the
 * loading shell so chrome height does not jump. Saved stays off the loading
 * rail — it only appears when a wallet is connected.
 */
export function DropsListingToolbar({
  sort,
  medium,
  audioFormat,
  showSaved = false,
  inert = false,
  ready = false,
  onSortChange,
  onMediumChange,
  onAudioFormatChange,
  onClear,
  onMenuOpenChange,
}: {
  sort: DropsSort;
  medium: MarketMediumFilter;
  audioFormat: DropAudioFormatFilter | MarketAudioFormatFilter;
  showSaved?: boolean;
  inert?: boolean;
  ready?: boolean;
  onSortChange?: (sort: DropsSort) => void;
  onMediumChange?: (medium: MarketMediumFilter) => void;
  onAudioFormatChange?: (format: MarketAudioFormatFilter) => void;
  onClear?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const facetMedium = normalizeDropFacetMedium(medium);
  const filterLabel = marketFilterTriggerLabel({
    medium,
    audioFormat,
    selectedFacets: [],
    facetMedium,
  });
  const sorts = showSaved
    ? [...DROPS_BASE_SORTS, { id: 'saved' as const, label: 'Saved' }]
    : DROPS_BASE_SORTS;

  return (
    <OsAppChromeToolbarRail
      className="market-listing-toolbar"
      data-drops-ready={ready ? '' : undefined}
      data-drops-loading={inert ? '' : undefined}
      aria-hidden={inert || undefined}
      style={inert ? { pointerEvents: 'none' } : undefined}
    >
      <div className="market-listing-filter-stack">
        <OsChipRail
          className="market-listing-filters"
          ariaLabel="Drop sort"
          value={sort}
          onValueChange={onSortChange ?? (() => undefined)}
          disabled={inert}
          tabIdFor={(id) => `drops-sort-tab-${id}`}
          items={sorts.map((entry) => ({
            id: entry.id,
            label: entry.label,
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
          selectedFacets={[]}
          onAudioFormatChange={onAudioFormatChange ?? (() => undefined)}
          onFacetsChange={() => undefined}
          onClear={onClear ?? (() => undefined)}
          onOpenChange={onMenuOpenChange}
          showFacets={false}
        />
      )}
    </OsAppChromeToolbarRail>
  );
}
