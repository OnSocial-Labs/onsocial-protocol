'use client';

import { useState } from 'react';
import { OsAppChromeNavSearch, OsAppChromeToolbarRail, StarsCFillIcon } from '@onsocial/ui';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { useCollectiblesPanelChrome } from '@/features/collectibles/collectibles-panel-context';
import { MarketFilterMenu } from '@/features/market/market-filter-menu';
import { MARKET_MEDIUM_FILTERS } from '@/features/market/market-medium';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';

/** Search field with Collectibles icon — same heading slot as Market. */
export function CollectiblesSearchHeading() {
  const { searchQuery, setSearchQuery, showDiscoveryChrome } =
    useCollectiblesPanelChrome();

  if (!showDiscoveryChrome) {
    return null;
  }

  return (
    <OsAppChromeNavSearch
      value={searchQuery}
      onValueChange={setSearchQuery}
      placeholder="Search collectibles"
      clearAriaLabel="Clear search"
      ariaLabel="Search collectibles"
      idleClassName="discover-nav-search-field"
      leadingIcon={<StarsCFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}

/** Kind rail + Filter drawer — format/genres live in the sheet (Market parity). */
export function CollectiblesFilterToolbar() {
  const {
    scrollRootRef,
    showDiscoveryChrome,
    mediumFilter,
    setMediumFilter,
    facetMedium,
    selectedFacets,
    audioFormatFilter,
    replaceDiscoveryParams,
  } = useCollectiblesPanelChrome();
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const toolbarHidden = useDockAutoHide(filterMenuOpen, scrollRootRef);

  if (!showDiscoveryChrome) {
    return null;
  }

  return (
    <OsAppChromeToolbarRail
      hidden={toolbarHidden}
      className="market-listing-toolbar collectibles-filter-toolbar"
    >
      <div className="market-listing-filter-stack">
        <OsChipRail
          className="market-listing-filters"
          ariaLabel="Collectible kind"
          value={mediumFilter}
          onValueChange={setMediumFilter}
          tabIdFor={(id) => `collectibles-kind-tab-${id}`}
          ariaControls="collectibles-results"
          items={MARKET_MEDIUM_FILTERS.map((tab) => ({
            id: tab.id,
            label: tab.label,
          }))}
        />
      </div>
      <MarketFilterMenu
        medium={mediumFilter}
        onMediumChange={setMediumFilter}
        facetMedium={facetMedium}
        audioFormat={audioFormatFilter}
        selectedFacets={selectedFacets}
        onAudioFormatChange={(format) =>
          replaceDiscoveryParams({ audioFormat: format })
        }
        onFacetsChange={(facets) => replaceDiscoveryParams({ facets })}
        onClear={() => setMediumFilter('all')}
        onOpenChange={setFilterMenuOpen}
      />
    </OsAppChromeToolbarRail>
  );
}
