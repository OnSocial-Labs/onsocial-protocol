'use client';

/**
 * One horizontal slider row of suggestion chips (pick) for hub/guild topics.
 */
export function TopicSuggestionSlider({
  ariaLabel,
  suggestions,
  selected,
  atMax,
  disabled = false,
  onToggle,
}: {
  ariaLabel: string;
  suggestions: ReadonlyArray<{ id: string; label: string }>;
  selected: ReadonlyArray<string>;
  atMax: boolean;
  disabled?: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className="topic-chip-slider app-storage-presets"
      role="group"
      aria-label={ariaLabel}
    >
      {suggestions.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className={`os-surface-chip topic-chip-slider-chip${
              isSelected ? ' is-selected' : ''
            }`}
            disabled={disabled || (!isSelected && atMax)}
            aria-pressed={isSelected}
            onClick={() => onToggle(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
