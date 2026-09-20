'use client';

import { useCallback, useState } from 'react';
import { OsAppChromeToolbarRail } from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import type {
  DropAudioFormatFilter,
  DropsSort,
} from '@/features/drops/drops-data';
import { DROPS_SORT_LABELS } from '@/features/drops/drops-catalog-layout';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import { MarketFilterMenu } from '@/features/market/market-filter-menu';
import type { MarketMediumFilter } from '@/features/market/market-medium';
import { normalizeDropFacetMedium } from '@/features/scarces/drop-facets';

export const DROPS_BASE_SORTS = DROPS_SORT_LABELS.filter(
  (entry) => entry.id !== 'saved'
);

/**
 * Sort rail + Filter. Keep the live Filter menu mounted while listings
 * skeleton so an open drawer is not swapped for a dummy trigger.
 * Saved stays off the loading rail — it only appears when a wallet is connected.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const shellInert = inert && !menuOpen;
  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      onMenuOpenChange?.(open);
    },
    [onMenuOpenChange]
  );
  const sorts = showSaved
    ? [...DROPS_BASE_SORTS, { id: 'saved' as const, label: 'Saved' }]
    : DROPS_BASE_SORTS;

  return (
    <OsAppChromeToolbarRail
      className="market-listing-toolbar"
      data-drops-ready={ready ? '' : undefined}
      data-drops-loading={inert ? '' : undefined}
      aria-hidden={shellInert || undefined}
      style={shellInert ? { pointerEvents: 'none' } : undefined}
    >
      <div className="market-listing-filter-stack">
        <OsChipRail
          className="market-listing-filters"
          ariaLabel="Drop sort"
          value={sort}
          onValueChange={onSortChange ?? (() => undefined)}
          disabled={shellInert}
          tabIdFor={(id) => `drops-sort-tab-${id}`}
          items={sorts.map((entry) => ({
            id: entry.id,
            label: entry.label,
          }))}
        />
      </div>
      <MarketFilterMenu
        medium={medium}
        onMediumChange={onMediumChange ?? (() => undefined)}
        facetMedium={facetMedium}
        audioFormat={audioFormat}
        selectedFacets={[]}
        onAudioFormatChange={onAudioFormatChange ?? (() => undefined)}
        onFacetsChange={() => undefined}
        onClear={onClear ?? (() => undefined)}
        onOpenChange={handleMenuOpenChange}
        disabled={shellInert}
        showFacets={false}
      />
    </OsAppChromeToolbarRail>
  );
}
