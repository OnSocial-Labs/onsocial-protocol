'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  ChevronDownIcon,
  Divider,
  GlassSheet,
  SheetCloseButton,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useScrollLock } from '@/hooks/use-scroll-lock';
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
 * Market discovery filter — medium + format/genres in one sheet.
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
  const titleId = useId();
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

  useScrollLock(sheetOpen);

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

      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        tone="os"
        initialDetent="full"
        peekRatio={1}
        zIndex={60}
        ariaLabelledBy={titleId}
        backdropLabel="Close filter"
        panelClassName="scarce-choice-sheet-panel market-filter-sheet-panel"
        bodyClassName="scarce-choice-sheet-body market-filter-sheet-body"
        header={
          <>
            <header className="glass-sheet-header">
              <div className="glass-sheet-header-copy">
                <div className="market-filter-title-row">
                  <h2 id={titleId} className="glass-sheet-header-title">
                    Filter
                  </h2>
                  {narrowed ? (
                    <button
                      type="button"
                      className="market-filter-title-clear"
                      onClick={onClear}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              <SheetCloseButton
                onClick={requestClose}
                ariaLabel="Close filter"
              />
            </header>
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
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
            <p className="scarce-choice-sheet-section-title">Medium</p>
            <div
              className="discover-tab-bar market-filter-chip-row"
              role="listbox"
              aria-label="Medium"
            >
              <div className="discover-tab-bar-scroller">
                {MARKET_MEDIUM_FILTERS.map((entry) => {
                  const selected = entry.id === medium;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={selected ? 'is-active' : undefined}
                      onClick={() => onMediumChange(entry.id)}
                    >
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {showFormat ? (
            <section className="market-filter-sheet-block" aria-label="Format">
              <p className="scarce-choice-sheet-section-title">Format</p>
              <div
                className="discover-tab-bar market-filter-chip-row"
                role="tablist"
                aria-label="Release format"
              >
                <div className="discover-tab-bar-scroller">
                  {AUDIO_FORMAT_OPTIONS.map((entry) => {
                    const selected = audioFormat === entry.id;
                    return (
                      <button
                        key={entry.label}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className={selected ? 'is-active' : undefined}
                        onClick={() => onAudioFormatChange(entry.id)}
                      >
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          {suggestions.length > 0 && facetMedium ? (
            <section
              className="market-filter-sheet-block"
              aria-label={dropFacetFieldLabel(facetMedium)}
            >
              <p className="scarce-choice-sheet-section-title">
                {dropFacetFieldLabel(facetMedium)}
              </p>
              <div
                className="discover-tab-bar market-filter-chip-row"
                role="group"
                aria-label={dropFacetFieldLabel(facetMedium)}
              >
                <div className="discover-tab-bar-scroller market-filter-chip-wrap">
                  {suggestions.map((entry) => {
                    const selected = selectedFacets.includes(entry.id);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={selected}
                        className={selected ? 'is-active' : undefined}
                        onClick={() => toggleFacet(entry.id)}
                      >
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </GlassSheet>
    </div>
  );
}
