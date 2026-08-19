'use client';

/**
 * Quiet browse chips for Discover community tabs (guild topics, hub categories).
 * Reuses Trending chip language; active chip is selected state only.
 */
export function DiscoverBrowseChipRail({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  value: string;
  onChange: (next: string) => void;
}) {
  if (options.length <= 1) return null;

  return (
    <div
      className="discover-browse-chips discover-trending-chips"
      role="toolbar"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={`discover-trending-chip discover-browse-chip${
              selected ? ' is-selected' : ''
            }`}
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
