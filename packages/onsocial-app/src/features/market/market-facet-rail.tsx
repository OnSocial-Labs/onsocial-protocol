'use client';

import { OsChipRail } from '@/components/os/os-chip-rail';
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
  { id: 'podcast', label: 'Podcast' },
];

interface MarketFacetRailProps {
  medium: DropFacetMedium;
  audioFormat: MarketAudioFormatFilter;
  selectedFacets: string[];
  onAudioFormatChange: (format: MarketAudioFormatFilter) => void;
  onFacetsChange: (facets: string[]) => void;
  /** When false, hide genre/subject chips (format only). Default true. */
  showFacets?: boolean;
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
  showFacets = true,
}: MarketFacetRailProps) {
  const suggestions = showFacets
    ? dropFacetSuggestionsForMedium(medium)
    : [];
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
        <OsChipRail
          className="market-facet-rail-row"
          ariaLabel="Release format"
          value={audioFormat}
          onValueChange={onAudioFormatChange}
          items={AUDIO_FORMAT_CHIPS.map((chip) => ({
            id: chip.id,
            label: chip.label,
            key: chip.label,
          }))}
        />
      ) : null}
      {suggestions.length > 0 ? (
        <OsChipRail
          selection="multi"
          className="market-facet-rail-row"
          ariaLabel={dropFacetFieldLabel(medium)}
          values={selectedFacets}
          onToggle={toggleFacet}
          items={suggestions.map((entry) => ({
            id: entry.id,
            label: entry.label,
          }))}
        />
      ) : null}
    </div>
  );
}
