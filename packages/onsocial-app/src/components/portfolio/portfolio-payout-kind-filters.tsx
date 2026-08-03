'use client';

export type PortfolioPayoutKindFilterPart<T extends string> = {
  id: T;
  label: string;
  amountLabel: string;
};

/**
 * Header kind split under the payout total — tap to filter the list,
 * tap again to clear (`Sales 2.50 · Royalties 0.62`).
 */
export function PortfolioPayoutKindFilters<T extends string>({
  parts,
  active,
  onChange,
  ariaLabel = 'Filter by kind',
}: {
  parts: ReadonlyArray<PortfolioPayoutKindFilterPart<T>>;
  active: T | null;
  onChange: (next: T | null) => void;
  ariaLabel?: string;
}) {
  if (parts.length === 0) return null;

  return (
    <p className="portfolio-payout-sheet-sub" role="group" aria-label={ariaLabel}>
      {parts.map((part, index) => {
        const selected = active === part.id;
        const dimmed = active != null && !selected;
        return (
          <span key={part.id} className="portfolio-payout-kind-filter-wrap">
            {index > 0 ? (
              <span className="portfolio-payout-kind-sep" aria-hidden>
                {' · '}
              </span>
            ) : null}
            <button
              type="button"
              className={`portfolio-payout-kind-filter${
                selected ? ' is-active' : ''
              }${dimmed ? ' is-dimmed' : ''}`}
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : part.id)}
            >
              {part.label} {part.amountLabel}
            </button>
          </span>
        );
      })}
    </p>
  );
}
