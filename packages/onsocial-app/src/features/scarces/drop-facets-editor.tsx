'use client';

import {
  DROP_MAX_FACETS,
  dropFacetFieldLabel,
  dropFacetLabel,
  dropFacetSuggestionsForMedium,
  normalizeDropFacets,
  type DropFacetMedium,
} from '@/features/scarces/drop-facets';

interface DropFacetsEditorProps {
  medium: DropFacetMedium;
  facets: string[];
  onChange: (facets: string[]) => void;
  disabled?: boolean;
  /** Accessible name for the chip group. */
  label?: string;
}

/**
 * Controlled facet chips for create-drop — closed vocab only (no free-type)
 * so market discovery filters stay reliable.
 */
export function DropFacetsEditor({
  medium,
  facets,
  onChange,
  disabled = false,
  label = dropFacetFieldLabel(medium),
}: DropFacetsEditorProps) {
  const suggestions = dropFacetSuggestionsForMedium(medium);
  const selected = normalizeDropFacets(facets, medium);
  const atMax = selected.length >= DROP_MAX_FACETS;

  const toggle = (id: string) => {
    if (disabled) return;
    if (selected.includes(id)) {
      onChange(selected.filter((slug) => slug !== id));
      return;
    }
    if (atMax) return;
    onChange(normalizeDropFacets([...selected, id], medium));
  };

  if (suggestions.length === 0) return null;

  return (
    <div className="guild-field">
      <span>
        {label}
        <span className="drop-facets-optional"> optional</span>
      </span>
      <div
        className="app-storage-presets drop-facets-chip-row"
        role="group"
        aria-label={label}
      >
        {suggestions.map((entry) => {
          const isSelected = selected.includes(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              className={`os-surface-chip${isSelected ? ' is-selected' : ''}`}
              disabled={disabled || (!isSelected && atMax)}
              aria-pressed={isSelected}
              onClick={() => toggle(entry.id)}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      {selected.length > 0 ? (
        <small>
          {selected.map((slug) => dropFacetLabel(slug) ?? slug).join(' · ')}
          {atMax ? ` · max ${DROP_MAX_FACETS}` : ''}
        </small>
      ) : (
        <small>Up to {DROP_MAX_FACETS} — helps people find this drop.</small>
      )}
    </div>
  );
}
