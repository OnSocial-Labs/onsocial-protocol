'use client';

import {
  dropFacetFieldLabel,
  dropFacetSuggestionsForMedium,
  type DropFacetMedium,
} from '@/features/scarces/drop-facets';

export type MarketAudioFormatFilter = 'single' | 'album' | 'podcast' | null;

const AUDIO_FORMAT_CHIPS: ReadonlyArray<{
  id: MarketAudioFormatFilter;
  label: string;
}> = [
  { id: null, label: 'All' },
  { id: 'single', label: 'Single' },
  { id: 'album', label: 'Album' },
  // Podcast is parsed when stamped; hide until creators ship podcast drops.
];

interface MarketFacetRailProps {
  medium: DropFacetMedium;
  audioFormat: MarketAudioFormatFilter;
  selectedFacets: string[];
  onAudioFormatChange: (format: MarketAudioFormatFilter) => void;
  onFacetsChange: (facets: string[]) => void;
}

/**
 * Secondary discovery chips under Market / Collectibles medium filters —
 * audio release format + genre/subject facets (OR when multi-select).
 */
export function MarketFacetRail({
  medium,
  audioFormat,
  selectedFacets,
  onAudioFormatChange,
  onFacetsChange,
}: MarketFacetRailProps) {
  const suggestions = dropFacetSuggestionsForMedium(medium);
  const showFormat = medium === 'audio';

  const toggleFacet = (id: string) => {
    if (selectedFacets.includes(id)) {
      onFacetsChange(selectedFacets.filter((slug) => slug !== id));
      return;
    }
    onFacetsChange([...selectedFacets, id]);
  };

  if (!showFormat && suggestions.length === 0) return null;

  return (
    <div className="market-facet-rail" aria-label="Discovery filters">
      {showFormat ? (
        <div
          className="discover-tab-bar market-facet-rail-row"
          role="tablist"
          aria-label="Release format"
        >
          <div className="discover-tab-bar-scroller">
            {AUDIO_FORMAT_CHIPS.map((chip) => {
              const active = audioFormat === chip.id;
              return (
                <button
                  key={chip.label}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? 'is-active' : undefined}
                  onClick={() => onAudioFormatChange(chip.id)}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {suggestions.length > 0 ? (
        <div
          className="discover-tab-bar market-facet-rail-row"
          role="group"
          aria-label={dropFacetFieldLabel(medium)}
        >
          <div className="discover-tab-bar-scroller">
            {suggestions.map((entry) => {
              const active = selectedFacets.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={active}
                  className={active ? 'is-active' : undefined}
                  onClick={() => toggleFacet(entry.id)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
