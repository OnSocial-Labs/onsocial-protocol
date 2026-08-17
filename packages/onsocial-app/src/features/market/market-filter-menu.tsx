'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDownIcon,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
} from '@onsocial/ui';
import { ActionDrawer } from '@/components/ui/action-drawer';
import { OsChipRail } from '@/components/os/os-chip-rail';
import {
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import type { MarketAudioFormatFilter } from '@/features/market/market-facet-rail';
import {
  MARKET_MEDIUM_FILTERS,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import {
  dropFacetFieldLabel,
  dropFacetSuggestionsForMedium,
  type DropFacetMedium,
} from '@/features/scarces/drop-facets';

const AUDIO_FORMAT_OPTIONS: ReadonlyArray<{
  id: MarketAudioFormatFilter;
  label: string;
}> = [
  { id: null, label: 'All' },
  { id: 'single', label: 'Single' },
  { id: 'album', label: 'Album' },
  { id: 'podcast', label: 'Podcast' },
];

function mediumLabel(medium: MarketMediumFilter): string {
  return (
    MARKET_MEDIUM_FILTERS.find((entry) => entry.id === medium)?.label ?? medium
  );
}

function facetLabel(medium: DropFacetMedium, facetId: string): string {
  const hit = dropFacetSuggestionsForMedium(medium).find(
    (entry) => entry.id === facetId
  );
  return hit?.label ?? facetId;
}

/** Trigger copy — "Filter" when open catalog; summary when narrowed. */
export function marketFilterTriggerLabel(opts: {
  medium: MarketMediumFilter;
  audioFormat: MarketAudioFormatFilter;
  selectedFacets: string[];
  facetMedium: DropFacetMedium | null;
}): string {
  if (opts.medium === 'all') return 'Filter';
  const parts = [mediumLabel(opts.medium)];
  if (opts.audioFormat) {
    parts.push(
      AUDIO_FORMAT_OPTIONS.find((entry) => entry.id === opts.audioFormat)
        ?.label ?? opts.audioFormat
    );
  }
  if (opts.facetMedium && opts.selectedFacets.length === 1) {
    parts.push(facetLabel(opts.facetMedium, opts.selectedFacets[0]!));
  } else if (opts.selectedFacets.length > 1) {
    parts.push(String(opts.selectedFacets.length));
  }
  return parts.join(' · ');
}

/**
 * Market discovery filter — medium + format/genres in one ActionDrawer.
 * Genres stay as chip rails (same density as the old facet row), not buried
 * under a long medium radio list.
 */
export function MarketFilterMenu({
  medium,
  onMediumChange,
  facetMedium,
  audioFormat,
  selectedFacets,
  onAudioFormatChange,
  onFacetsChange,
  onClear,
  onOpenChange,
}: {
  medium: MarketMediumFilter;
  onMediumChange: (medium: MarketMediumFilter) => void;
  facetMedium: DropFacetMedium | null;
  audioFormat: MarketAudioFormatFilter;
  selectedFacets: string[];
  onAudioFormatChange: (format: MarketAudioFormatFilter) => void;
  onFacetsChange: (facets: string[]) => void;
  onClear: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const triggerLabel = marketFilterTriggerLabel({
    medium,
    audioFormat,
    selectedFacets,
    facetMedium,
  });
  const narrowed =
    medium !== 'all' || selectedFacets.length > 0 || Boolean(audioFormat);
  const suggestions = facetMedium
    ? dropFacetSuggestionsForMedium(facetMedium)
    : [];
  const showFormat = facetMedium === 'audio';

  useEffect(() => {
    onOpenChange?.(sheetOpen);
    return () => onOpenChange?.(false);
  }, [onOpenChange, sheetOpen]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  const toggleFacet = (id: string) => {
    if (selectedFacets.includes(id)) {
      onFacetsChange(selectedFacets.filter((slug) => slug !== id));
      return;
    }
    onFacetsChange([...selectedFacets, id]);
  };

  return (
    <div className="standing-view-menu market-listing-sort-menu">
      <button
        type="button"
        className={`${osFloatingPanelTriggerClassName}${
          sheetOpen ? ' is-open' : ''
        }`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label={
          sheetOpen ? 'Close filter menu' : `Open filter menu, ${triggerLabel}`
        }
      >
        <span className={osFloatingPanelTriggerLabelClassName}>
          {triggerLabel}
        </span>
        <span className={osFloatingPanelTriggerMetaClassName}>
          <ChevronDownIcon
            className={`${osFloatingPanelTriggerChevronClassName}${
              sheetOpen ? ' is-open' : ''
            }`}
            aria-hidden
          />
        </span>
      </button>

      <ActionDrawer
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label="Filter"
        closeAriaLabel="Close filter"
        titleAccessory={
          narrowed ? (
            <button
              type="button"
              className="market-filter-title-clear"
              onClick={onClear}
            >
              Clear
            </button>
          ) : null
        }
        panelClassName="market-filter-sheet-panel"
        bodyClassName="market-filter-sheet-body"
        footer={
          <div className="market-filter-sheet-footer">
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                onClick={requestClose}
              >
                Done
              </OsSheetAction>
            </OsSheetActions>
          </div>
        }
      >
        <div className="market-filter-sheet">
          <section className="market-filter-sheet-block" aria-label="Medium">
            <p className="os-choice-sheet-section-title">Medium</p>
            <OsChipRail
              selection="option"
              className="market-filter-chip-row"
              ariaLabel="Medium"
              value={medium}
              onValueChange={onMediumChange}
              items={MARKET_MEDIUM_FILTERS.map((entry) => ({
                id: entry.id,
                label: entry.label,
              }))}
            />
          </section>

          {showFormat ? (
            <section className="market-filter-sheet-block" aria-label="Format">
              <p className="os-choice-sheet-section-title">Format</p>
              <OsChipRail
                className="market-filter-chip-row"
                ariaLabel="Release format"
                value={audioFormat}
                onValueChange={onAudioFormatChange}
                items={AUDIO_FORMAT_OPTIONS.map((entry) => ({
                  id: entry.id,
                  label: entry.label,
                  key: entry.label,
                }))}
              />
            </section>
          ) : null}

          {suggestions.length > 0 && facetMedium ? (
            <section
              className="market-filter-sheet-block"
              aria-label={dropFacetFieldLabel(facetMedium)}
            >
              <p className="os-choice-sheet-section-title">
                {dropFacetFieldLabel(facetMedium)}
              </p>
              <OsChipRail
                selection="multi"
                className="market-filter-chip-row"
                scrollerClassName="market-filter-chip-wrap"
                ariaLabel={dropFacetFieldLabel(facetMedium)}
                values={selectedFacets}
                onToggle={toggleFacet}
                items={suggestions.map((entry) => ({
                  id: entry.id,
                  label: entry.label,
                }))}
              />
            </section>
          ) : null}
        </div>
      </ActionDrawer>
    </div>
  );
}
